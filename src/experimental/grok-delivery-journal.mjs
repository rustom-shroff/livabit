// Offline synthetic delivery accounting. No native adapter, dispatch or network permission.
import { randomUUID } from 'node:crypto';
import { assertSchema, canonical, digest, parseJson, validateEvent, validateScope } from '../protocol.mjs';
import { classifyGrokWebhookAttempt } from './grok-webhook-outcome.mjs';

const MAX_BYTES = 1_048_576, MAX_ENTRIES = 64, HOUR = 3_600_000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const sha = /^[a-f0-9]{64}$/u;
const codes = new Set(['invalid_journal_input', 'journal_binding_mismatch', 'journal_corrupt',
  'journal_capacity', 'clock_untrusted', 'consent_inactive', 'page_expired', 'event_conflict',
  'attempt_blocked', 'reservation_unavailable', 'fresh_budget_exhausted', 'journal_storage_unavailable']);
const phases = new Set(['pending', 'reserved', 'accepted_run_start_report', 'not_accepted_report',
  'ambiguous_after_body_write', 'body_not_submitted']);
export class GrokJournalError extends Error {
  constructor(code) { super('The offline delivery journal operation was rejected.');
    this.name = 'GrokJournalError'; this.code = codes.has(code) ? code : 'journal_storage_unavailable'; }
}
const fail = code => { throw new GrokJournalError(code); };
const safe = error => error instanceof GrokJournalError ? new GrokJournalError(error.code)
  : new GrokJournalError('journal_storage_unavailable');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const data = (value, fields) => {
  if (!plain(value) || Reflect.ownKeys(value).length !== fields.length
    || fields.some(key => !Object.hasOwn(value, key)
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) fail('invalid_journal_input');
  return Object.fromEntries(fields.map(key => [key, value[key]]));
};
const exact = (value, fields) => plain(value) && Object.keys(value).sort().join(',') === [...fields].sort().join(',');
function copyJsonData(value, depth = 0) {
  if (depth > 16) fail('invalid_journal_input');
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return value;
  if (Array.isArray(value)) {
    if (value.length > 1024 || Reflect.ownKeys(value).length !== value.length + 1) fail('invalid_journal_input');
    return Array.from({ length: value.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('invalid_journal_input');
      return copyJsonData(descriptor.value, depth + 1);
    });
  }
  if (!plain(value) || Reflect.ownKeys(value).length > 1024) fail('invalid_journal_input');
  const result = {};
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor || !Object.hasOwn(descriptor, 'value')) fail('invalid_journal_input');
    Object.defineProperty(result, key, { value: copyJsonData(descriptor.value, depth + 1),
      enumerable: true, writable: true, configurable: true });
  }
  return result;
}
const instant = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
const evidence = () => ({ target: 'grok-bot', evidence_kind: 'offline_grok_delivery_journal',
  synthetic_fixture: true, network_permission_granted: false, network_accessed: false,
  native_profile_enabled: false, actual_host_observed: false, valid_consumption_proven: false,
  evaluation_observed: false, m2_gate_satisfied: false, automatic_retry_allowed: false });

export function createOfflineGrokJournalState() {
  return { version: 1, kind: 'offline-grok-delivery-journal', binding: null,
    last_clock: null, control: { state: 'active', generation: 1 }, fresh_reservations: [], entries: {} };
}
function copyBinding(input) {
  const binding = copyJsonData(data(input, ['authorization', 'deviceBindingId']));
  const a = binding.authorization;
  if (typeof binding.deviceBindingId !== 'string' || !uuid.test(binding.deviceBindingId)
    || !exact(a, ['recipient_id', 'stream_id', 'subscription_id', 'scope_revision', 'expires_at', 'scope'])
    || !instant(a.expires_at)) fail('invalid_journal_input');
  try {
    validateScope(a.scope);
    assertSchema('subscription', { protocol_version: '0.1.0', grant_id: binding.deviceBindingId,
      idempotency_key: binding.deviceBindingId, state: 'active', created_at: '1970-01-01T00:00:00.000Z', ...a });
  } catch { fail('invalid_journal_input'); }
  if (a.scope.applications.some(app => app.namespace !== 'test.app')) fail('invalid_journal_input');
  return binding;
}
function identity(event, body) {
  const metadata = { recipient_id: event.recipient_id, stream_id: event.stream_id,
    subscription_id: event.subscription_id, scope_revision: event.scope_revision,
    emitted_at: event.emitted_at, expires_at: event.expires_at, window: event.window,
    coverage: event.summary.coverage, aggregation_interval_ms: event.summary.aggregation_interval_ms,
    page_count: event.summary.page_count, first_sequence: event.sequence - event.summary.page_index };
  if (metadata.first_sequence < 1) fail('invalid_journal_input');
  return { event_id: event.event_id, sequence: event.sequence, body_sha256: digest(body), expires_at: event.expires_at,
    window_id: event.window.window_id, window_start: event.window.start, window_end: event.window.end,
    group_sha256: digest(metadata) };
}
function readBody(raw, authorization, now) {
  try {
    if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) fail('invalid_journal_input');
    if (Buffer.byteLength(raw) > 16_384) fail('invalid_journal_input');
    const event = parseJson(raw, 16_384);
    validateEvent(event, { authorization });
    if (Date.parse(event.expires_at) <= now) fail('page_expired');
    validateEvent(event, { authorization, now });
    const body = canonical(event);
    return { body, identity: identity(event, body) };
  } catch (error) { if (error instanceof GrokJournalError) throw error; fail('invalid_journal_input'); }
}

class OfflineGrokDeliveryJournal {
  #store; #clock; #binding; #permits = new Map(); #disposed = false;
  constructor(store, clock, binding) { this.#store = store; this.#clock = clock; this.#binding = binding; }
  #now() {
    try {
      const now = this.#clock.now();
      if (this.#clock.trusted() !== true || !Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000) fail('clock_untrusted');
      return now;
    } catch { fail('clock_untrusted'); }
  }
  #activeObject() { if (this.#disposed) fail('reservation_unavailable'); }
  #guard(state, now) {
    if (!exact(state, ['version', 'kind', 'binding', 'last_clock', 'control', 'fresh_reservations', 'entries'])
      || state.version !== 1 || state.kind !== 'offline-grok-delivery-journal'
      || !exact(state.control, ['state', 'generation']) || !['active', 'paused', 'revoked'].includes(state.control.state)
      || !Number.isSafeInteger(state.control.generation) || state.control.generation < 1
      || !Array.isArray(state.fresh_reservations) || state.fresh_reservations.length > 4
      || !plain(state.entries) || Object.keys(state.entries).length > MAX_ENTRIES
      || Buffer.byteLength(canonical(state)) > MAX_BYTES) fail('journal_corrupt');
    if (state.binding === null) {
      if (state.last_clock !== null || Object.keys(state.entries).length || state.fresh_reservations.length
        || state.control.state !== 'active' || state.control.generation !== 1) fail('journal_corrupt');
      return;
    }
    if (canonical(state.binding) !== canonical(this.#binding)) fail('journal_binding_mismatch');
    if (!Number.isSafeInteger(state.last_clock) || state.last_clock < 0) fail('journal_corrupt');
    if (now < state.last_clock) fail('clock_untrusted');
    if (state.fresh_reservations.some((time, index) => !Number.isSafeInteger(time) || time < 0 || time > state.last_clock
      || index > 0 && time < state.fresh_reservations[index - 1])) fail('journal_corrupt');
    const sequences = new Set(), attempts = new Set();
    let reserved = 0;
    const identityFields = ['event_id', 'sequence', 'body_sha256', 'expires_at', 'window_id', 'window_start', 'window_end', 'group_sha256'];
    for (const [key, entry] of Object.entries(state.entries)) {
      if (!exact(entry, ['identity', 'identity_sha256', 'body', 'phase', 'attempt_id', 'reserved_at',
        'reservation_generation', 'finished_at', 'observation']) || !exact(entry.identity, identityFields)) fail('journal_corrupt');
      const id = entry.identity;
      if (key !== id.event_id || !uuid.test(key) || !uuid.test(id.window_id)
        || !Number.isSafeInteger(id.sequence) || id.sequence < 1 || sequences.has(id.sequence)
        || !sha.test(id.body_sha256) || !sha.test(id.group_sha256) || entry.identity_sha256 !== digest(id)
        || ![id.expires_at, id.window_start, id.window_end].every(instant)
        || Date.parse(id.window_start) >= Date.parse(id.window_end)
        || Date.parse(id.expires_at) > Date.parse(this.#binding.authorization.expires_at)
        || !phases.has(entry.phase)) fail('journal_corrupt');
      sequences.add(id.sequence);
      if (entry.body === null) {
        if (Date.parse(id.expires_at) > now && state.control.state !== 'revoked') fail('journal_corrupt');
      } else {
        try {
          if (typeof entry.body !== 'string') fail('journal_corrupt');
          const event = parseJson(entry.body, 16_384); validateEvent(event, { authorization: this.#binding.authorization });
          if (canonical(event) !== entry.body || canonical(identity(event, entry.body)) !== canonical(id)) fail('journal_corrupt');
        } catch { fail('journal_corrupt'); }
      }
      if (entry.phase === 'pending') {
        if ([entry.attempt_id, entry.reserved_at, entry.reservation_generation, entry.finished_at, entry.observation].some(value => value !== null)) fail('journal_corrupt');
      } else {
        if (!uuid.test(entry.attempt_id) || attempts.has(entry.attempt_id)
          || !Number.isSafeInteger(entry.reserved_at) || entry.reserved_at < 0 || entry.reserved_at > state.last_clock
          || entry.reserved_at >= Date.parse(id.expires_at)
          || !Number.isSafeInteger(entry.reservation_generation) || entry.reservation_generation < 1
          || entry.reservation_generation > state.control.generation) fail('journal_corrupt');
        attempts.add(entry.attempt_id);
        if (entry.phase === 'reserved') {
          reserved++;
          if (entry.finished_at !== null || entry.observation !== null) fail('journal_corrupt');
        } else {
          try {
            if (!Number.isSafeInteger(entry.finished_at) || entry.finished_at < entry.reserved_at || entry.finished_at > state.last_clock
              || !exact(entry.observation, ['connectionFailed', 'localConsentActive', 'requestBodyWritten', 'responseStatus'])
              || classifyGrokWebhookAttempt(entry.observation).outcome !== entry.phase) fail('journal_corrupt');
          } catch { fail('journal_corrupt'); }
        }
      }
    }
    if (reserved > 1) fail('journal_corrupt');
    const identities = Object.values(state.entries).map(entry => entry.identity);
    for (let index = 0; index < identities.length; index++) for (const other of identities.slice(index + 1)) {
      const id = identities[index];
      if (id.window_id === other.window_id && id.group_sha256 !== other.group_sha256
        || id.window_id !== other.window_id && Date.parse(id.window_start) < Date.parse(other.window_end)
        && Date.parse(other.window_start) < Date.parse(id.window_end)) fail('journal_corrupt');
    }
    // A retained reservation cannot disappear from the rolling-hour budget.
    const recent = Object.values(state.entries).filter(entry => entry.reserved_at !== null && entry.reserved_at > state.last_clock - HOUR)
      .map(entry => entry.reserved_at).sort((a, b) => a - b);
    if (canonical(recent) !== canonical(state.fresh_reservations.filter(time => time > state.last_clock - HOUR))) fail('journal_corrupt');
  }
  #maintenance(state, now) {
    state.last_clock = now;
    state.fresh_reservations = state.fresh_reservations.filter(time => time > now - HOUR);
    for (const entry of Object.values(state.entries)) if (Date.parse(entry.identity.expires_at) <= now || state.control.state === 'revoked') entry.body = null;
  }
  #allowed(state, now) {
    if (state.control.state !== 'active' || Date.parse(this.#binding.authorization.expires_at) <= now) fail('consent_inactive');
  }
  async #transaction(callback, afterCommit) {
    this.#activeObject();
    try {
      const result = await this.#store.transaction(state => {
        this.#activeObject(); const now = this.#now(); this.#guard(state, now);
        if (state.binding === null) fail('journal_corrupt');
        this.#maintenance(state, now);
        const maintained = structuredClone(state);
        try {
          const value = callback(state, now);
          if (Buffer.byteLength(canonical(state)) > MAX_BYTES) fail('journal_capacity');
          this.#guard(state, now);
          return { ok: true, value };
        } catch (error) {
          // Denial must not roll back expiry/revocation cleanup. Roll back only the
          // failed operation, and expose its fixed error after maintenance commits.
          for (const key of Object.keys(state)) delete state[key];
          Object.assign(state, maintained); this.#guard(state, now);
          return { ok: false, code: safe(error).code };
        }
      }, afterCommit ? { afterCommit: result => { if (result.ok) afterCommit(result.value); } } : undefined);
      if (!result.ok) fail(result.code);
      return result.value;
    } catch (error) { throw safe(error); }
  }
  async initialize() {
    try {
      await this.#store.transaction(state => {
        const now = this.#now(); this.#guard(state, now);
        if (state.binding === null) {
          if (Date.parse(this.#binding.authorization.expires_at) <= now) fail('consent_inactive');
          state.binding = structuredClone(this.#binding);
        }
        this.#maintenance(state, now); this.#guard(state, now);
      });
      return this;
    } catch (error) { this.dispose(); throw safe(error); }
  }
  async enqueue(raw) {
    this.#activeObject();
    // Caller byte ownership ends before any await; no object coercion or model-text extraction.
    if (typeof raw !== 'string' && !Buffer.isBuffer(raw) || Buffer.byteLength(raw) > 16_384) fail('invalid_journal_input');
    const copy = Buffer.isBuffer(raw) ? Buffer.from(raw) : raw;
    return this.#transaction((state, now) => {
      this.#allowed(state, now);
      const prepared = readBody(copy, this.#binding.authorization, now), id = prepared.identity;
      const prior = state.entries[id.event_id];
      if (prior) {
        if (canonical(prior.identity) !== canonical(id)) fail('event_conflict');
        return { ...evidence(), event_id: id.event_id, body_sha256: id.body_sha256, phase: prior.phase, newly_staged: false };
      }
      for (const entry of Object.values(state.entries)) {
        const other = entry.identity;
        if (other.sequence === id.sequence || other.window_id === id.window_id && other.group_sha256 !== id.group_sha256
          || other.window_id !== id.window_id && Date.parse(other.window_start) < Date.parse(id.window_end)
          && Date.parse(id.window_start) < Date.parse(other.window_end)) fail('event_conflict');
      }
      if (Object.keys(state.entries).length >= MAX_ENTRIES) fail('journal_capacity');
      state.entries[id.event_id] = { identity: id, identity_sha256: digest(id), body: prepared.body,
        phase: 'pending', attempt_id: null, reserved_at: null, reservation_generation: null, finished_at: null, observation: null };
      return { ...evidence(), event_id: id.event_id, body_sha256: id.body_sha256, phase: 'pending', newly_staged: true };
    });
  }
  async reserve(input) {
    const { event_id: eventId } = data(input, ['event_id']);
    if (typeof eventId !== 'string' || !uuid.test(eventId)) fail('invalid_journal_input');
    let installedAttempt;
    try {
    const result = await this.#transaction((state, now) => {
      this.#allowed(state, now);
      const entry = state.entries[eventId];
      if (!entry) fail('invalid_journal_input');
      if (Date.parse(entry.identity.expires_at) <= now) fail('page_expired');
      if (entry.phase !== 'pending' || Object.values(state.entries).some(page => page.phase === 'reserved')) fail('attempt_blocked');
      if (state.fresh_reservations.length >= 4) fail('fresh_budget_exhausted');
      readBody(entry.body, this.#binding.authorization, now);
      entry.phase = 'reserved'; entry.attempt_id = randomUUID(); entry.reserved_at = now;
      entry.reservation_generation = state.control.generation; state.fresh_reservations.push(now);
      return { ...evidence(), event_id: eventId, attempt_id: entry.attempt_id, body_sha256: entry.identity.body_sha256,
        body: entry.body, original_expires_at: entry.identity.expires_at, reservation_committed: true,
        local_reference_reservation: true };
    }, descriptor => { if (!this.#disposed) {
      installedAttempt = descriptor.attempt_id;
      this.#permits.set(descriptor.attempt_id, descriptor.event_id);
    } });
    if (!this.#permits.has(result.attempt_id)) fail('reservation_unavailable');
    return result;
    } catch (error) {
      // A store may commit and then lose its return. No hidden handle remains usable.
      if (installedAttempt) this.#permits.delete(installedAttempt);
      throw safe(error);
    }
  }
  async recordOutcome(input) {
    this.#activeObject();
    const { attempt_id: attemptId, observation } = data(input, ['attempt_id', 'observation']);
    const eventId = this.#permits.get(attemptId);
    if (!eventId) fail('reservation_unavailable');
    // A failed/malformed completion spends its local handle. An unknown result never becomes resend permission.
    this.#permits.delete(attemptId);
    const supplied = data(observation, ['connectionFailed', 'requestBodyWritten', 'responseStatus']);
    try { classifyGrokWebhookAttempt({ ...supplied, localConsentActive: false }); } catch { fail('invalid_journal_input'); }
    return this.#transaction((state, now) => {
      const entry = state.entries[eventId];
      if (!entry || entry.attempt_id !== attemptId || entry.phase !== 'reserved') fail('reservation_unavailable');
      const observations = { ...supplied, localConsentActive: state.control.state === 'active'
        && state.control.generation === entry.reservation_generation
        && Date.parse(this.#binding.authorization.expires_at) > now };
      const outcome = classifyGrokWebhookAttempt(observations);
      entry.observation = observations; entry.phase = outcome.outcome; entry.finished_at = now;
      return { ...evidence(), event_id: eventId, attempt_id: attemptId, phase: entry.phase, outcome_model: outcome };
    });
  }
  async setLocalControl(input) {
    const change = data(input, ['state']);
    if (!['active', 'paused', 'revoked'].includes(change.state)) fail('invalid_journal_input');
    return this.#transaction((state, now) => {
      if (state.control.state === 'revoked' && change.state !== 'revoked') fail('consent_inactive');
      if (change.state === 'active' && Date.parse(this.#binding.authorization.expires_at) <= now) fail('consent_inactive');
      if (state.control.state !== change.state) {
        if (state.control.generation === Number.MAX_SAFE_INTEGER) fail('journal_capacity');
        state.control = { state: change.state, generation: state.control.generation + 1 };
      }
      this.#maintenance(state, now);
      return { ...evidence(), control_state: state.control.state, control_generation: state.control.generation };
    });
  }
  async status() {
    return this.#transaction((state, now) => ({ ...evidence(), control_state: state.control.state,
      control_generation: state.control.generation, authorization_expired: Date.parse(this.#binding.authorization.expires_at) <= now,
      fresh_reservations_in_hour: state.fresh_reservations.length, capacity: { max_entries: MAX_ENTRIES, max_bytes: MAX_BYTES },
      entries: Object.values(state.entries).map(entry => ({ event_id: entry.identity.event_id, phase: entry.phase,
        original_expires_at: entry.identity.expires_at, expired: Date.parse(entry.identity.expires_at) <= now,
        body_retained: entry.body !== null, attempt_id: entry.attempt_id,
        outcome_unfinished: entry.phase === 'reserved', remote_side_effect_possible: entry.phase === 'reserved'
          || entry.observation?.requestBodyWritten === true, resend_allowed: false })) }));
  }
  dispose() { this.#disposed = true; this.#permits.clear(); }
}

export async function openOfflineGrokDeliveryJournal(options) {
  try {
    const { store, clock, fixtureBinding } = data(options, ['store', 'clock', 'fixtureBinding']);
    if (!store || typeof store.transaction !== 'function' || typeof store.read !== 'function'
      || !clock || typeof clock.now !== 'function' || typeof clock.trusted !== 'function') fail('invalid_journal_input');
    const binding = copyBinding(fixtureBinding);
    return await new OfflineGrokDeliveryJournal(store, clock, binding).initialize();
  } catch (error) { throw safe(error); }
}
