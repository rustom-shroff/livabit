// Offline fixture facade. No native Grok invocation, server or Skill trigger.
import { Receiver } from '../receiver.mjs';
import { OapError, canonical, digest, parseJson, validateEvent } from '../protocol.mjs';

const MAX_BODY = 16_384;
const SAFE_CODES = new Set(['unauthorized', 'expired', 'scope_mismatch', 'conflicting_duplicate',
  'invalid_event', 'invalid_request', 'incompatible_version', 'unsupported_capability',
  'storage_unavailable', 'temporary_unavailable', 'payload_too_large', 'clock_untrusted']);
const fail = code => { throw new OapError(code, 'The offline admission operation was rejected.'); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const ownData = (value, keys) => plain(value)
  && Reflect.ownKeys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
const evidence = () => ({
  target: 'grok-bot', synthetic_fixture: true, local_reference_profile: 'direct-loopback-test-v1',
  native_invocation_authenticated: false, native_webhook_receipt_observed: false,
  native_profile_enabled: false, actual_bot_accessed: false, skill_invoked: false,
  evaluation_observed: false, exactly_once_evaluation_proven: false,
  automatic_retry: false, m2_gate_satisfied: false
});
const sanitized = error => new OapError(SAFE_CODES.has(error?.code) ? error.code : 'temporary_unavailable',
  'The offline admission operation was rejected.');
const streamKey = binding => `${binding.deviceBindingId}\0${binding.authorization.recipient_id}\0${binding.authorization.stream_id}`;

class OfflineGrokAdmissionModel {
  #receiver; #binding; #token; #disposed = false;
  constructor(receiver, binding) {
    this.#receiver = receiver;
    this.#binding = structuredClone({ authorization: binding.authorization, deviceBindingId: binding.deviceBindingId });
    this.#token = Buffer.from(binding.token, 'utf8');
  }
  #active() { if (this.#disposed) fail('unauthorized'); }
  async #authenticate() {
    this.#active();
    const peer = await this.#receiver.authenticate(this.#token.toString('utf8'));
    this.#active();
    if (peer.profile_id !== 'direct-loopback-test-v1'
      || peer.device_binding_id !== this.#binding.deviceBindingId
      || canonical(peer.authorization) !== canonical(this.#binding.authorization)) fail('unauthorized');
    return peer;
  }
  async initialize() {
    try { await this.#authenticate(); return this; }
    catch (error) { this.dispose(); throw sanitized(error); }
  }
  async admit(rawBody) {
    try {
      this.#active();
      // Copy caller-owned bytes before the first await. Objects/model text extraction are unsupported.
      if (typeof rawBody !== 'string' && !Buffer.isBuffer(rawBody)) fail('invalid_event');
      if (Buffer.byteLength(rawBody) > MAX_BODY) fail('payload_too_large');
      const body = typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody);
      const peer = await this.#authenticate();
      const event = parseJson(body, MAX_BODY);
      validateEvent(event);
      // The reference store discards these optional fields. Refuse them here so the
      // complete reconstructed event can be checked against its original ledger digest.
      if (Object.hasOwn(event, 'extensions') || event.summary.apps.some(app => Object.hasOwn(app.application, 'label'))) fail('unsupported_capability');
      this.#active();
      const localReceipt = await this.#receiver.consume(event, peer);
      // Consumption is already durable. No later projection or model call can recategorize it.
      return { ...evidence(), evidence_kind: 'offline_grok_routine_admission',
        local_validated_durable_consumption: true, local_receipt: localReceipt };
    } catch (error) { throw sanitized(error); }
  }
  async inspect() {
    try {
      const before = await this.#authenticate();
      const snapshot = await this.#receiver.snapshot();
      const after = await this.#authenticate();
      if (before.token_hash !== after.token_hash || canonical(before.authorization) !== canonical(after.authorization)) fail('unauthorized');
      const now = this.#receiver.now();
      this.#active();
      const authorization = after.authorization;
      const key = streamKey(this.#binding);
      const windows = [];
      let expiredGroups = 0;
      for (const [groupKey, group] of Object.entries(snapshot.groups)) {
        if (group.stream_key !== key) continue;
        const metadata = group.metadata;
        if (metadata.recipient_id !== authorization.recipient_id || metadata.stream_id !== authorization.stream_id
          || metadata.subscription_id !== authorization.subscription_id || metadata.scope_revision !== authorization.scope_revision) continue;
        const pages = [];
        for (const [index, page] of Object.entries(group.pages)) {
          const pageIndex = Number(index);
          const ledger = snapshot.ledger[page.ledger_key];
          if (groupKey !== `${key}\0${metadata.window?.window_id}`
            || page.ledger_key !== `${key}\0${page.event_id}`
            || ledger?.stream_key !== key || ledger?.group_key !== groupKey
            || ledger?.event_id !== page.event_id || ledger?.page_index !== pageIndex
            || ledger?.sequence !== page.sequence || page.sequence !== metadata.first_sequence + pageIndex) fail('storage_unavailable');
          const event = { protocol_version: '0.1.0', event_name: 'activity.summary', event_id: page.event_id,
            recipient_id: metadata.recipient_id, stream_id: metadata.stream_id,
            subscription_id: metadata.subscription_id, scope_revision: metadata.scope_revision,
            sequence: page.sequence, emitted_at: metadata.emitted_at, expires_at: metadata.expires_at,
            window: metadata.window, summary: { metric: 'foreground_duration', unit: 'millisecond',
              aggregation_interval_ms: metadata.aggregation_interval_ms, page_index: pageIndex,
              page_count: metadata.page_count, coverage: metadata.coverage, apps: page.apps } };
          // Revalidate persisted observations, not merely their index shapes. Expired pages stay unavailable.
          validateEvent(event, { authorization });
          if (digest(event) !== ledger.digest) fail('storage_unavailable');
          if (Date.parse(event.expires_at) > now) validateEvent(event, { now, authorization });
          pages.push({ page_index: pageIndex, event_id: page.event_id, sequence: page.sequence,
            apps: page.apps.map(app => ({ application: { namespace: app.application.namespace, id: app.application.id },
              foreground_duration_ms: app.foreground_duration_ms })) });
        }
        if (Date.parse(metadata.expires_at) <= now) { expiredGroups++; continue; }
        pages.sort((a, b) => a.page_index - b.page_index);
        const missing = Array.from({ length: metadata.page_count }, (_, index) => index)
          .filter(index => !pages.some(page => page.page_index === index));
        const allPagesPresent = missing.length === 0;
        if (!pages.length || allPagesPresent && !pages.some(page => page.apps.length)) fail('storage_unavailable');
        windows.push({ protocol_version: '0.1.0', recipient_id: metadata.recipient_id, stream_id: metadata.stream_id,
          subscription_id: metadata.subscription_id, scope_revision: metadata.scope_revision,
          window: structuredClone(metadata.window), emitted_at: metadata.emitted_at, expires_at: metadata.expires_at,
          aggregation_interval_ms: metadata.aggregation_interval_ms, coverage: structuredClone(metadata.coverage),
          expected_page_count: metadata.page_count, missing_page_indices: missing,
          all_pages_present: allPagesPresent,
          whole_window_claim_supported: allPagesPresent && metadata.coverage.status === 'complete',
          absent_activity_is_zero: false, pages });
      }
      windows.sort((a, b) => Date.parse(a.window.end) - Date.parse(b.window.end)
        || a.window.window_id.localeCompare(b.window.window_id));
      const stream = snapshot.streams[key];
      return { ...evidence(), evidence_kind: 'offline_grok_routine_observation_view',
        evaluated_at: new Date(now).toISOString(), retained_expired_groups_omitted: expiredGroups,
        view_atomic_with_prior_receipt: false, windows,
        sequence_gaps: { scope: 'bound_device_recipient_stream',
          missing_ranges: structuredClone(stream?.missing_ranges ?? []),
          missing_detail_truncated: stream?.missing_detail_truncated ?? false } };
    } catch (error) { throw sanitized(error); }
  }
  dispose() { this.#disposed = true; this.#token.fill(0); }
}

export async function createOfflineGrokAdmissionModel(options) {
  try {
    if (!ownData(options, ['store', 'clock', 'fixtureBinding'])
      || !ownData(options.fixtureBinding, ['authorization', 'token', 'deviceBindingId'])) fail('invalid_request');
    const binding = structuredClone(options.fixtureBinding);
    if (typeof binding.token !== 'string' || !/^[A-Za-z0-9._~+/-]{43,512}={0,2}$/.test(binding.token)
      || !Array.isArray(binding.authorization?.scope?.applications)
      || !binding.authorization.scope.applications.length
      || binding.authorization.scope.applications.some(app => app.namespace !== 'test.app')) fail('invalid_request');
    const receiver = new Receiver({ store: options.store, clock: options.clock });
    // Credentials/authorization must already be provisioned by the owned fixture driver.
    // This facade creates no grant and accepts no caller-supplied peer or native identity.
    return await new OfflineGrokAdmissionModel(receiver, binding).initialize();
  } catch (error) { throw sanitized(error); }
}
