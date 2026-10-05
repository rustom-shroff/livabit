import { randomUUID, randomBytes } from 'node:crypto';
import { validateEvent, canonical, appKey, OapError, capabilities } from './protocol.mjs';
import { validateControlRecord as assertSchema } from './control-records.mjs';
import { aggregateSegments, intersectIntervals, intervalDuration } from './aggregation.mjs';
import { pairedDestinationFingerprint } from './pairing.mjs';

const HOUR = 3600000, DAY = 86400000, CYCLE = 900000;
const copy = x => structuredClone(x);
const ms = x => Date.parse(x);
const iso = x => new Date(x).toISOString();
const bytes = x => Buffer.byteLength(canonical(x));
const fail = code => { throw new OapError(code); };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const retryEligibleCodes = new Set(['temporary_unavailable', 'rate_limited', 'storage_unavailable']);
const knownErrorCodes = new Set(['invalid_event', 'incompatible_version', 'unsupported_capability', 'unauthorized', 'scope_mismatch',
  'consent_inactive', 'expired', 'payload_too_large', 'rate_limited', 'destination_rejected', 'temporary_unavailable', 'cursor_invalid',
  'history_unavailable', 'conflicting_duplicate', 'invalid_request', 'scope_unsupported', 'storage_unavailable', 'clock_untrusted',
  'cursor_stale', 'endpoint_unsupported', 'media_type_unsupported']);
const finiteInt = (n, low = 0, high = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= low && n <= high;
function checkAccounting(r, checkpoint) {
  const l = r.limits;
  if (!l || Object.keys(l).length !== 4 || !finiteInt(l.max_event_bytes, 4096, 16384) || !finiteInt(l.max_batch_bytes, 4096, 65536)
    || !finiteInt(l.max_fresh_events_per_hour, 1, 4) || !finiteInt(l.max_attempts_per_cycle, 1, 6)
    || !finiteInt(r.backpressureUntil) || typeof r.cycleStopped !== 'boolean' || typeof r.cycleInitialized !== 'boolean'
    || !finiteInt(r.credentialDeadline) || !finiteInt(r.lastCycle) || !finiteInt(r.gapDetailLostUntil)
    || !r.freshBudget.every(n => finiteInt(n, 0, checkpoint)) || !r.readBudget.every(n => finiteInt(n, 0, checkpoint))
    || r.freshBudget.length > 4 || r.readBudget.length > 4
    || r.idempotency.length > 64 || r.cursors.length > 16 || r.gaps.length > 128 || r.finalized.length > 1024 || r.segments.length > 1024) fail('consent_inactive');
  if (!Object.hasOwn(r, 'destinationFingerprint') || !(typeof r.destinationFingerprint === 'string' && /^[0-9a-f]{64}$/.test(r.destinationFingerprint))
    && !(r.destinationFingerprint === null && r.binding.profile_id === 'direct-loopback-test-v1')) fail('consent_inactive');
  const seen = new Set();
  for (const e of r.entries) {
    if (!finiteInt(e.attempts, 0, l.max_attempts_per_cycle) || !finiteInt(e.next_due) || !finiteInt(e.cycle)
      || typeof e.received !== 'boolean' || (e.permanent !== undefined && typeof e.permanent !== 'boolean')
      || (e.first_at !== undefined && !finiteInt(e.first_at)) || typeof e.canonical !== 'string') fail('consent_inactive');
    validateEvent(e.event);
    if (e.canonical !== canonical(e.event) || bytes(e.event) > l.max_event_bytes || e.event.recipient_id !== r.grant.recipient_id
      || e.event.subscription_id !== r.subscription.subscription_id || e.event.stream_id !== r.subscription.stream_id
      || e.event.scope_revision !== r.subscription.scope_revision || e.event.sequence >= r.nextSequence || seen.has(e.event.sequence)) fail('consent_inactive');
    seen.add(e.event.sequence);
  }
  for (const g of r.gaps) if (!finiteInt(g.from_sequence, 1) || !finiteInt(g.to_sequence, g.from_sequence)
    || g.to_sequence >= r.nextSequence || !finiteInt(g.expires) || !['eviction', 'expired', 'explicit_delete'].includes(g.reason)) fail('consent_inactive');
  for (const marker of r.finalized) if (!finiteInt(marker.start) || !finiteInt(marker.end, marker.start + 1)
    || !finiteInt(marker.expires, marker.start + 1)) fail('consent_inactive');
  for (const s of r.segments) if (!finiteInt(s.start) || (s.end !== null && !finiteInt(s.end, s.start))) fail('consent_inactive');
  for (const op of r.idempotency) {
    if (!uuid.test(op.key) || !finiteInt(op.expires) || typeof op.request !== 'string') fail('consent_inactive');
    assertSchema('subscription', op.result);
  }
}
const scopeSubset = (s, base) => s.applications.every(a => base.applications.some(b => appKey(a) === appKey(b)))
  && s.allowed_fields.every(f => base.allowed_fields.includes(f))
  && s.event_names.every(f => base.event_names.includes(f))
  && (s.extension_keys ?? []).every(f => (base.extension_keys ?? []).includes(f))
  && s.aggregation_interval_ms >= base.aggregation_interval_ms
  && s.history_max_age_ms <= base.history_max_age_ms && s.history_max_bytes <= base.history_max_bytes;

function checkScope(scope) {
  const keys = scope.applications.map(appKey);
  if (new Set(keys).size !== keys.length || keys.some((k, i) => i && keys[i - 1] >= k)) fail('invalid_request');
  if (scope.aggregation_interval_ms < CYCLE * Math.ceil(keys.length / 32)) fail('scope_unsupported');
  if (scope.history_max_age_ms <= scope.aggregation_interval_ms) fail('invalid_request');
}

/** Device-local reference publisher. Credentials are injected protected handles. */
export class DevicePublisher {
  constructor({ store, clock, credentials, random = Math.random, permission = 'granted' }) {
    this.store = store; this.clock = clock; this.credentials = credentials;
    this.random = random; this.permission = permission; this.networkAvailable = true;
    this.committed = new Map(); this.inflight = new Map();
    this.createdUtc = clock.now(); this.createdElapsed = typeof clock.elapsed === 'function' ? clock.elapsed() : undefined;
    this.budgetAnchor = null;
  }
  getCapabilities() { return Promise.resolve(capabilities('publisher')); }
  _initializeBudgetClock(state, denial) {
    if (this.budgetAnchor) return;
    const creationUtc = finiteInt(this.createdUtc) ? this.createdUtc : state.budgetWallCheckpoint;
    const downtime = creationUtc - state.budgetWallCheckpoint;
    if (!denial && downtime < 0) fail('clock_untrusted');
    const credibleDowntime = this.createdElapsed === undefined || this.clock.restartTimeTrusted?.() === true;
    // Without an independently trusted reboot clock, time spent out of process
    // cannot shorten persisted waits. UTC still expires activity immediately.
    this.budgetAnchor = { utc: state.budgetCheckpoint + (credibleDowntime ? Math.max(0, downtime) : 0), elapsed: this.createdElapsed,
      offset: state.budgetCheckpoint - state.budgetWallCheckpoint };
  }
  _budgetNow() {
    if (!this.budgetAnchor) fail('clock_untrusted');
    if (this.createdElapsed === undefined) {
      const projected = Math.floor(this.clock.now() + this.budgetAnchor.offset);
      if (!finiteInt(projected)) fail('clock_untrusted');
      return projected;
    }
    const elapsed = this.clock.elapsed();
    if (!Number.isFinite(elapsed) || elapsed < this.budgetAnchor.elapsed) fail('clock_untrusted');
    const projected = Math.floor(this.budgetAnchor.utc + elapsed - this.budgetAnchor.elapsed);
    if (!finiteInt(projected)) fail('clock_untrusted');
    return projected;
  }
  async _tx(fn, afterCommit, denial = false) {
    let operationError, operationFailed = false;
    const result = await this.store.transaction(state => {
      if (Object.keys(state).length === 0) Object.assign(state, { version: 1, monitoringApproved: false, recipients: {}, retired: [], markers: [],
        lastClock: this.clock.now(), budgetCheckpoint: this.createdUtc, budgetWallCheckpoint: this.createdUtc });
      if (state.version !== 1 || !state.recipients || !Array.isArray(state.retired) || !Array.isArray(state.markers)
        || !Number.isSafeInteger(state.lastClock) || typeof state.monitoringApproved !== 'boolean' || state.retired.length > 128
        || state.markers.length > 1024 || Object.keys(state.recipients).length > 128 || !finiteInt(state.budgetCheckpoint)
        || !finiteInt(state.budgetWallCheckpoint) || state.budgetWallCheckpoint > state.lastClock) fail('consent_inactive');
      try {
        for (const [id, r] of Object.entries(state.recipients)) {
          assertSchema('local-grant', r.grant); assertSchema('subscription', r.subscription);
          if (id !== r.grant.recipient_id || id !== r.subscription.recipient_id || r.grant.grant_id !== r.subscription.grant_id
            || r.grant.scope_revision !== r.subscription.scope_revision || !Number.isSafeInteger(r.generation) || r.generation < 1
            || !Number.isSafeInteger(r.nextSequence) || r.nextSequence < 1
            || !['entries', 'finalized', 'gaps', 'cursors', 'idempotency', 'segments', 'freshBudget', 'readBudget'].every(k => Array.isArray(r[k]))
            || !r.limits || !Number.isSafeInteger(r.limits.max_fresh_events_per_hour)
            || !r.freshBudget.every(Number.isSafeInteger) || !r.readBudget.every(Number.isSafeInteger)) fail('consent_inactive');
          checkAccounting(r, state.budgetCheckpoint);
        }
      } catch { fail('consent_inactive'); }
      const rawNow = this.clock.now();
      const trustworthy = finiteInt(rawNow) && this.clock.trusted?.() !== false && rawNow >= state.lastClock;
      if (!denial && !trustworthy) fail('clock_untrusted');
      const now = trustworthy ? rawNow : state.lastClock;
      this._initializeBudgetClock(state, denial);
      let budgetNow;
      try { budgetNow = this._budgetNow(); } catch (error) { if (!denial) throw error; budgetNow = state.budgetCheckpoint; }
      if (!denial && budgetNow < state.budgetCheckpoint) fail('clock_untrusted');
      budgetNow = Math.max(budgetNow, state.budgetCheckpoint);
      state.lastClock = Math.max(state.lastClock, now);
      if (trustworthy && now >= state.budgetWallCheckpoint) {
        state.budgetCheckpoint = budgetNow; state.budgetWallCheckpoint = now;
      }
      const checkpoint = copy(state);
      state.retired = state.retired.filter(x => x.expires > now);
      state.markers = state.markers.filter(x => x.expires > now);
      for (const [id, r] of Object.entries(state.recipients)) if (r.grant.state === 'revoked'
        && Math.max(ms(r.grant.expires_at), r.credentialDeadline) <= now) { delete state.recipients[id]; this.committed.delete(id); }
      this.transactionBudgetNow = budgetNow;
      try { return fn(state, now, budgetNow); }
      catch (error) {
        // Failed requests cannot erase the clock relation just observed. Roll
        // back the requested mutation while durably retaining only safe clocks.
        operationError = error;
        operationFailed = true;
        for (const key of Object.keys(state)) delete state[key]; Object.assign(state, checkpoint);
        return undefined;
      } finally { this.transactionBudgetNow = undefined; }
    }, { afterCommit: (result, state) => {
      for (const [id, r] of Object.entries(state.recipients)) this.committed.set(id, { generation: r.generation, active: state.monitoringApproved && r.grant.state === 'active' && r.subscription.state === 'active', deadline: Math.min(ms(r.grant.expires_at), ms(r.subscription.expires_at)), backpressureUntil: r.backpressureUntil, cycleStopped: r.cycleStopped,
        destinationFingerprint: r.destinationFingerprint, subscription_id: r.subscription.subscription_id, stream_id: r.subscription.stream_id,
        scope_revision: r.subscription.scope_revision, profile_id: r.binding.profile_id });
      if (!operationFailed) afterCommit?.(result, state);
    } });
    if (operationFailed) throw operationError;
    return result;
  }
  _recipient(state, id) { return state.recipients[id] ?? fail('invalid_request'); }
  _subscription(state, id) { return Object.values(state.recipients).find(r => r.subscription.subscription_id === id) ?? fail('invalid_request'); }
  _credential(r, now, epoch = true, pairing = false) {
    let c;
    try { c = this.credentials.get(r.grant.recipient_id); } catch { fail('unauthorized'); }
    if (!c || !Number.isFinite(ms(c.expires_at)) || new Date(ms(c.expires_at)).toISOString() !== c.expires_at
      || ms(c.expires_at) <= now || ms(c.expires_at) > now + 30 * DAY || c.recipient_id !== r.grant.recipient_id || c.profile_id !== r.binding.profile_id
      || (epoch && (c.stream_id !== r.subscription.stream_id || c.subscription_id !== r.subscription.subscription_id || c.scope_revision !== r.subscription.scope_revision))) fail('unauthorized');
    try { if (!pairing && pairedDestinationFingerprint(c) !== r.destinationFingerprint) fail('unauthorized'); }
    catch { fail('unauthorized'); }
    if (!pairing) r.credentialDeadline = Math.max(r.credentialDeadline, ms(c.expires_at));
    return c;
  }
  _active(state, r, now) {
    if (!state.monitoringApproved || r.grant.state !== 'active' || r.subscription.state !== 'active') fail('consent_inactive');
    if (now >= ms(r.grant.expires_at) || now >= ms(r.subscription.expires_at)) fail('expired');
    if (this.permission !== 'granted') fail('consent_inactive');
    this._credential(r, now);
  }
  _gap(r, entries, reason, now) {
    if (!entries.length) return;
    const seq = entries.map(e => e.event.sequence).sort((a, b) => a - b);
    for (const sequence of seq) r.gaps.push({ from_sequence: sequence, to_sequence: sequence, reason,
      expires: Math.min(now + r.subscription.scope.history_max_age_ms, ms(r.grant.expires_at), ms(r.subscription.expires_at)) });
    r.gaps.sort((a, b) => a.from_sequence - b.from_sequence);
    const merged = [];
    for (const g of r.gaps) {
      const last = merged.at(-1);
      if (last && g.reason === last.reason && g.from_sequence <= last.to_sequence + 1) { last.to_sequence = Math.max(last.to_sequence, g.to_sequence); last.expires = Math.min(last.expires, g.expires); }
      else merged.push(g);
    }
    r.gaps = merged.length <= 128 ? merged : [];
    if (merged.length > 128) {
      r.health = 'history_unavailable';
      r.gapDetailLostUntil = Math.max(r.gapDetailLostUntil,
        Math.min(now + r.subscription.scope.history_max_age_ms, ms(r.grant.expires_at), ms(r.subscription.expires_at)));
    }
  }
  _cleanup(r, now) {
    const expired = r.entries.filter(e => ms(e.event.expires_at) <= now);
    this._gap(r, expired, 'expired', now);
    r.entries = r.entries.filter(e => ms(e.event.expires_at) > now);
    r.finalized = r.finalized.filter(x => x.expires > now);
    r.gaps = r.gaps.filter(x => x.expires > now);
    r.cursors = r.cursors.filter(x => x.expires > now);
    r.idempotency = r.idempotency.filter(x => x.expires > now);
    r.segments = r.segments.filter(x => x.end === null || x.end > now - r.subscription.scope.history_max_age_ms);
    const budgetNow = this.transactionBudgetNow ?? this._budgetNow();
    r.freshBudget = r.freshBudget.filter(x => x > budgetNow - HOUR);
    r.readBudget = r.readBudget.filter(x => x > budgetNow - 60000);
    if (r.gapDetailLostUntil > 0 && r.gapDetailLostUntil <= now) { r.gapDetailLostUntil = 0; if (r.health === 'history_unavailable') r.health = null; }
    this._bound(r, now);
  }
  _bound(r, now) {
    while (bytes(r) > r.subscription.scope.history_max_bytes && r.entries.length) {
      const windowId = r.entries[0].event.window.window_id;
      const removed = r.entries.filter(e => e.event.window.window_id === windowId);
      r.entries = r.entries.filter(e => e.event.window.window_id !== windowId);
      this._gap(r, removed, 'eviction', now);
    }
    if (bytes(r) > r.subscription.scope.history_max_bytes) fail('storage_unavailable');
  }
  _status(r, now) {
    const budgetNow = this.transactionBudgetNow ?? this._budgetNow();
    let consent = r.grant.state;
    if (consent !== 'revoked' && now >= Math.min(ms(r.grant.expires_at), ms(r.subscription.expires_at))) consent = 'expired';
    let delivery = consent !== 'active' ? consent : this.permission !== 'granted' ? 'blocked' : !this.networkAvailable ? 'offline' : 'idle';
    if (consent === 'active' && this.permission === 'granted' && this.networkAvailable) {
      try { this._credential(r, now); } catch { delivery = 'credential_unusable'; }
      if (delivery === 'idle') {
        const pending = r.entries.filter(e => !e.received);
        delivery = r.health === 'payload_too_large' ? 'unsupported' : r.health === 'history_unavailable' || r.gapDetailLostUntil > now ? 'blocked'
          : r.health === 'credential_unusable' ? 'credential_unusable' : r.health === 'permanent_error' ? 'permanent_error' : r.health === 'unsupported' ? 'unsupported'
          : this.inflight.has(r.grant.recipient_id) ? 'delivering' : pending.length && r.backpressureUntil > budgetNow ? 'backoff'
            : pending.length && r.cycleStopped ? 'exhausted' : pending.some(e => e.attempts >= r.limits.max_attempts_per_cycle) ? 'exhausted'
            : pending.some(e => e.next_due > budgetNow) ? 'backoff' : pending.length ? 'pending' : 'idle';
      }
    }
    const status = {
      protocol_version: '0.1.0', recipient_id: r.grant.recipient_id, subscription_id: r.subscription.subscription_id,
      stream_id: r.subscription.stream_id, scope_revision: r.subscription.scope_revision, consent_state: consent,
      collection_permission: this.permission, delivery_state: delivery, grant_expires_at: r.grant.expires_at,
      retention: { max_age_ms: r.subscription.scope.history_max_age_ms, max_bytes: r.subscription.scope.history_max_bytes,
        queued_events: r.entries.filter(e => !e.received).length, retained_bytes: bytes(r) }, gap_count: r.gaps.length
    };
    if (r.lastReceipt) status.last_receipt_at = r.lastReceipt;
    if (r.lastConsumption) status.last_valid_consumption_at = r.lastConsumption;
    assertSchema('status', status);
    return status;
  }

  async approve({ grant, subscription, binding, monitoringApproved, receiverCapabilities }) {
    // Only simulator/local UI calls this affirmative operation; schema JSON alone is not approval.
    if (monitoringApproved !== true) fail('consent_inactive');
    if (!binding || Object.keys(binding).some(k => !['recipient_id', 'profile_id', 'endpoint_ref', 'credential_ref'].includes(k))
      || !['recipient_id', 'endpoint_ref', 'credential_ref'].every(k => uuid.test(binding[k]))
      || !['direct-https-v1', 'direct-local-tls-v1', 'direct-loopback-test-v1'].includes(binding.profile_id)) fail('invalid_request');
    assertSchema('local-grant', grant); assertSchema('subscription', subscription); checkScope(grant.scope); checkScope(subscription.scope);
    if (!receiverCapabilities && binding.profile_id !== 'direct-loopback-test-v1') fail('unsupported_capability');
    const receiver = receiverCapabilities ?? capabilities('receiver'); // Isolated deterministic fixture profile only.
    assertSchema('capabilities', receiver);
    if (receiver.role !== 'receiver' || !receiver.supported_versions.includes('0.1.0') || !receiver.delivery_profiles.includes(binding.profile_id)
      || !subscription.scope.applications.every(a => receiver.application_namespaces.includes(a.namespace))
      || !subscription.scope.allowed_fields.every(f => receiver.allowed_fields.includes(f))
      || !subscription.scope.event_names.every(f => receiver.event_names.includes(f))) fail('unsupported_capability');
    const limits = { max_event_bytes: Math.min(16384, receiver.limits.max_event_bytes), max_batch_bytes: Math.min(65536, receiver.limits.max_batch_bytes),
      max_fresh_events_per_hour: Math.min(4, receiver.limits.max_fresh_events_per_hour), max_attempts_per_cycle: Math.min(6, receiver.limits.max_attempts_per_cycle) };
    const pages = Math.ceil(subscription.scope.applications.length / 32);
    if (pages > receiver.limits.max_pages || subscription.scope.history_max_age_ms > receiver.limits.max_history_age_ms
      || subscription.scope.history_max_bytes > receiver.limits.max_history_bytes
      || subscription.scope.aggregation_interval_ms < Math.ceil(pages * HOUR / limits.max_fresh_events_per_hour / CYCLE) * CYCLE) fail('scope_unsupported');
    return this._tx((state, now, budgetNow) => {
      if (grant.state !== 'active' || subscription.state !== 'active' || ms(grant.expires_at) <= now || ms(subscription.expires_at) <= now || ms(grant.approved_at) > now || ms(grant.created_at) > ms(grant.approved_at)
        || ms(grant.approved_at) >= ms(grant.expires_at) || ms(subscription.created_at) >= ms(subscription.expires_at)
        || subscription.grant_id !== grant.grant_id || subscription.recipient_id !== grant.recipient_id || subscription.scope_revision !== grant.scope_revision
        || ms(subscription.expires_at) > ms(grant.expires_at) || !scopeSubset(subscription.scope, grant.scope)
        || binding?.recipient_id !== grant.recipient_id) fail('invalid_request');
      if (state.markers.some(m => m.grant_id === grant.grant_id) || state.retired.some(m => m.grant_id === grant.grant_id)) fail('consent_inactive');
      const previous = state.recipients[grant.recipient_id];
      if (previous && previous.grant.state !== 'revoked') fail('conflicting_duplicate');
      if (!previous && Object.values(state.recipients).filter(r => r.grant.state !== 'revoked').length >= 4) fail('storage_unavailable');
      if ((!previous && Object.keys(state.recipients).length >= 128) || state.retired.length >= 128 || state.markers.length >= 1024) fail('storage_unavailable');
      const r = {
        grant: copy(grant), subscription: copy(subscription), binding: copy(binding), generation: (previous?.generation ?? 0) + 1,
        segments: [{ start: ms(grant.approved_at), end: null }], nextSequence: 1, entries: [], finalized: [], gaps: [], cursors: [],
        idempotency: [], freshBudget: previous?.freshBudget ?? [], readBudget: previous?.readBudget ?? [], lastCycle: previous?.lastCycle ?? budgetNow,
        cycleInitialized: previous?.cycleInitialized ?? false, backpressureUntil: previous?.backpressureUntil ?? 0,
        cycleStopped: previous?.cycleStopped ?? false, gapDetailLostUntil: 0, health: null, limits
      };
      const credential = this._credential(r, now, true, true);
      r.destinationFingerprint = pairedDestinationFingerprint(credential);
      if (ms(credential.expires_at) > now + 30 * DAY || ms(subscription.expires_at) > ms(credential.expires_at)) fail('unauthorized');
      r.credentialDeadline = ms(credential.expires_at);
      r.idempotency.push({ key: subscription.idempotency_key, request: canonical({ grant_id: grant.grant_id, requested_scope: subscription.scope, requested_expires_at: subscription.expires_at }), result: copy(subscription), expires: Math.min(ms(grant.expires_at), now + DAY) });
      state.monitoringApproved = true; state.recipients[grant.recipient_id] = r; this._bound(r, now);
      return copy(subscription);
    });
  }

  async configureSubscription(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(k => !['grant_id', 'idempotency_key', 'requested_scope', 'requested_expires_at'].includes(k))
      || !uuid.test(request.grant_id) || !uuid.test(request.idempotency_key)) fail('invalid_request');
    return this._tx((state, now) => {
      const r = Object.values(state.recipients).find(x => x.grant.grant_id === request.grant_id) ?? fail('invalid_request');
      this._active(state, r, now); this._cleanup(r, now);
      const fingerprint = canonical({ grant_id: request.grant_id, requested_scope: request.requested_scope, requested_expires_at: request.requested_expires_at });
      const existing = r.idempotency.find(x => x.key === request.idempotency_key);
      if (!existing) fail('invalid_request'); // This release activates its sole subscription together with explicit approve.
      if (existing.request !== fingerprint) fail('conflicting_duplicate');
      return copy(existing.result);
    });
  }
  async renewSubscription(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(k => !['subscription_id', 'idempotency_key', 'requested_expires_at'].includes(k))
      || !uuid.test(request.subscription_id) || !uuid.test(request.idempotency_key)) fail('invalid_request');
    return this._tx((state, now) => {
      const r = this._subscription(state, request.subscription_id); this._active(state, r, now); this._cleanup(r, now);
      const fingerprint = canonical({ subscription_id: request.subscription_id, idempotency_key: request.idempotency_key, requested_expires_at: request.requested_expires_at });
      const existing = r.idempotency.find(x => x.key === request.idempotency_key);
      if (existing) { if (existing.request !== fingerprint) fail('conflicting_duplicate'); return copy(existing.result); }
      if (r.idempotency.length >= 64) fail('storage_unavailable');
      const expiry = ms(request.requested_expires_at), c = this._credential(r, now);
      if (!Number.isFinite(expiry) || expiry <= now || expiry > Math.min(ms(r.grant.expires_at), ms(c.expires_at))) fail('invalid_request');
      r.subscription.expires_at = request.requested_expires_at;
      assertSchema('subscription', r.subscription);
      r.idempotency.push({ key: request.idempotency_key, request: fingerprint, result: copy(r.subscription), expires: Math.min(ms(r.grant.expires_at), now + DAY) });
      this._bound(r, now); return copy(r.subscription);
    });
  }
  async pause(recipientId) {
    return this._tx((state, now) => {
      const r = this._recipient(state, recipientId);
      if (r.grant.state === 'revoked') return this._status(r, now);
      if (r.grant.state !== 'paused') { r.grant.state = r.subscription.state = 'paused'; r.generation++; if (r.segments.at(-1)?.end === null) r.segments.at(-1).end = Math.max(r.segments.at(-1).start, state.lastClock); }
      this._cleanup(r, now); return this._status(r, now);
    }, () => this.inflight.get(recipientId)?.controller.abort(), true);
  }
  async resume(recipientId) {
    return this._tx((state, now) => {
      const r = this._recipient(state, recipientId);
      if (r.grant.state === 'revoked' || now >= Math.min(ms(r.grant.expires_at), ms(r.subscription.expires_at))) fail('consent_inactive');
      this._credential(r, now);
      if (r.grant.state === 'paused') { r.grant.state = r.subscription.state = 'active'; r.generation++; r.segments.push({ start: now, end: null }); }
      if (r.segments.length > 1024) fail('storage_unavailable');
      this._cleanup(r, now); return this._status(r, now);
    });
  }
  async revoke(recipientId) {
    const result = await this._tx((state, now) => {
      const r = this._recipient(state, recipientId);
      if (r.grant.state !== 'revoked') {
        r.grant.state = r.subscription.state = 'revoked'; r.grant.scope_revision++; r.subscription.scope_revision = r.grant.scope_revision; r.generation++;
        r.entries = []; r.finalized = []; r.gaps = []; r.cursors = []; r.idempotency = []; r.segments = []; r.gapDetailLostUntil = 0; r.health = null;
        state.markers.push({ recipient_id: recipientId, grant_id: r.grant.grant_id, generation: r.generation, expires: r.credentialDeadline });
        state.retired.push({ grant_id: r.grant.grant_id, expires: Math.max(ms(r.grant.expires_at), r.credentialDeadline) });
      }
      return this._status(r, now);
    }, () => this.inflight.get(recipientId)?.controller.abort(), true);
    try { await this.credentials.delete(recipientId); } catch { throw new OapError('storage_unavailable', 'Local revocation committed; credential deletion requires local repair.'); }
    return result;
  }
  async narrowScope(recipientId, requestedScope) {
    return this._tx((state, now) => {
      const r = this._recipient(state, recipientId);
      if (canonical(requestedScope) === canonical(r.subscription.scope) && r.grant.state === 'active' && now < Math.min(ms(r.grant.expires_at), ms(r.subscription.expires_at))) return copy(r.subscription);
      this._active(state, r, now);
      const probe = { ...r.subscription, scope: requestedScope }; assertSchema('subscription', probe); checkScope(requestedScope);
      if (!scopeSubset(requestedScope, r.subscription.scope)) fail('scope_mismatch');
      if (canonical(requestedScope) === canonical(r.subscription.scope)) return copy(r.subscription);
      r.generation++; r.grant.scope_revision++; r.grant.scope = copy(requestedScope);
      r.subscription = { ...r.subscription, subscription_id: randomUUID(), stream_id: randomUUID(), scope_revision: r.grant.scope_revision, scope: copy(requestedScope) };
      r.entries = []; r.gaps = []; r.cursors = []; r.idempotency = []; r.nextSequence = 1; r.gapDetailLostUntil = 0;
      // Keep content-free finalization barriers: old windows cannot be reissued as new IDs.
      r.segments = [{ start: now, end: null }]; r.health = null;
      this._bound(r, now); return copy(r.subscription);
    }, () => this.inflight.get(recipientId)?.controller.abort());
  }

  async finalizeWindow(subscriptionId, input) {
    return this._tx((state, now, budgetNow) => {
      const r = this._subscription(state, subscriptionId); this._active(state, r, now); this._cleanup(r, now);
      const a = ms(input.start), b = ms(input.end), scope = r.subscription.scope;
      if (!Number.isFinite(a) || !Number.isFinite(b) || b > now || b - a !== scope.aggregation_interval_ms) fail('invalid_event');
      if (r.finalized.some(x => a < x.end && b > x.start)) fail('conflicting_duplicate');
      const authorized = r.segments.map(x => [x.start, Math.min(x.end ?? now, ms(r.grant.expires_at))]);
      let candidate;
      if ('observations' in input) candidate = aggregateSegments(input, scope, authorized);
      else {
        candidate = copy(input);
        const observed = candidate.coverage.observed_intervals.map(x => [ms(x.start), ms(x.end)]);
        if (intervalDuration(intersectIntervals(observed, authorized)) !== intervalDuration(observed)) {
          // Aggregate-only totals are inseparable; do not estimate authorized fractions.
          candidate = null;
        } else {
          const allow = new Set(scope.applications.map(appKey));
          candidate.apps = candidate.apps.filter(x => allow.has(appKey(x.application))).map(x => ({ application: {
            namespace: x.application.namespace, id: x.application.id,
            ...(scope.allowed_fields.includes('label') && typeof x.application.label === 'string' ? { label: x.application.label } : {})
          }, foreground_duration_ms: x.foreground_duration_ms }));
        }
      }
      const deadline = Math.min(a + scope.history_max_age_ms, ms(r.grant.expires_at), ms(r.subscription.expires_at), ms(this._credential(r, now).expires_at));
      if (deadline <= now) fail('expired');
      if (r.finalized.length >= 1024) fail('storage_unavailable');
      r.finalized.push({ start: a, end: b, expires: deadline });
      if (!candidate || !candidate.apps.some(x => x.foreground_duration_ms > 0)) { r.health = candidate ? null : 'history_unavailable'; this._bound(r, now); return []; }
      const count = Math.ceil(scope.applications.length / 32), windowId = randomUUID(), events = [];
      const authorization = { ...r.subscription, expires_at: iso(deadline) };
      try {
        for (let index = 0; index < count; index++) {
          const partition = new Set(scope.applications.slice(index * 32, (index + 1) * 32).map(appKey));
          const event = {
            protocol_version: '0.1.0', event_name: 'activity.summary', event_id: randomUUID(), recipient_id: r.grant.recipient_id,
            stream_id: r.subscription.stream_id, subscription_id: r.subscription.subscription_id, scope_revision: r.subscription.scope_revision,
            sequence: r.nextSequence + index, emitted_at: iso(now), expires_at: iso(deadline), window: { window_id: windowId, start: input.start, end: input.end },
            summary: { metric: 'foreground_duration', unit: 'millisecond', aggregation_interval_ms: scope.aggregation_interval_ms,
              page_index: index, page_count: count, coverage: candidate.coverage,
              apps: candidate.apps.filter(x => partition.has(appKey(x.application))).sort((x, y) => appKey(x.application) < appKey(y.application) ? -1 : 1) }
          };
          if (input.extensions && scope.extension_keys?.length) event.extensions = Object.fromEntries(Object.entries(input.extensions).filter(([key]) => scope.extension_keys.includes(key)));
          validateEvent(event, { now, authorization });
          if (bytes(event) > r.limits.max_event_bytes) fail('payload_too_large');
          events.push(event);
        }
      } catch (e) {
        if (e.code !== 'payload_too_large') throw e;
        r.health = 'payload_too_large'; this._bound(r, now); return [];
      }
      r.nextSequence += count;
      for (const event of events) r.entries.push({ event, canonical: canonical(event), attempts: 0, next_due: budgetNow, cycle: 0, received: false });
      r.health = null; this._bound(r, now); return copy(events);
    });
  }

  async selectReplay({ subscription_id, cursor, max_bytes = 65536 }) {
    return this._tx((state, now, budgetNow) => {
      const r = this._subscription(state, subscription_id); this._active(state, r, now); this._cleanup(r, now);
      if (!Number.isSafeInteger(max_bytes) || max_bytes < 512 || max_bytes > 65536) fail('invalid_request');
      max_bytes = Math.min(max_bytes, r.limits.max_batch_bytes);
      if (r.readBudget.length >= 4) fail('rate_limited');
      let position = 0, selectedCursor;
      if (cursor) {
        selectedCursor = r.cursors.find(c => c.id === cursor);
        if (!selectedCursor || selectedCursor.stream_id !== r.subscription.stream_id || selectedCursor.revision !== r.subscription.scope_revision
          || selectedCursor.grant_id !== r.grant.grant_id || selectedCursor.subscription_id !== r.subscription.subscription_id || selectedCursor.user_binding_id !== r.grant.user_binding_id) fail('cursor_invalid');
        position = selectedCursor.position;
        if (position && !r.entries.some(e => e.event.sequence === position) && position < r.nextSequence) fail('cursor_stale');
      }
      const batch = { protocol_version: '0.1.0', recipient_id: r.grant.recipient_id, stream_id: r.subscription.stream_id,
        scope_revision: r.subscription.scope_revision, events: [], gaps: r.gaps.slice(0, 16).map(({ expires, ...gap }) => gap), has_more: false };
      const entries = r.entries.filter(e => e.event.sequence > position);
      for (const e of entries) {
        if (batch.events.length >= 4) break;
        batch.events.push(copy(e.event));
        // Reserve the cursor wrapper before choosing an event; never oversize the response.
        if (bytes({ ...batch, has_more: true, next_cursor: 'x'.repeat(32) }) > max_bytes) { batch.events.pop(); break; }
      }
      if (entries.length && !batch.events.length) fail('payload_too_large');
      batch.has_more = entries.length > batch.events.length;
      if (batch.has_more) {
        if (r.cursors.length >= 16) fail('rate_limited');
        batch.next_cursor = randomBytes(24).toString('base64url');
        r.cursors.push({ id: batch.next_cursor, position: batch.events.at(-1).sequence, stream_id: r.subscription.stream_id, revision: r.subscription.scope_revision,
          grant_id: r.grant.grant_id, subscription_id: r.subscription.subscription_id, user_binding_id: r.grant.user_binding_id,
          expires: Math.min(now + DAY, ms(r.subscription.expires_at)) });
      }
      r.readBudget.push(budgetNow); assertSchema('batch', batch); this._bound(r, now); return batch;
    });
  }

  async dispatchNext(subscriptionId, adapter) {
    let work;
    const reservation = await this._tx((state, now, budgetNow) => {
      const r = this._subscription(state, subscriptionId); this._active(state, r, now); this._cleanup(r, now);
      const recipientId = r.grant.recipient_id;
      if (!this.networkAvailable || this.inflight.has(recipientId) || r.backpressureUntil > budgetNow || r.cycleStopped
        || ['permanent_error', 'unsupported', 'credential_unusable'].includes(r.health)) return null;
      const eventEntry = r.entries.find(e => !e.received && !e.permanent && e.attempts < r.limits.max_attempts_per_cycle && e.next_due <= budgetNow);
      if (!eventEntry) return null;
      if (eventEntry.attempts === 0 && eventEntry.first_at === undefined && r.freshBudget.length >= r.limits.max_fresh_events_per_hour) return null;
      const c = this._credential(r, now);
      if (canonical(eventEntry.event) !== eventEntry.canonical) fail('consent_inactive');
      if (Math.min(ms(c.expires_at), ms(r.subscription.expires_at), ms(r.grant.expires_at), ms(eventEntry.event.expires_at)) <= now) fail('expired');
      if (!r.cycleInitialized) { r.lastCycle = budgetNow; r.cycleInitialized = true; }
      if (eventEntry.first_at === undefined) { eventEntry.first_at = budgetNow; r.freshBudget.push(budgetNow); }
      eventEntry.attempts++; eventEntry.cycle++;
      return { recipientId, generation: r.generation, event: copy(eventEntry.event), binding: copy(r.binding) };
    }, result => {
      if (!result) return;
      const controller = new AbortController(); this.inflight.set(result.recipientId, { controller, event_id: result.event.event_id });
      const beforeSend = () => {
        const live = this.committed.get(result.recipientId);
        if (!live?.active || live.generation !== result.generation || controller.signal.aborted) fail('consent_inactive');
        if (live.backpressureUntil > this._budgetNow() || live.cycleStopped) fail('rate_limited');
        if (this.permission !== 'granted') fail('consent_inactive');
        let credential;
        try { credential = this.credentials.get(result.recipientId); } catch { fail('unauthorized'); }
        if (!credential || credential.recipient_id !== result.recipientId || credential.profile_id !== live.profile_id
          || credential.subscription_id !== live.subscription_id || credential.stream_id !== live.stream_id || credential.scope_revision !== live.scope_revision
          || !Number.isFinite(ms(credential.expires_at)) || new Date(ms(credential.expires_at)).toISOString() !== credential.expires_at
          || ms(credential.expires_at) <= this.clock.now() || ms(credential.expires_at) > this.clock.now() + 30 * DAY) fail('unauthorized');
        try { if (pairedDestinationFingerprint(credential) !== live.destinationFingerprint) fail('unauthorized'); } catch { fail('unauthorized'); }
        if (this.clock.now() >= Math.min(live.deadline, ms(result.event.expires_at))) fail('expired');
        if (this.clock.trusted?.() === false || this.clock.now() < this.store.peek().lastClock) fail('clock_untrusted');
      };
      try { beforeSend(); work = Promise.resolve(adapter.deliver(result.event, result.binding, { beforeSend, signal: controller.signal })); }
      catch (error) { work = Promise.reject(error); }
    });
    if (!reservation) {
      const state = await this.store.read(); const r = this._subscription(state, subscriptionId); return this.getLocalStatus(r.grant.recipient_id);
    }
    try {
      const receipt = await work;
      try { assertSchema('receipt', receipt); } catch { fail('temporary_unavailable'); }
      const event = reservation.event;
      if (receipt.event_id !== event.event_id || receipt.recipient_id !== event.recipient_id || receipt.stream_id !== event.stream_id || receipt.sequence !== event.sequence || ms(receipt.received_at) > this.clock.now() + 300000) fail('temporary_unavailable');
      await this.recordReceipt(receipt, reservation.generation);
    } catch (error) {
      await this._tx((state, now, budgetNow) => {
        const r = this._recipient(state, reservation.recipientId);
        if (r.generation !== reservation.generation) return;
        const e = r.entries.find(e => e.event.event_id === reservation.event.event_id); if (!e) return;
        const errorCode = error?.code;
        // The protocol catalogue determines known codes. Adapter optimism cannot
        // authorize retry; unclassified transport loss is an ambiguous outcome.
        const retryable = retryEligibleCodes.has(errorCode) || !knownErrorCodes.has(errorCode);
        if (errorCode === 'unauthorized') r.health = 'credential_unusable';
        else if (!retryable && errorCode !== 'consent_inactive') { e.permanent = true; r.health = 'permanent_error'; }
        const rawHint = retryable ? error?.retryAfterMs ?? error?.retry_after_ms ?? 0 : 0;
        const hint = finiteInt(rawHint, 0, Number.MAX_SAFE_INTEGER - budgetNow) ? rawHint : 0;
        if (Number.isSafeInteger(hint) && hint > 0) {
          r.backpressureUntil = Math.max(r.backpressureUntil, budgetNow + hint);
          if (hint > HOUR) r.cycleStopped = true;
        }
        e.next_due = budgetNow + Math.max(hint, Math.floor(this.random() * Math.min(300000, 2000 * 2 ** (e.attempts - 1))));
        this._cleanup(r, now);
      });
    } finally { this.inflight.delete(reservation.recipientId); }
    return this.getLocalStatus(reservation.recipientId);
  }
  async recordReceipt(receipt, generation) {
    assertSchema('receipt', receipt);
    return this._tx((state, now) => {
      const r = this._recipient(state, receipt.recipient_id);
      if (generation !== undefined && r.generation !== generation) return;
      const e = r.entries.find(e => e.event.event_id === receipt.event_id);
      if (!e || e.event.stream_id !== receipt.stream_id || e.event.sequence !== receipt.sequence) fail('invalid_request');
      e.received = true; r.lastReceipt = receipt.received_at; r.lastConsumption = receipt.received_at; r.health = null;
      this._cleanup(r, now);
    });
  }
  async triggerRetry(recipientId, reason) {
    if (!['reconnect', 'credential_repair', 'user_retry'].includes(reason)) fail('invalid_request');
    return this._tx((state, now, budgetNow) => {
      const r = this._recipient(state, recipientId); this._active(state, r, now); this._cleanup(r, now);
      if (budgetNow < r.backpressureUntil || budgetNow - r.lastCycle < CYCLE) return false;
      for (const e of r.entries) if (!e.received && !e.permanent && (r.cycleStopped || e.attempts >= r.limits.max_attempts_per_cycle)) e.attempts = 0;
      r.lastCycle = budgetNow; r.cycleInitialized = true; r.cycleStopped = false; r.backpressureUntil = 0; r.health = null; return true;
    });
  }
  async setNetworkAvailable(available) {
    const reconnect = !this.networkAvailable && available; this.networkAvailable = available;
    if (reconnect) { const state = await this.store.read(); for (const id of Object.keys(state.recipients ?? {})) { try { await this.triggerRetry(id, 'reconnect'); } catch {} } }
  }
  async setMonitoringApproved(approved) {
    return this._tx((state, now) => {
      state.monitoringApproved = approved === true;
      if (!state.monitoringApproved) for (const r of Object.values(state.recipients)) {
        if (r.grant.state === 'active') { r.grant.state = r.subscription.state = 'paused'; r.generation++; if (r.segments.at(-1)?.end === null) r.segments.at(-1).end = Math.max(r.segments.at(-1).start, state.lastClock); }
      }
    }, () => { if (!approved) for (const work of this.inflight.values()) work.controller.abort(); }, !approved);
  }
  async getLocalStatus(recipientId) {
    return this._tx((state, now) => { const r = this._recipient(state, recipientId); this._cleanup(r, now); return this._status(r, now); });
  }
  async initialize() {
    return this._tx((state, now) => { for (const r of Object.values(state.recipients)) this._cleanup(r, now); });
  }
  async getLocalError(recipientId) {
    return this._tx((state, now) => {
      const r = this._recipient(state, recipientId); this._cleanup(r, now);
      const health = r.gapDetailLostUntil > now ? 'history_unavailable' : r.health;
      if (!health || !['payload_too_large', 'history_unavailable', 'credential_unusable', 'permanent_error', 'unsupported'].includes(health)) return null;
      const code = { credential_unusable: 'unauthorized', permanent_error: 'invalid_event', unsupported: 'unsupported_capability' }[health] ?? health;
      return new OapError(code, 'Sharing needs local attention; a window or delivery could not be completed.').toJSON();
    });
  }
}
