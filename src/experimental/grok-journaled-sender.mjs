// Module-owned virtual wire only. No endpoint, HTTP client, native probe or model invocation.
import { Receiver } from '../receiver.mjs';
import { performance } from 'node:perf_hooks';
import { canonical, digest, parseJson, validateEvent } from '../protocol.mjs';
import { openOfflineGrokDeliveryJournal } from './grok-delivery-journal.mjs';
import { createOfflineGrokAdmissionModel } from './grok-routine-admission.mjs';

const SCENARIOS = new Set(['accept_and_consume', 'accept_without_consumption', 'consume_then_lose_response',
  'reject_401', 'throw_after_body', 'fail_before_body', 'hold_after_consumption']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const codes = new Set(['invalid_sender_input', 'sender_unavailable', 'sender_busy', 'reservation_failed',
  'outcome_commit_failed', 'staging_failed', 'fixture_setup_failed', 'fixture_control_failed', 'fixture_receiver_unavailable']);
const receiverCodes = new Set(['unauthorized', 'expired', 'scope_mismatch', 'conflicting_duplicate', 'invalid_event',
  'storage_unavailable', 'clock_untrusted', 'unsupported_capability', 'temporary_unavailable']);
const abortedGetter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get;
const addListener = EventTarget.prototype.addEventListener;
const removeListener = EventTarget.prototype.removeEventListener;
function aborted(signal) {
  if (signal === undefined) return false;
  try {
    if (!(signal instanceof AbortSignal)) fail('invalid_sender_input');
    const value = abortedGetter.call(signal);
    if (typeof value !== 'boolean') fail('invalid_sender_input');
    return value;
  } catch { fail('invalid_sender_input'); }
}
export class GrokSyntheticSenderError extends Error {
  constructor(code, bodyStarted = false) {
    super('The offline synthetic sender operation was rejected.'); this.name = 'GrokSyntheticSenderError';
    this.code = codes.has(code) ? code : 'sender_unavailable'; this.fixture_body_submission_attempted = bodyStarted;
    this.automatic_retry_allowed = false;
  }
}
const fail = (code, started = false) => { throw new GrokSyntheticSenderError(code, started); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function data(value, required, optional = []) {
  try {
  if (!plain(value)) fail('invalid_sender_input');
  const keys = Reflect.ownKeys(value);
  if (required.some(key => !Object.hasOwn(value, key)) || keys.some(key => typeof key !== 'string'
    || ![...required, ...optional].includes(key)
    || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) fail('invalid_sender_input');
  return Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(value, key).value]));
  } catch { fail('invalid_sender_input'); }
}
function jsonCopy(value, depth = 0) {
  if (depth > 16) fail('invalid_sender_input');
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return value;
  if (Array.isArray(value)) {
    if (value.length > 1024 || Reflect.ownKeys(value).length !== value.length + 1) fail('invalid_sender_input');
    return Array.from({ length: value.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('invalid_sender_input');
      return jsonCopy(descriptor.value, depth + 1);
    });
  }
  if (!plain(value) || Reflect.ownKeys(value).length > 1024) fail('invalid_sender_input');
  const result = {};
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor || !Object.hasOwn(descriptor, 'value')) fail('invalid_sender_input');
    Object.defineProperty(result, key, { value: jsonCopy(descriptor.value, depth + 1), enumerable: true, writable: true, configurable: true });
  }
  return result;
}
const evidence = () => ({ target: 'grok-bot', evidence_kind: 'offline_grok_journaled_sender', synthetic_fixture: true,
  virtual_wire_only: true, network_accessed: false, network_permission_granted: false,
  native_profile_enabled: false, actual_host_observed: false, native_valid_consumption_proven: false,
  evaluation_observed: false, skill_invoked: false, m2_gate_satisfied: false, automatic_retry_allowed: false });

class OfflineGrokSyntheticSender {
  #journal; #admission; #clock; #binding; #pending = null; #epoch = 0; #denying = false; #disposed = false;
  constructor(clock, binding) {
    this.#clock = clock;
    this.#binding = { authorization: binding.authorization, deviceBindingId: binding.deviceBindingId };
  }
  #active() { if (this.#disposed) fail('sender_unavailable'); }
  #fencedStore(store) {
    return { read: () => store.read(), transaction: (fn, options) => store.transaction(fn, {
      afterCommit: (result, committed) => {
        // Install the journal's local outcome handle first. Start synchronously before releasing its lock.
        options?.afterCommit?.(result, committed);
        const descriptor = result?.ok === true ? result.value : null;
        const pending = this.#pending;
        if (pending && !pending.reservationSeen && descriptor?.local_reference_reservation === true
          && descriptor.event_id === pending.eventId) {
          pending.reservationSeen = true; pending.attemptId = descriptor.attempt_id;
          this.#startFixture(pending, descriptor, committed);
        }
      }
    }) };
  }
  #startFixture(pending, descriptor, committed) {
    try {
      const now = this.#clock.now();
      const entry = committed?.entries?.[descriptor.event_id];
      if (this.#disposed || this.#denying || pending.epoch !== this.#epoch || pending.done || aborted(pending.signal)
        || performance.now() >= pending.deadline
        || this.#clock.trusted() !== true || !Number.isSafeInteger(now) || now < committed.last_clock
        || committed.control?.state !== 'active' || entry?.phase !== 'reserved'
        || entry.attempt_id !== descriptor.attempt_id || entry.reservation_generation !== committed.control.generation
        || descriptor.body !== entry.body || digest(descriptor.body) !== entry.identity.body_sha256
        || Date.parse(entry.identity.expires_at) <= now || Date.parse(this.#binding.authorization.expires_at) <= now) {
        pending.finish(true, null); return;
      }
      const event = parseJson(descriptor.body, 16_384);
      validateEvent(event, { now, authorization: this.#binding.authorization });
      if (event.event_id !== pending.eventId || canonical(event) !== descriptor.body) { pending.finish(true, null); return; }
      if (pending.scenario === 'fail_before_body') { pending.finish(true, null); return; }
      if (performance.now() >= pending.deadline || this.#disposed || this.#denying
        || pending.epoch !== this.#epoch || pending.done || aborted(pending.signal)) {
        pending.finish(true, null); return;
      }
      // Before any fixture invocation: a throwing/partial submission stays uncertain.
      pending.bodyStarted = true;
      if (pending.scenario === 'throw_after_body') { pending.finish(true, null); return; }
      if (pending.scenario === 'reject_401') { pending.finish(false, 401); return; }
      if (pending.scenario === 'accept_without_consumption') { pending.finish(false, 200); return; }
      pending.receiver = { state: 'pending', local_validated_durable_consumption: false };
      // This is the only submission path. The module-owned receiver is a final local fixture consumer.
      this.#admission.admit(descriptor.body).then(result => {
        pending.receiver = { state: result.local_receipt.disposition, local_validated_durable_consumption: true,
          local_receipt: structuredClone(result.local_receipt) };
        pending.consumptionFinished = true;
        this.#respondFixture(pending);
      }, error => {
        let code = 'temporary_unavailable';
        try { if (receiverCodes.has(error?.code)) code = error.code; } catch {}
        pending.receiver = { state: 'rejected', local_validated_durable_consumption: false, error_code: code };
        pending.consumptionFinished = true;
        this.#respondFixture(pending);
      });
    } catch { pending.finish(true, null); }
  }
  #respondFixture(pending) {
    if (pending.done) return;
    if (pending.scenario === 'consume_then_lose_response') pending.finish(true, null);
    else if (pending.scenario !== 'hold_after_consumption' || pending.released) pending.finish(false, 200);
  }
  async stage(raw) {
    this.#active();
    try {
      if (Buffer.isBuffer(raw)) {
        for (const key of ['length', 'byteLength', 'byteOffset', 'buffer']) {
          const descriptor = Object.getOwnPropertyDescriptor(raw, key);
          if (descriptor && !Object.hasOwn(descriptor, 'value')) fail('invalid_sender_input');
        }
      }
      return await this.#journal.enqueue(raw);
    } catch { fail('staging_failed'); }
  }
  async sendOne(input) {
    this.#active();
    const options = data(input, ['event_id', 'scenario'], ['signal', 'timeoutMs']);
    const timeout = options.timeoutMs ?? 1000;
    if (typeof options.event_id !== 'string' || !uuid.test(options.event_id) || !SCENARIOS.has(options.scenario)
      || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 30_000) fail('invalid_sender_input');
    const alreadyAborted = aborted(options.signal);
    if (this.#pending) fail('sender_busy');
    if (this.#denying || alreadyAborted) fail('sender_unavailable');
    let resolve;
    const outcome = new Promise(done => { resolve = done; });
    const pending = { eventId: options.event_id, scenario: options.scenario, signal: options.signal, epoch: this.#epoch,
      bodyStarted: false, reservationSeen: false, done: false, released: false, consumptionFinished: false,
      deadline: performance.now() + timeout,
      receiver: { state: 'not_invoked', local_validated_durable_consumption: false },
      finish(connectionFailed, responseStatus) {
        if (this.done) return; this.done = true;
        if (responseStatus !== null && performance.now() >= this.deadline) {
          connectionFailed = true; responseStatus = null;
        }
        resolve({ connectionFailed, requestBodyWritten: this.bodyStarted, responseStatus });
      } };
    this.#pending = pending;
    const abort = () => pending.finish(true, null);
    const timer = setTimeout(abort, timeout);
    try {
      try { if (options.signal) addListener.call(options.signal, 'abort', abort, { once: true }); }
      catch { fail('invalid_sender_input'); }
      let reservation;
      try { reservation = await this.#journal.reserve({ event_id: options.event_id }); }
      catch { fail('reservation_failed', pending.bodyStarted); }
      // A store lacking the required synchronous afterCommit path cannot perform submission.
      if (!pending.reservationSeen) pending.finish(true, null);
      const observation = await outcome;
      let recorded;
      try { recorded = await this.#journal.recordOutcome({ attempt_id: reservation.attempt_id, observation }); }
      catch { fail('outcome_commit_failed', pending.bodyStarted); }
      return { ...evidence(), event_id: reservation.event_id, attempt_id: reservation.attempt_id,
        body_sha256: reservation.body_sha256, original_expires_at: reservation.original_expires_at,
        fixture_body_submission_attempted: pending.bodyStarted, journal_outcome: recorded,
        fixture_receiver: structuredClone(pending.receiver) };
    } finally {
      clearTimeout(timer);
      try { if (options.signal) removeListener.call(options.signal, 'abort', abort); } catch {}
      pending.finish(true, null); if (this.#pending === pending) this.#pending = null;
    }
  }
  async setLocalControl(input) {
    this.#active();
    const change = data(input, ['state']);
    if (!['active', 'paused', 'revoked'].includes(change.state)) fail('invalid_sender_input');
    const epoch = ++this.#epoch;
    this.#denying = true; this.#pending?.finish(true, null);
    try {
      const result = await this.#journal.setLocalControl(change);
      if (this.#epoch === epoch && !this.#disposed) this.#denying = result.control_state !== 'active';
      return result;
    } catch { fail('fixture_control_failed'); }
  }
  async status() { this.#active(); return this.#journal.status(); }
  async inspectReceiver() {
    this.#active();
    try { return await this.#admission.inspect(); } catch { fail('fixture_receiver_unavailable'); }
  }
  releaseHeldResponse(input) {
    this.#active(); const { event_id: eventId } = data(input, ['event_id']);
    const pending = this.#pending;
    if (typeof eventId !== 'string' || !uuid.test(eventId) || !pending || pending.eventId !== eventId
      || pending.scenario !== 'hold_after_consumption' || pending.done) fail('invalid_sender_input');
    pending.released = true;
    if (pending.consumptionFinished) this.#respondFixture(pending);
  }
  dispose() {
    this.#disposed = true; this.#epoch++; this.#denying = true;
    this.#pending?.finish(true, null); this.#journal?.dispose(); this.#admission?.dispose();
  }
  static async open(input) {
  let sender;
  try {
    const { journalStore, receiverStore, clock, fixtureBinding } = data(input, ['journalStore', 'receiverStore', 'clock', 'fixtureBinding']);
    if (!journalStore || !receiverStore || journalStore === receiverStore
      || [journalStore, receiverStore].some(store => typeof store.read !== 'function' || typeof store.transaction !== 'function')
      || !clock || typeof clock.now !== 'function' || typeof clock.trusted !== 'function') fail('invalid_sender_input');
    const binding = jsonCopy(data(fixtureBinding, ['authorization', 'deviceBindingId', 'token']));
    if (typeof binding.token !== 'string' || !/^[A-Za-z0-9._~+/-]{43,512}={0,2}$/u.test(binding.token)) fail('invalid_sender_input');
    sender = new OfflineGrokSyntheticSender(clock, binding);
    const journal = await openOfflineGrokDeliveryJournal({ store: sender.#fencedStore(journalStore), clock,
      fixtureBinding: { authorization: binding.authorization, deviceBindingId: binding.deviceBindingId } });
    sender.#journal = journal;
    const receiver = new Receiver({ store: receiverStore, clock });
    await receiver.configure({ authorization: binding.authorization, token: binding.token,
      deviceBindingId: binding.deviceBindingId, credentialExpiresAt: binding.authorization.expires_at });
    const admission = await createOfflineGrokAdmissionModel({ store: receiverStore, clock, fixtureBinding: binding });
    sender.#admission = admission; return sender;
  } catch (error) {
    sender?.dispose();
    if (error instanceof GrokSyntheticSenderError) throw new GrokSyntheticSenderError(error.code);
    fail('fixture_setup_failed');
  }
  }
}

export async function openOfflineGrokSyntheticSender(input) {
  return OfflineGrokSyntheticSender.open(input);
}
