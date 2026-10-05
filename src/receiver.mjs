// Final deterministic M1 consumer. This process never forwards activity.
import http from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { validateEvent, parseJson, canonical, digest, appKey, OapError, capabilities } from './protocol.mjs';
import { validateControlRecord as assertSchema } from './control-records.mjs';
import { SystemClock } from './clock.mjs';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MAX_BODY = 16_384;
const LOOPBACK = new Set(['127.0.0.1', '::1']);
const SAFE_MESSAGES = {
  unauthorized: 'The receiving credential or binding is unavailable.',
  expired: 'The original record or authorization deadline has passed.',
  scope_mismatch: 'The record is outside the approved receiving scope.',
  conflicting_duplicate: 'An immutable identity or window conflicts with retained state.',
  invalid_event: 'The activity record is invalid.',
  invalid_request: 'The local receiver setup or request is invalid.',
  incompatible_version: 'The protocol version is unavailable.',
  unsupported_capability: 'The requested capability is unavailable.',
  storage_unavailable: 'The bounded receiver ledger cannot admit this record.',
  temporary_unavailable: 'The receiver is temporarily unavailable.',
  payload_too_large: 'The bounded request size was exceeded.',
  endpoint_unsupported: 'The requested receiving endpoint is unavailable.',
  media_type_unsupported: 'The receiving endpoint requires uncompressed UTF-8 JSON.',
  clock_untrusted: 'A trustworthy local clock is required.'
};
const RETRYABLE = new Set(['storage_unavailable', 'temporary_unavailable', 'rate_limited']);
const STATUS = { unauthorized: 401, scope_mismatch: 403, expired: 410, conflicting_duplicate: 409,
  invalid_event: 422, incompatible_version: 422, unsupported_capability: 422,
  payload_too_large: 413, endpoint_unsupported: 404, media_type_unsupported: 415,
  storage_unavailable: 503, temporary_unavailable: 503, clock_untrusted: 503, rate_limited: 429 };
const clone = value => structuredClone(value);
const hashToken = token => createHash('sha256').update(token, 'utf8').digest('hex');
const iso = ms => new Date(ms).toISOString();
const fail = code => { throw new OapError(code, SAFE_MESSAGES[code] ?? 'The receiving operation was rejected.'); };
const principalKey = credential => `${credential.device_binding_id}\0${credential.authorization.recipient_id}`;
const streamKey = (credential, event) => `${principalKey(credential)}\0${event.stream_id}`;
const eventKey = (credential, event) => `${streamKey(credential, event)}\0${event.event_id}`;
const groupKey = (credential, event) => `${streamKey(credential, event)}\0${event.window.window_id}`;
const bytes = value => Buffer.byteLength(canonical(value), 'utf8');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function createReceiverState() {
  return { version: 2, kind: 'oap-receiver', last_clock: null, credentials: {}, ledger: {}, groups: {}, streams: {} };
}

function stateGuard(state, allowInitial = false) {
  if (allowInitial && state && typeof state === 'object' && !Array.isArray(state) && Object.keys(state).length === 0) {
    Object.assign(state, createReceiverState());
  }
  if (!state || state.version !== 2 || state.kind !== 'oap-receiver' ||
      state.last_clock !== null && (!Number.isSafeInteger(state.last_clock) || state.last_clock < 0) ||
      Object.keys(state).some(k => !['version', 'kind', 'last_clock', 'credentials', 'ledger', 'groups', 'streams'].includes(k))) fail('storage_unavailable');
  for (const k of ['credentials', 'ledger', 'groups', 'streams']) {
    if (!state[k] || typeof state[k] !== 'object' || Array.isArray(state[k])) fail('storage_unavailable');
  }
  if (state.last_clock === null && ['credentials', 'ledger', 'groups', 'streams'].some(k => Object.keys(state[k]).length)) fail('storage_unavailable');
  // Corrupt indexes cannot be used to authorize activity or silently erase a ledger.
  for (const [key, record] of Object.entries(state.credentials)) {
    if (!/^[a-f0-9]{64}$/.test(key) || !record || !uuid.test(record.device_binding_id) ||
        !record.authorization || !Number.isFinite(record.credential_expires_at) || !Number.isFinite(record.issued_at)) fail('storage_unavailable');
    try {
      const a = record.authorization;
      assertSchema('subscription', { protocol_version: '0.1.0', subscription_id: a.subscription_id,
        grant_id: record.device_binding_id, recipient_id: a.recipient_id, stream_id: a.stream_id,
        scope_revision: a.scope_revision, state: 'active', created_at: iso(record.issued_at),
        expires_at: a.expires_at, idempotency_key: record.device_binding_id, scope: a.scope });
      if (Object.keys(a).sort().join(',') !== 'expires_at,recipient_id,scope,scope_revision,stream_id,subscription_id' ||
          record.credential_expires_at > record.issued_at + 30 * DAY || Date.parse(a.expires_at) > record.credential_expires_at ||
          a.scope.applications.some((app, i) => i && appKey(app) <= appKey(a.scope.applications[i - 1]))) fail('storage_unavailable');
    } catch { fail('storage_unavailable'); }
  }
  for (const [key, entry] of Object.entries(state.ledger)) {
    if (!entry || typeof entry.digest !== 'string' || !/^[a-f0-9]{64}$/.test(entry.digest) ||
        !uuid.test(entry.event_id) || !Number.isSafeInteger(entry.sequence) || entry.sequence < 1 ||
        !Number.isFinite(entry.keep_until) || !state.groups[entry.group_key] || typeof key !== 'string') fail('storage_unavailable');
  }
  for (const group of Object.values(state.groups)) {
    if (!group || !group.metadata || !group.pages || typeof group.pages !== 'object' || Array.isArray(group.pages) ||
        !Number.isInteger(group.metadata.page_count) || group.metadata.page_count < 1 || group.metadata.page_count > 4) fail('storage_unavailable');
    for (const [index, page] of Object.entries(group.pages)) {
      if (!/^\d$/.test(index) || Number(index) >= group.metadata.page_count || !page ||
          !Array.isArray(page.apps) || !state.ledger[page.ledger_key]) fail('storage_unavailable');
    }
  }
}

function checkClock(state, now, commit = false) {
  if (state.last_clock !== null && now < state.last_clock) fail('clock_untrusted');
  if (commit) state.last_clock = now;
}

function prune(state, now) {
  for (const [key, entry] of Object.entries(state.ledger)) if (entry.keep_until <= now) {
    const group = state.groups[entry.group_key];
    if (group) delete group.pages[String(entry.page_index)];
    delete state.ledger[key];
  }
  for (const [key, group] of Object.entries(state.groups)) {
    if (!Object.keys(group.pages).length) delete state.groups[key];
    else group.complete = Object.keys(group.pages).length === group.metadata.page_count;
  }
  for (const [key, credential] of Object.entries(state.credentials)) {
    if (credential.credential_expires_at <= now) delete state.credentials[key];
  }
  for (const [key, stream] of Object.entries(state.streams)) {
    const groups = Object.entries(state.groups).filter(([, g]) => g.stream_key === key);
    if (!groups.length) { delete state.streams[key]; continue; }
    groups.sort((a, b) => Date.parse(b[1].metadata.window.end) - Date.parse(a[1].metadata.window.end));
    stream.latest_window_id = groups[0][1].metadata.window.window_id;
  }
}

function groupMetadata(event) {
  return {
    recipient_id: event.recipient_id, stream_id: event.stream_id,
    subscription_id: event.subscription_id, scope_revision: event.scope_revision,
    emitted_at: event.emitted_at, expires_at: event.expires_at,
    window: event.window, coverage: event.summary.coverage,
    aggregation_interval_ms: event.summary.aggregation_interval_ms,
    page_count: event.summary.page_count,
    first_sequence: event.sequence - event.summary.page_index
  };
}

function receipt(event, now, disposition) {
  const result = { protocol_version: '0.1.0', event_id: event.event_id,
    recipient_id: event.recipient_id, stream_id: event.stream_id, sequence: event.sequence,
    received_at: iso(now), disposition, validation: 'valid' };
  assertSchema('receipt', result);
  return result;
}

/** Protected setup is local to this final receiver, never a remote consent API. */
export class Receiver {
  constructor({ store, clock = new SystemClock(), maxLedgerBytes = 4_194_304 } = {}) {
    if (!store || typeof store.transaction !== 'function' || typeof store.read !== 'function' ||
        !Number.isSafeInteger(maxLedgerBytes) || maxLedgerBytes < 1 || maxLedgerBytes > 16_777_216) fail('invalid_request');
    this.store = store;
    this.clock = clock;
    this.maxLedgerBytes = maxLedgerBytes;
    this.profile = 'direct-loopback-test-v1';
  }

  now() {
    const now = this.clock.now();
    if (this.clock.trusted && !this.clock.trusted() || !Number.isSafeInteger(now) || now < 0) fail('clock_untrusted');
    return now;
  }

  async configure({ authorization, token, credentialExpiresAt, deviceBindingId = authorization?.recipient_id } = {}) {
    const now = this.now();
    if (typeof token !== 'string' || !/^[A-Za-z0-9._~+/-]{43,512}={0,2}$/.test(token) || !uuid.test(deviceBindingId)) fail('invalid_request');
    const expiry = typeof credentialExpiresAt === 'number' ? credentialExpiresAt : Date.parse(credentialExpiresAt);
    if (!Number.isFinite(expiry) || expiry <= now || expiry > now + 30 * DAY || !authorization ||
        Object.keys(authorization).sort().join(',') !== 'expires_at,recipient_id,scope,scope_revision,stream_id,subscription_id') fail('invalid_request');
    const authorized = clone(authorization);
    assertSchema('subscription', { protocol_version: '0.1.0', subscription_id: authorized.subscription_id,
      grant_id: randomUUID(), recipient_id: authorized.recipient_id, stream_id: authorized.stream_id,
      scope_revision: authorized.scope_revision, state: 'active', created_at: iso(now),
      expires_at: authorized.expires_at, idempotency_key: randomUUID(), scope: authorized.scope });
    const scope = authorized.scope;
    const keys = scope.applications.map(appKey);
    if (!keys.every((k, i) => !i || k > keys[i - 1]) ||
        scope.aggregation_interval_ms < 900_000 * Math.ceil(keys.length / 32) ||
        scope.history_max_age_ms <= scope.aggregation_interval_ms ||
        Date.parse(authorized.expires_at) <= now || Date.parse(authorized.expires_at) > expiry ||
        iso(Date.parse(authorized.expires_at)) !== authorized.expires_at) fail('invalid_request');
    await this.store.transaction(state => {
      if (expiry <= this.now() || Date.parse(authorized.expires_at) <= this.now()) fail('invalid_request');
      stateGuard(state, true);
      checkClock(state, this.now(), true);
      prune(state, now);
      const tokenHash = hashToken(token);
      const existing = state.credentials[tokenHash];
      // Reuse can only update this already verified device/recipient; never transfer a token.
      if (existing && (existing.device_binding_id !== deviceBindingId ||
          existing.authorization.recipient_id !== authorized.recipient_id ||
          expiry > existing.issued_at + 30 * DAY)) fail('unauthorized');
      // Protected receiver setup rotates this principal's bearer atomically.
      // Captured peers and old credentials lose admission without deleting any
      // already-consumed observation or immutable deduplication entry.
      for (const [otherHash, other] of Object.entries(state.credentials)) {
        if (otherHash !== tokenHash && other.device_binding_id === deviceBindingId &&
            other.authorization.recipient_id === authorized.recipient_id) delete state.credentials[otherHash];
      }
      if (!existing && Object.keys(state.credentials).length >= 128) fail('storage_unavailable');
      const namespaces = new Set(scope.applications.map(a => a.namespace));
      for (const [key, other] of Object.entries(state.credentials)) if (key !== tokenHash) {
        for (const app of other.authorization.scope.applications) namespaces.add(app.namespace);
      }
      if (namespaces.size > 128) fail('unsupported_capability');
      state.credentials[tokenHash] = { device_binding_id: deviceBindingId, authorization: authorized,
        issued_at: existing?.issued_at ?? now, credential_expires_at: expiry };
      if (bytes(state) > this.maxLedgerBytes) fail('storage_unavailable');
    });
    return { recipient_id: authorized.recipient_id, credential_expires_at: iso(expiry) };
  }

  async authenticate(token, profile = this.profile) {
    this.now();
    if (typeof token !== 'string' || token.length > 514) fail('unauthorized');
    const state = await this.store.read();
    const now = this.now();
    stateGuard(state);
    checkClock(state, now);
    const tokenHash = hashToken(token);
    // Compare hashes in constant time; no persisted token can itself authenticate.
    const found = Object.keys(state.credentials).find(key => timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(tokenHash, 'hex')));
    const credential = found && state.credentials[found];
    if (!credential || credential.credential_expires_at <= now || Date.parse(credential.authorization.expires_at) <= now) fail('unauthorized');
    return {
      profile_id: profile, recipient_id: credential.authorization.recipient_id,
      verified_at: iso(now), authorization_expires_at: iso(credential.credential_expires_at),
      device_binding_id: credential.device_binding_id, token_hash: found,
      authorization: clone(credential.authorization)
    };
  }

  async getCapabilities() {
    const result = capabilities('receiver', [this.profile]);
    // The deterministic receiver supports only namespaces provisioned in setup.
    const state = await this.store.read();
    stateGuard(state);
    checkClock(state, this.now());
    const namespaces = [...new Set(Object.values(state.credentials).flatMap(c => c.authorization.scope.applications.map(a => a.namespace)))].sort();
    if (namespaces.length) result.application_namespaces = namespaces;
    assertSchema('capabilities', result);
    return result;
  }

  async consume(event, peer, authorization = peer?.authorization) {
    const requestNow = this.now();
    if (!peer || !['direct-loopback-test-v1', 'direct-local-tls-v1', 'direct-https-v1'].includes(peer.profile_id) ||
        !Number.isFinite(Date.parse(peer.authorization_expires_at)) || !Number.isFinite(Date.parse(peer.verified_at)) ||
        Date.parse(peer.authorization_expires_at) <= requestNow || Date.parse(peer.verified_at) > requestNow + 300_000) fail('unauthorized');
    const frozen = clone(event);
    return this.store.transaction(state => {
      const now = this.now();
      stateGuard(state);
      checkClock(state, now, true);
      prune(state, now);
      const credential = peer.token_hash && state.credentials[peer.token_hash];
      if (!credential || credential.credential_expires_at <= now || peer.recipient_id !== credential.authorization.recipient_id ||
          peer.device_binding_id !== credential.device_binding_id ||
          canonical(authorization) !== canonical(credential.authorization)) fail('unauthorized');
      validateEvent(frozen, { now, authorization: credential.authorization });
      const eventDigest = digest(frozen);
      if (Date.parse(frozen.expires_at) > credential.credential_expires_at) fail('scope_mismatch');
      const skey = streamKey(credential, frozen);
      const ekey = eventKey(credential, frozen);
      const gkey = groupKey(credential, frozen);
      const existing = state.ledger[ekey];
      if (existing) {
        if (existing.digest !== eventDigest) fail('conflicting_duplicate');
        return receipt(frozen, now, 'duplicate');
      }
      if (Object.values(state.ledger).some(entry => entry.stream_key === skey && entry.sequence === frozen.sequence)) fail('conflicting_duplicate');
      const metadata = groupMetadata(frozen);
      if (metadata.first_sequence < 1) fail('invalid_event');
      const priorGroup = state.groups[gkey];
      if (priorGroup && (canonical(priorGroup.metadata) !== canonical(metadata) || priorGroup.pages[String(frozen.summary.page_index)])) fail('conflicting_duplicate');
      for (const [key, group] of Object.entries(state.groups)) {
        if (key !== gkey && group.stream_key === skey && Date.parse(group.metadata.window.start) < Date.parse(frozen.window.end) &&
            Date.parse(frozen.window.start) < Date.parse(group.metadata.window.end)) fail('conflicting_duplicate');
      }
      const group = priorGroup ?? { stream_key: skey, metadata, pages: {}, complete: false };
      group.pages[String(frozen.summary.page_index)] = {
        event_id: frozen.event_id, sequence: frozen.sequence, ledger_key: ekey,
        // Labels/extensions do not influence this deterministic observation model.
        apps: frozen.summary.apps.map(a => ({ application: { namespace: a.application.namespace, id: a.application.id },
          foreground_duration_ms: a.foreground_duration_ms }))
      };
      group.complete = Object.keys(group.pages).length === metadata.page_count;
      if (group.complete && !Object.values(group.pages).some(page => page.apps.length)) fail('invalid_event');
      state.groups[gkey] = group;
      state.ledger[ekey] = { event_id: frozen.event_id, stream_key: skey, group_key: gkey,
        page_index: frozen.summary.page_index, sequence: frozen.sequence, digest: eventDigest,
        first_received_at: now, keep_until: Math.max(now + DAY, Date.parse(frozen.expires_at) + 300_000) };
      const stream = state.streams[skey] ?? { highest_sequence: 0, latest_window_id: null };
      stream.highest_sequence = Math.max(stream.highest_sequence, frozen.sequence);
      const latest = Object.values(state.groups).find(g => g.stream_key === skey && g.metadata.window.window_id === stream.latest_window_id);
      if (!latest || Date.parse(frozen.window.end) > Date.parse(latest.metadata.window.end)) stream.latest_window_id = frozen.window.window_id;
      state.streams[skey] = stream;
      // Include every index, credential, group and observation byte in the finite quota.
      if (bytes(state) > this.maxLedgerBytes) fail('storage_unavailable');
      return receipt(frozen, now, 'accepted');
    });
  }

  async snapshot() {
    this.now();
    return this.store.transaction(state => {
      const now = this.now();
      stateGuard(state);
      checkClock(state, now, true);
      prune(state, now);
      const result = { ledger: clone(state.ledger), groups: clone(state.groups), streams: clone(state.streams) };
      for (const [key, stream] of Object.entries(result.streams)) {
        const sequences = Object.values(result.ledger).filter(e => e.stream_key === key).map(e => e.sequence).sort((a, b) => a - b);
        const missing = [];
        let next = 1;
        for (const sequence of sequences) { if (sequence > next) missing.push({ from_sequence: next, to_sequence: sequence - 1 }); next = sequence + 1; }
        stream.missing_ranges = missing.slice(0, 128);
        stream.missing_detail_truncated = missing.length > 128;
      }
      return result;
    });
  }

  async startServer({ host = '127.0.0.1', port = 0, profile = 'direct-loopback-test-v1', tls } = {}) {
    if (!Number.isInteger(port) || port < 0 || port > 65_535) fail('invalid_request');
    if (profile !== 'direct-loopback-test-v1') {
      // Production destination/peer policy must be independently implemented and verified.
      // M1 does not claim it by simply attaching a self-signed certificate.
      fail('unsupported_capability');
    }
    if (!LOOPBACK.has(host) || tls) fail('invalid_request');
    this.profile = profile;
    const server = http.createServer({ maxHeaderSize: 4096 }, async (request, response) => {
      let finished = false;
      const send = (status, body) => {
        if (finished || response.destroyed) return;
        finished = true;
        const raw = canonical(body);
        if (Buffer.byteLength(raw) > (status === 200 && request.method === 'GET' ? MAX_BODY : 4096)) {
          response.destroy(); return;
        }
        response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
          'Content-Length': Buffer.byteLength(raw), 'Connection': 'close' });
        response.end(raw);
      };
      const sendError = error => {
        const code = error?.code && error.code !== 'clock_untrusted' && Object.hasOwn(SAFE_MESSAGES, error.code) ? error.code : 'temporary_unavailable';
        send(STATUS[code] ?? 400, { protocol_version: '0.1.0', code, message: SAFE_MESSAGES[code], retryable: RETRYABLE.has(code) });
      };
      request.setTimeout(10_000, () => {
        sendError({ code: 'temporary_unavailable' }); request.destroy();
      });
      const totalTimer = setTimeout(() => { sendError({ code: 'temporary_unavailable' }); request.destroy(); }, 30_000);
      totalTimer.unref();
      response.once('close', () => clearTimeout(totalTimer));
      try {
        if (request.url !== '/oap/capabilities' && request.url !== '/oap/events') fail('endpoint_unsupported');
        if (request.url === '/oap/capabilities' && request.method !== 'GET' || request.url === '/oap/events' && request.method !== 'POST') {
          send(405, { protocol_version: '0.1.0', code: 'endpoint_unsupported', message: SAFE_MESSAGES.endpoint_unsupported, retryable: false }); return;
        }
        const authHeaders = request.rawHeaders.filter((_, i) => i % 2 === 0 && request.rawHeaders[i].toLowerCase() === 'authorization');
        if (authHeaders.length !== 1 || typeof request.headers.authorization !== 'string' || !/^Bearer [A-Za-z0-9._~+/-]{43,512}={0,2}$/.test(request.headers.authorization)) fail('unauthorized');
        const peer = await this.authenticate(request.headers.authorization.slice(7), profile);
        if (request.method === 'GET') { send(200, await this.getCapabilities()); request.resume(); return; }
        if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'] ?? '') ||
            request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity') fail('media_type_unsupported');
        const length = request.headers['content-length'];
        if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > MAX_BODY)) fail('payload_too_large');
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > MAX_BODY) { sendError({ code: 'payload_too_large' }); request.destroy(); return; }
          chunks.push(chunk);
        }
        const event = parseJson(Buffer.concat(chunks), MAX_BODY);
        send(200, await this.consume(event, peer, peer.authorization));
      } catch (error) { sendError(error); request.resume(); }
    });
    server.requestTimeout = 30_000;
    server.headersTimeout = 10_000;
    server.keepAliveTimeout = 1000;
    server.maxConnections = 8;
    server.on('clientError', (_, socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'));
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.off('error', reject); resolve(); });
    });
    const address = server.address();
    let closePromise;
    return {
      baseUrl: `http://${host === '::1' ? '[::1]' : host}:${address.port}/oap/`,
      close: () => {
        closePromise ??= new Promise((resolve, reject) => {
          server.closeIdleConnections();
          server.close(error => error ? reject(error) : resolve());
          server.closeAllConnections();
        });
        return closePromise;
      }
    };
  }
}
