import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import { isIP } from 'node:net';
import tls from 'node:tls';
import { createHash, timingSafeEqual, X509Certificate } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import ipaddr from 'ipaddr.js';
import { parseJson, canonical, OapError } from './protocol.mjs';
import { validateControlRecord as assertSchema } from './control-records.mjs';
import { SystemClock } from './clock.mjs';
import { pairedDestinationFingerprint } from './pairing.mjs';

const profiles = new Set(['direct-https-v1', 'direct-local-tls-v1', 'direct-loopback-test-v1']);
// IANA IPv6 global unicast allocation snapshot checked 2026-10-04 (registry updated 2025-10-10).
// ipaddr.js performs maintained parsing/special-range classification; additionally reject unallocated space.
// https://www.iana.org/assignments/ipv6-unicast-address-assignments/ipv6-unicast-address-assignments.xhtml
const ipv6Allocations = ['2001:200::/23', '2001:400::/23', '2001:600::/23', '2001:800::/22', '2001:c00::/23',
  '2001:e00::/23', '2001:1200::/23', '2001:1400::/22', '2001:1800::/23', '2001:1a00::/23', '2001:1c00::/22',
  '2001:2000::/19', '2001:4000::/23', '2001:4200::/23', '2001:4400::/23', '2001:4600::/23', '2001:4800::/23',
  '2001:4a00::/23', '2001:4c00::/23', '2001:5000::/20', '2001:8000::/19', '2001:a000::/20', '2001:b000::/20',
  '2003::/18', '2400::/12', '2410::/12', '2600::/12', '2610::/23', '2620::/23', '2630::/12', '2800::/12',
  '2a00::/12', '2a10::/12', '2c00::/12'].map(cidr => ipaddr.parseCIDR(cidr));
const messages = {
  destination_rejected: 'The configured receiver destination or verified peer was rejected.',
  unauthorized: 'The receiver credential is missing, expired, or invalid.',
  scope_mismatch: 'The request does not match the paired receiver scope.',
  expired: 'The event or receiver credential has expired.',
  consent_inactive: 'Local authorization no longer permits this operation.',
  temporary_unavailable: 'The receiver outcome is unavailable or ambiguous.',
  unsupported_capability: 'The receiver does not provide the required capability.',
  payload_too_large: 'The bounded representation exceeds the negotiated capacity.',
  endpoint_unsupported: 'The configured receiver endpoint is unsupported.',
  conflicting_duplicate: 'The receiver rejected a conflicting immutable identity.',
  invalid_event: 'The receiver rejected the event representation.',
  invalid_request: 'The request configuration is invalid.',
  media_type_unsupported: 'The receiver representation is unsupported.',
  rate_limited: 'The receiver has no current admission capacity.',
  storage_unavailable: 'The receiver cannot safely persist the operation.',
  incompatible_version: 'The receiver does not support the selected OAP version.',
  clock_untrusted: 'Trusted local timing is unavailable for this operation.',
};
const fail = (code, options) => new OapError(code, messages[code], options);
const currentTime = clock => typeof clock === 'function' ? clock() : clock.now();
const bareHost = hostname => hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;

function addressIdentity(address) {
  if (typeof address !== 'string' || address.includes('%') || !isIP(address)) throw fail('destination_rejected');
  let parsed = ipaddr.parse(address);
  if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) parsed = parsed.toIPv4Address();
  return { address: parsed.toString(), family: parsed.kind() === 'ipv4' ? 4 : 6, range: parsed.range() };
}

/** Validate the canonical base URL before any lookup or request. */
export function validateDestination(endpoint, profileId, allowLoopbackTest = false) {
  if (!profiles.has(profileId) || typeof endpoint !== 'string' || endpoint.length > 2048 || /[\\%\s]/u.test(endpoint)) {
    throw fail('destination_rejected');
  }
  let url;
  try { url = new URL(endpoint); } catch { throw fail('destination_rejected'); }
  if (url.href !== endpoint || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/')) {
    throw fail('destination_rejected');
  }
  if (profileId === 'direct-loopback-test-v1') {
    if (!allowLoopbackTest || url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw fail('destination_rejected');
    }
  } else if (url.protocol !== 'https:') throw fail('destination_rejected');
  return url;
}

/** Classify through ipaddr.js, normalizing mapped IPv4 before public-address checks. */
export function validateAddress(address, profileId, allowedAddresses = []) {
  const normalized = addressIdentity(address);
  if (profileId === 'direct-https-v1') {
    if (normalized.range !== 'unicast') throw fail('destination_rejected');
    if (normalized.family === 6 && !ipv6Allocations.some(network => ipaddr.parse(normalized.address).match(network))) {
      throw fail('destination_rejected');
    }
  } else if (profileId === 'direct-loopback-test-v1') {
    if (!['127.0.0.1', '::1'].includes(normalized.address)) throw fail('destination_rejected');
  } else if (profileId === 'direct-local-tls-v1') {
    if (!Array.isArray(allowedAddresses) || !allowedAddresses.length || allowedAddresses.length > 32 ||
      !allowedAddresses.some(item => addressIdentity(item).address === normalized.address)) throw fail('destination_rejected');
    if (['unspecified', 'multicast', 'broadcast'].includes(normalized.range)) throw fail('destination_rejected');
  } else throw fail('destination_rejected');
  return normalized;
}

export function parseRetryAfter(value, now) {
  if (typeof value !== 'string' || value.length > 128) return undefined;
  if (/^\d+$/u.test(value)) {
    const seconds = Number(value);
    if (!Number.isSafeInteger(seconds) || seconds > Number.MAX_SAFE_INTEGER / 1000) return undefined;
    return seconds * 1000;
  }
  // RFC 9110 accepts IMF-fixdate and both obsolete HTTP-date forms. Generic Date.parse accepts too much.
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let match = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/u.exec(value);
  let weekday, day, month, year, hour, minute, second;
  if (match) [, weekday, day, month, year, hour, minute, second] = match;
  else {
    match = /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), (\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/u.exec(value);
    if (match) {
      [, weekday, day, month, year, hour, minute, second] = match;
      weekday = weekday.slice(0, 3); year = 2000 + Number(year);
      if (year > new Date(now).getUTCFullYear() + 50) year -= 100;
    } else {
      match = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ( \d|\d{2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/u.exec(value);
      if (!match) return undefined;
      [, weekday, month, day, hour, minute, second, year] = match;
    }
  }
  [day, year, hour, minute, second] = [day, year, hour, minute, second].map(Number);
  if (hour > 23 || minute > 59 || second > 59 || day < 1 || day > 31) return undefined;
  const date = new Date(0);
  date.setUTCFullYear(year, months.indexOf(month), day); date.setUTCHours(hour, minute, second, 0);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() !== year || date.getUTCMonth() !== months.indexOf(month) ||
    date.getUTCDate() !== day || weekdays[date.getUTCDay()] !== weekday) return undefined;
  return Math.max(0, date.getTime() - now);
}

function jsonMediaType(headers) {
  const type = headers['content-type'];
  return typeof type === 'string' && /^application\/json(?:\s*;\s*charset\s*=\s*(?:"utf-8"|utf-8))?\s*$/iu.test(type) &&
    (!headers['content-encoding'] || headers['content-encoding'] === 'identity');
}

function responseError(status, raw, headers, now) {
  if (status >= 300 && status <= 399) return fail('destination_rejected');
  const defaults = { 400: 'invalid_event', 401: 'unauthorized', 403: 'unauthorized', 404: 'endpoint_unsupported',
    405: 'endpoint_unsupported', 409: 'conflicting_duplicate', 410: 'endpoint_unsupported', 413: 'payload_too_large',
    415: 'media_type_unsupported', 422: 'invalid_event', 429: 'rate_limited' };
  let code = defaults[status] ?? 'temporary_unavailable';
  let body;
  try {
    if (jsonMediaType(headers)) { body = parseJson(raw, 4096); assertSchema('error', body); }
  } catch { body = undefined; }
  const permitted = {
    400: ['invalid_event', 'invalid_request'], 403: ['unauthorized', 'scope_mismatch'], 410: ['expired'],
    422: ['invalid_event', 'incompatible_version', 'unsupported_capability'],
    500: ['storage_unavailable', 'temporary_unavailable'], 502: ['storage_unavailable', 'temporary_unavailable'],
    503: ['storage_unavailable', 'temporary_unavailable'], 504: ['storage_unavailable', 'temporary_unavailable'],
  };
  if (body && permitted[status]?.includes(body.code)) code = body.code;
  const httpHint = [429, 503].includes(status) ? parseRetryAfter(headers['retry-after'], now) : undefined;
  const bodyHint = ['rate_limited', 'storage_unavailable', 'temporary_unavailable'].includes(code) ? body?.retry_after_ms : undefined;
  const hints = [httpHint, bodyHint].filter(value => Number.isFinite(value));
  return fail(code, hints.length ? { retryAfterMs: Math.max(...hints) } : undefined);
}

function safeNetworkFailure(error) {
  if (error instanceof OapError) return fail(error.code, { retryAfterMs: error.retryAfterMs, retryable: error.retryable });
  if (/^(?:ERR_TLS|ERR_SSL|ERR_OSSL|CERT_|DEPTH_ZERO|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER|EPROTO)/u.test(error?.code ?? '')) {
    return fail('destination_rejected');
  }
  return fail('temporary_unavailable');
}

export class DirectAdapter {
  constructor({ clock = new SystemClock(), credentialProvider,
    resolver = (hostname, options) => dns.lookup(hostname, options), transport,
    allowLoopbackTest = false, connectTimeoutMs = 10000, totalTimeoutMs = 30000 } = {}) {
    if (!credentialProvider?.get || !Number.isInteger(connectTimeoutMs) || connectTimeoutMs < 1 || connectTimeoutMs > 10000 ||
      !Number.isInteger(totalTimeoutMs) || totalTimeoutMs < 1 || totalTimeoutMs > 30000) throw fail('invalid_request');
    this.clock = clock;
    this.credentialProvider = credentialProvider;
    this.resolver = resolver;
    this.transport = transport;
    this.allowLoopbackTest = allowLoopbackTest;
    this.connectTimeoutMs = connectTimeoutMs;
    this.totalTimeoutMs = totalTimeoutMs;
  }

  #guard(binding, credential, event, signal, beforeSend, destinationFingerprint) {
    if (signal?.aborted) throw fail('consent_inactive');
    if (destinationFingerprint !== undefined && pairedDestinationFingerprint(credential) !== destinationFingerprint) throw fail('destination_rejected');
    if (typeof this.clock.trusted === 'function' && !this.clock.trusted()) throw fail('clock_untrusted');
    const now = currentTime(this.clock);
    if (!Number.isFinite(now)) throw fail('clock_untrusted');
    const expiry = Date.parse(credential.expires_at);
    if (!Number.isFinite(expiry) || expiry <= now || expiry > now + 30 * 86400000 || typeof credential.token !== 'string' ||
      credential.token.length < 43 || credential.token.length > 4096 || !/^[A-Za-z0-9._~+\/-]+=*$/u.test(credential.token)) throw fail('unauthorized');
    for (const key of ['recipient_id', 'stream_id', 'subscription_id', 'scope_revision']) {
      if (credential[key] === undefined || binding[key] !== undefined && credential[key] !== binding[key] ||
          event && credential[key] !== event[key]) throw fail('scope_mismatch');
    }
    if (event && Date.parse(event.expires_at) <= now) throw fail('expired');
    // These callbacks are synchronous and idempotent. No promise may move the fence past socket writes.
    for (const callback of [binding.assertSendAllowed, beforeSend]) {
      if (callback) {
        const result = callback();
        if (result?.then) throw fail('invalid_request');
        if (result === false) throw fail('consent_inactive');
      }
    }
    if (destinationFingerprint !== undefined && pairedDestinationFingerprint(credential) !== destinationFingerprint) throw fail('destination_rejected');
  }

  async #prepare(binding, event, options) {
    if (!binding || typeof binding.recipient_id !== 'string') throw fail('invalid_request');
    if (options.signal?.aborted) throw fail('consent_inactive');
    const credential = await this.credentialProvider.get(binding.recipient_id);
    if (!credential || typeof credential.token !== 'string' || credential.token.length < 43 || credential.token.length > 4096 ||
      !/^[A-Za-z0-9._~+\/-]+=*$/u.test(credential.token) || !Number.isFinite(Date.parse(credential.expires_at)) ||
      Date.parse(credential.expires_at) - currentTime(this.clock) > 30 * 86400000) throw fail('unauthorized');
    const destinationFingerprint = pairedDestinationFingerprint(credential);
    for (const key of ['recipient_id', 'stream_id', 'subscription_id', 'scope_revision']) {
      if (credential[key] === undefined || (binding[key] !== undefined && credential[key] !== binding[key]) ||
        (event && credential[key] !== event[key])) throw fail('scope_mismatch');
    }
    if (binding.profile_id !== undefined && binding.profile_id !== credential.profile_id) throw fail('scope_mismatch');
    if (binding.endpoint !== undefined && binding.endpoint !== credential.endpoint) throw fail('destination_rejected');
    const base = validateDestination(credential.endpoint, credential.profile_id, this.allowLoopbackTest);
    if (credential.profile_id === 'direct-local-tls-v1') {
      if (!credential.tls || (!credential.tls.ca && !credential.tls.peerKeySha256)) throw fail('destination_rejected');
      if (credential.tls.peerKeySha256 && !/^[A-Za-z0-9+/]{43}=$/u.test(credential.tls.peerKeySha256)) throw fail('destination_rejected');
    }
    this.#guard(binding, credential, event, options.signal, undefined, destinationFingerprint);
    const hostname = bareHost(base.hostname);
    const records = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await this.resolver(hostname, { all: true, verbatim: true });
    if (!Array.isArray(records) || records.length < 1 || records.length > 32) throw fail('destination_rejected');
    const addresses = records.map(record => validateAddress(record.address, credential.profile_id, credential.allowedAddresses));
    this.#guard(binding, credential, event, options.signal, undefined, destinationFingerprint);
    return { credential, base, hostname, selected: addresses[0], destinationFingerprint };
  }

  async #perform(route, event, binding, options = {}) {
    const started = performance.now();
    let deadlineTimer, abortPreparation;
    const prepare = this.#prepare(binding, event, options);
    const prepared = await Promise.race([prepare, new Promise((_, reject) => {
      deadlineTimer = setTimeout(() => reject(fail('temporary_unavailable')), Math.min(this.connectTimeoutMs, this.totalTimeoutMs));
      if (options.signal) {
        abortPreparation = () => reject(fail('consent_inactive'));
        if (options.signal.aborted) abortPreparation();
        else options.signal.addEventListener('abort', abortPreparation, { once: true });
      }
    })]).catch(error => { throw safeNetworkFailure(error); }).finally(() => {
      clearTimeout(deadlineTimer);
      if (abortPreparation) options.signal.removeEventListener('abort', abortPreparation);
    });
    const { credential, base, hostname, selected, destinationFingerprint } = prepared;
    const url = new URL(route, base);
    const body = event ? Buffer.from(canonical(event), 'utf8') : undefined;
    const requestLimit = binding.max_event_bytes ?? 16384;
    if (!Number.isInteger(requestLimit) || requestLimit < 1 || requestLimit > 16384) throw fail('invalid_request');
    if (body && body.length > requestLimit) throw fail('payload_too_large');
    const elapsed = performance.now() - started;
    if (elapsed >= this.connectTimeoutMs || elapsed >= this.totalTimeoutMs) throw fail('temporary_unavailable');
    this.#guard(binding, credential, event, options.signal, options.beforeSend, destinationFingerprint);
    return new Promise((resolve, reject) => {
      let request, response, completed = false, connectTimer, totalTimer, written = false;
      const cleanup = () => {
        clearTimeout(connectTimer); clearTimeout(totalTimer);
        if (options.signal) options.signal.removeEventListener('abort', cancel);
      };
      const finish = (error, value) => {
        if (completed) return;
        completed = true; cleanup();
        // Once a permanent HTTP result is known, a broken/slow error body cannot turn it into a retryable result.
        if (error?.code === 'temporary_unavailable' && [400, 401, 403, 404, 405, 409, 410, 413, 415, 422].includes(response?.statusCode)) {
          error = responseError(response.statusCode, Buffer.alloc(0), response.headers, currentTime(this.clock));
        }
        if (error) { request?.destroy(); response?.destroy(); reject(safeNetworkFailure(error)); }
        else resolve(value);
      };
      const cancel = () => finish(fail('consent_inactive'));
      const requestOptions = {
        method: event ? 'POST' : 'GET', agent: false, maxHeaderSize: 16384,
        headers: { Authorization: `Bearer ${credential.token}`, Accept: 'application/json', 'Cache-Control': 'no-store',
          ...(body ? { 'Content-Type': 'application/json', 'Content-Length': String(body.length) } : {}) },
        lookup: (_host, lookupOptions, callback) => {
          if (typeof lookupOptions === 'function') { callback = lookupOptions; lookupOptions = {}; }
          if (lookupOptions?.all) callback(null, [{ address: selected.address, family: selected.family }]);
          else callback(null, selected.address, selected.family);
        },
      };
      if (url.protocol === 'https:') Object.assign(requestOptions, {
        minVersion: 'TLSv1.2', maxVersion: 'TLSv1.3', rejectUnauthorized: true,
        ...(isIP(hostname) ? { servername: '' } : { servername: hostname }),
        ...(credential.profile_id === 'direct-local-tls-v1' && credential.tls.ca ? { ca: credential.tls.ca } : {}),
        checkServerIdentity: (_server, certificate) => {
          const identityError = tls.checkServerIdentity(hostname, certificate);
          if (identityError) return identityError;
          if (credential.profile_id === 'direct-local-tls-v1' && credential.tls.peerKeySha256) {
            try {
              const key = new X509Certificate(certificate.raw).publicKey.export({ type: 'spki', format: 'der' });
              const actual = createHash('sha256').update(key).digest();
              const expected = Buffer.from(credential.tls.peerKeySha256, 'base64');
              if (expected.length !== actual.length || !timingSafeEqual(actual, expected)) return fail('destination_rejected');
            } catch { return fail('destination_rejected'); }
          }
          return undefined;
        },
      });
      const onResponse = incoming => {
        response = incoming;
        const maxBytes = route === 'capabilities' && incoming.statusCode === 200 ? 16384 : 4096;
        if (incoming.statusCode >= 300 && incoming.statusCode <= 399) return finish(fail('destination_rejected'));
        const declared = incoming.headers['content-length'];
        const invalidResponse = () => incoming.statusCode === 200 ? fail('temporary_unavailable') :
          responseError(incoming.statusCode, Buffer.alloc(0), incoming.headers, currentTime(this.clock));
        if (declared !== undefined && (!/^\d+$/u.test(String(declared)) || Number(declared) > maxBytes)) return finish(invalidResponse());
        let bytes = 0; const chunks = [];
        incoming.on('data', chunk => {
          if (completed) return;
          bytes += chunk.length;
          if (bytes > maxBytes) return finish(invalidResponse());
          chunks.push(chunk);
        });
        incoming.once('aborted', () => finish(fail('temporary_unavailable')));
        incoming.once('error', error => finish(error));
        incoming.once('end', () => {
          if (completed) return;
          const raw = Buffer.concat(chunks, bytes);
          if (incoming.statusCode !== 200) return finish(responseError(incoming.statusCode, raw, incoming.headers, currentTime(this.clock)));
          if (!jsonMediaType(incoming.headers) || !(incoming.headers['cache-control'] ?? '').split(',')
            .some(directive => directive.trim().toLowerCase() === 'no-store')) return finish(fail('temporary_unavailable'));
          let result;
          try { result = parseJson(raw, maxBytes); assertSchema(route === 'capabilities' ? 'capabilities' : 'receipt', result); }
          catch { return finish(fail('temporary_unavailable')); }
          if (event) {
            for (const key of ['protocol_version', 'event_id', 'recipient_id', 'stream_id', 'sequence']) {
              if (result[key] !== event[key]) return finish(fail('temporary_unavailable'));
            }
          } else if (result.role !== 'receiver' || !result.supported_versions.includes('0.1.0') ||
            !result.delivery_profiles.includes(credential.profile_id) || !result.event_names.includes('activity.summary') ||
            !result.metrics.includes('foreground_duration')) return finish(fail('unsupported_capability'));
          finish(undefined, result);
        });
      };
      try {
        const requestFunction = this.transport ?? (url.protocol === 'https:' ? https.request : http.request);
        request = requestFunction(url, requestOptions, onResponse);
        request.once('error', error => finish(error));
        request.once('socket', socket => {
          const verifyAndWrite = () => {
            if (completed || written) return;
            try {
              const peer = validateAddress(socket.remoteAddress, credential.profile_id, credential.allowedAddresses);
              if (peer.address !== selected.address) throw fail('destination_rejected');
              if (url.protocol === 'https:' && socket.authorized !== true) throw fail('destination_rejected');
              this.#guard(binding, credential, event, options.signal, options.beforeSend, destinationFingerprint);
              clearTimeout(connectTimer); written = true;
              // No authorization header or activity byte is written before peer and consent checks.
              request.end(body);
            } catch (error) { finish(error); }
          };
          socket.once(url.protocol === 'https:' ? 'secureConnect' : 'connect', verifyAndWrite);
          if (!socket.connecting && (url.protocol !== 'https:' || socket.secureConnecting === false)) verifyAndWrite();
        });
        connectTimer = setTimeout(() => finish(fail('temporary_unavailable')), Math.max(1, this.connectTimeoutMs - elapsed));
        totalTimer = setTimeout(() => finish(fail('temporary_unavailable')), Math.max(1, this.totalTimeoutMs - elapsed));
        if (options.signal) {
          options.signal.addEventListener('abort', cancel, { once: true });
          if (options.signal.aborted) cancel();
        }
      } catch (error) { finish(error); }
    });
  }

  getCapabilities(binding, options) { return this.#perform('capabilities', undefined, binding, options); }
  deliver(event, binding, options) {
    try { assertSchema('activity-summary', event); }
    catch { return Promise.reject(fail('invalid_event')); }
    return this.#perform('events', event, binding, options);
  }
}
