import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { DevicePublisher } from '../src/publisher.mjs';
import { JsonStore } from '../src/storage.mjs';
import { aggregateSegments } from '../src/aggregation.mjs';
import { OapError, canonical, capabilities } from '../src/protocol.mjs';

const MINUTE = 60000, INTERVAL = 15 * MINUTE, START = Date.parse('2026-10-04T00:00:00.000Z');
const iso = n => new Date(n).toISOString();
const app = id => ({ namespace: 'android.package', id });
const code = name => error => error.code === name;
function cleanAllocatedTemp(t, dir, store) {
  const resolved = path.resolve(dir), temporaryRoot = path.resolve(os.tmpdir());
  if (path.dirname(resolved) !== temporaryRoot || !/^oap-(?:publisher-test|no-consent|negotiation)-/u.test(path.basename(resolved))) throw new Error('Unexpected test directory.');
  t.after(async () => { await store.close?.(); await rm(resolved, { recursive: true, force: true }); });
}
function scope(apps = [app('org.example.reader')], extra = {}) {
  return { applications: apps, allowed_fields: ['foreground_duration_ms'], event_names: ['activity.summary'],
    aggregation_interval_ms: INTERVAL, history_max_age_ms: 86400000, history_max_bytes: 4194304, ...extra };
}
function configuration(now, effectiveScope = scope(), { expires = now + 86400000, credentialExpires = expires, approvedAt = now } = {}) {
  const recipient = randomUUID(), grantId = randomUUID();
  const grant = { protocol_version: '0.1.0', grant_id: grantId, recipient_id: recipient, device_binding_id: randomUUID(), user_binding_id: randomUUID(),
    scope_revision: 1, state: 'active', created_at: iso(now), approved_at: iso(approvedAt), expires_at: iso(expires), scope: effectiveScope };
  const subscription = { protocol_version: '0.1.0', subscription_id: randomUUID(), grant_id: grantId, recipient_id: recipient, stream_id: randomUUID(), scope_revision: 1,
    state: 'active', created_at: iso(now), expires_at: iso(expires), idempotency_key: randomUUID(), scope: effectiveScope };
  const binding = { recipient_id: recipient, profile_id: 'direct-loopback-test-v1', endpoint_ref: randomUUID(), credential_ref: randomUUID() };
  const credential = { token: 'ISOLATED-TEST-ONLY-NOT-A-REAL-TOKEN', expires_at: iso(credentialExpires), profile_id: binding.profile_id,
    recipient_id: recipient, stream_id: subscription.stream_id, subscription_id: subscription.subscription_id, scope_revision: 1 };
  return { grant, subscription, binding, credential, monitoringApproved: true };
}
function candidate(start, interval = INTERVAL, apps = [{ application: app('org.example.reader'), foreground_duration_ms: 60000 }]) {
  return { start: iso(start), end: iso(start + interval), coverage: { status: 'complete', observed_intervals: [{ start: iso(start), end: iso(start + interval) }], reasons: [] }, apps };
}
async function setup(t, effectiveScope = scope(), options) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'oap-publisher-test-'));
  const clock = { value: START, now() { return this.value; }, trusted() { return true; }, advance(ms) { this.value += ms; } };
  const credentialMap = new Map();
  const credentials = { get: id => credentialMap.get(id), delete: id => credentialMap.delete(id) };
  const file = path.join(dir, 'device.json');
  const store = new JsonStore(file, {});
  const publisher = new DevicePublisher({ store, clock, credentials, random: () => 0.5 });
  const config = configuration(clock.now(), effectiveScope, options);
  credentialMap.set(config.grant.recipient_id, config.credential);
  await publisher.approve(config);
  cleanAllocatedTemp(t, dir, store);
  const receipt = event => ({ protocol_version: '0.1.0', event_id: event.event_id, recipient_id: event.recipient_id, stream_id: event.stream_id,
    sequence: event.sequence, received_at: iso(clock.now()), disposition: 'accepted', validation: 'valid' });
  return { publisher, store, file, clock, config, credentialMap, credentials, receipt };
}

test('explicit local approval is mandatory; unknown consent cannot publish', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'oap-no-consent-'));
  const store = new JsonStore(path.join(dir, 'device.json'), {});
  const publisher = new DevicePublisher({ store, clock: { now: () => START }, credentials: new Map() });
  cleanAllocatedTemp(t, dir, store);
  const c = configuration(START);
  await assert.rejects(publisher.approve({ ...c, monitoringApproved: false }), code('consent_inactive'));
  await assert.rejects(publisher.finalizeWindow(c.subscription.subscription_id, candidate(START)), code('invalid_request'));
});

test('source redaction removes unrelated applications, labels and private extras before durable state', async t => {
  const x = await setup(t); x.clock.advance(INTERVAL);
  const input = { ...candidate(START), observations: [
    { application: { ...app('org.example.reader'), label: 'DENIED_LABEL' }, start: iso(START), end: iso(START + MINUTE), message: 'PRIVATE_MESSAGE' },
    { application: app('PRIVATE_HIDDEN_APP'), start: iso(START), end: iso(START + MINUTE), url: 'PRIVATE_URL' }
  ], observed_intervals: [{ start: iso(START), end: iso(START + INTERVAL) }] };
  const events = await x.publisher.finalizeWindow(x.config.subscription.subscription_id, input);
  assert.equal(events.length, 1); assert.equal(events[0].summary.apps[0].foreground_duration_ms, MINUTE);
  assert.equal(events[0].summary.apps[0].application.label, undefined);
  const saved = await readFile(x.file, 'utf8');
  for (const privateText of ['DENIED_LABEL', 'PRIVATE_MESSAGE', 'PRIVATE_HIDDEN_APP', 'PRIVATE_URL', x.config.credential.token]) assert.equal(saved.includes(privateText), false);
});

test('separable sessions clip at consent boundary; inseparable buckets are never prorated', () => {
  const s = scope();
  const raw = { start: iso(START), end: iso(START + INTERVAL), observed_intervals: [{ start: iso(START), end: iso(START + INTERVAL) }],
    observations: [{ application: app('org.example.reader'), start: iso(START), end: iso(START + 10 * MINUTE) }] };
  const clipped = aggregateSegments(raw, s, [[START + 5 * MINUTE, START + INTERVAL]]);
  assert.equal(clipped.apps[0].foreground_duration_ms, 5 * MINUTE);
  assert.equal(clipped.coverage.status, 'partial'); assert.ok(clipped.coverage.reasons.includes('consent_boundary'));
  const dropped = aggregateSegments({ ...raw, observations: [{ ...raw.observations[0], inseparable: true }] }, s, [[START + 5 * MINUTE, START + INTERVAL]]);
  assert.deepEqual(dropped.apps, []); assert.ok(dropped.coverage.reasons.includes('source_unavailable'));
});

test('whole window immutable finalization survives restart and zero windows are suppressed', async t => {
  const x = await setup(t); x.clock.advance(INTERVAL);
  const original = await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START));
  await assert.rejects(x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START)), code('conflicting_duplicate'));
  const reboot = new DevicePublisher({ store: new JsonStore(x.file, {}), clock: x.clock, credentials: x.credentials });
  await assert.rejects(reboot.finalizeWindow(x.config.subscription.subscription_id, candidate(START)), code('conflicting_duplicate'));
  x.clock.advance(INTERVAL);
  assert.deepEqual(await reboot.finalizeWindow(x.config.subscription.subscription_id, candidate(START + INTERVAL, INTERVAL, [])), []);
  assert.equal((await x.store.read()).recipients[x.config.grant.recipient_id].entries[0].canonical, canonical(original[0]));
});

test('two recipient scopes and pseudonyms remain independent', async t => {
  const x = await setup(t); const second = configuration(START, scope([app('org.example.video')]));
  x.credentialMap.set(second.grant.recipient_id, second.credential); await x.publisher.approve(second);
  x.clock.advance(INTERVAL);
  const input = candidate(START, INTERVAL, [
    { application: { ...app('org.example.reader'), label: 'READER_LABEL' }, foreground_duration_ms: MINUTE },
    { application: app('org.example.video'), foreground_duration_ms: 2 * MINUTE }
  ]);
  const [one] = await x.publisher.finalizeWindow(x.config.subscription.subscription_id, input);
  const [two] = await x.publisher.finalizeWindow(second.subscription.subscription_id, input);
  assert.notEqual(one.recipient_id, two.recipient_id); assert.notEqual(one.stream_id, two.stream_id); assert.notEqual(one.window.window_id, two.window.window_id);
  assert.deepEqual(one.summary.apps.map(a => a.application.id), ['org.example.reader']);
  assert.deepEqual(two.summary.apps.map(a => a.application.id), ['org.example.video']);
  await x.publisher.revoke(x.config.grant.recipient_id);
  assert.equal((await x.publisher.getLocalStatus(second.grant.recipient_id)).consent_state, 'active');
});

test('pause fences queued reads and sends; resume cannot backfill paused time', async t => {
  const x = await setup(t); x.clock.advance(5 * MINUTE); await x.publisher.pause(x.config.grant.recipient_id);
  x.clock.advance(5 * MINUTE);
  await assert.rejects(x.publisher.selectReplay({ subscription_id: x.config.subscription.subscription_id }), code('consent_inactive'));
  await assert.rejects(x.publisher.dispatchNext(x.config.subscription.subscription_id, { deliver() { throw new Error('must not send'); } }), code('consent_inactive'));
  await x.publisher.resume(x.config.grant.recipient_id); x.clock.advance(5 * MINUTE);
  assert.deepEqual(await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START)), []);
});

test('revoke committed during asynchronous transport verification prevents a new network request', async t => {
  const x = await setup(t); x.clock.advance(INTERVAL); await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START));
  let release, began, sent = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { began = resolve; });
  const dispatch = x.publisher.dispatchNext(x.config.subscription.subscription_id, { async deliver(event, binding, { beforeSend }) {
    began(); await gate; beforeSend(); sent++; return x.receipt(event);
  } });
  await started; await x.publisher.revoke(x.config.grant.recipient_id); release(); await dispatch;
  assert.equal(sent, 0); assert.equal(x.credentialMap.has(x.config.grant.recipient_id), false);
  const reboot = new DevicePublisher({ store: new JsonStore(x.file, {}), clock: x.clock, credentials: x.credentials });
  await assert.rejects(reboot.selectReplay({ subscription_id: x.config.subscription.subscription_id }), code('consent_inactive'));
  assert.equal((await reboot.getLocalStatus(x.config.grant.recipient_id)).retention.queued_events, 0);
});

test('narrowing purges immutable old scope and requires admission for the new epoch', async t => {
  const wide = scope([app('org.example.reader'), app('org.example.video')]);
  const x = await setup(t, wide); x.clock.advance(INTERVAL);
  await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START));
  const narrowed = await x.publisher.narrowScope(x.config.grant.recipient_id, scope());
  assert.notEqual(narrowed.stream_id, x.config.subscription.stream_id); assert.notEqual(narrowed.subscription_id, x.config.subscription.subscription_id);
  assert.equal((await x.publisher.getLocalStatus(x.config.grant.recipient_id)).retention.queued_events, 0);
  await assert.rejects(x.publisher.selectReplay({ subscription_id: narrowed.subscription_id }), code('unauthorized'));
  x.credentialMap.set(x.config.grant.recipient_id, { ...x.config.credential, stream_id: narrowed.stream_id, subscription_id: narrowed.subscription_id, scope_revision: narrowed.scope_revision });
  await assert.rejects(x.publisher.finalizeWindow(narrowed.subscription_id, candidate(START)), code('conflicting_duplicate'));
  await assert.rejects(x.publisher.narrowScope(x.config.grant.recipient_id, wide), code('scope_mismatch'));
});

test('rolling fresh budget persists across restart and ignores retries of the same identity', async t => {
  const x = await setup(t);
  for (let i = 0; i < 5; i++) { x.clock.advance(INTERVAL); await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START + i * INTERVAL)); }
  let sent = 0;
  const adapter = { async deliver(event) { sent++; return x.receipt(event); } };
  for (let i = 0; i < 5; i++) await x.publisher.dispatchNext(x.config.subscription.subscription_id, adapter);
  assert.equal(sent, 4);
  const reboot = new DevicePublisher({ store: new JsonStore(x.file, {}), clock: x.clock, credentials: x.credentials });
  await reboot.dispatchNext(x.config.subscription.subscription_id, adapter); assert.equal(sent, 4);
  x.clock.advance(3600000); await reboot.dispatchNext(x.config.subscription.subscription_id, adapter); assert.equal(sent, 5);
});

test('six attempt cycle, receiver retry hint and explicit restart gates are bounded', async t => {
  const x = await setup(t); x.clock.advance(INTERVAL); await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START));
  let attempts = 0;
  const adapter = { async deliver() { attempts++; throw new OapError('temporary_unavailable', undefined, { retryAfterMs: 120000 }); } };
  for (let i = 0; i < 6; i++) { await x.publisher.dispatchNext(x.config.subscription.subscription_id, adapter); await x.publisher.dispatchNext(x.config.subscription.subscription_id, adapter); x.clock.advance(120000); }
  assert.equal(attempts, 6);
  assert.equal((await x.publisher.getLocalStatus(x.config.grant.recipient_id)).delivery_state, 'exhausted');
  await x.publisher.dispatchNext(x.config.subscription.subscription_id, adapter); assert.equal(attempts, 6);
  assert.equal(await x.publisher.triggerRetry(x.config.grant.recipient_id, 'user_retry'), false);
  x.clock.advance(INTERVAL); assert.equal(await x.publisher.triggerRetry(x.config.grant.recipient_id, 'user_retry'), true);
  await x.publisher.dispatchNext(x.config.subscription.subscription_id, adapter); assert.equal(attempts, 7);
  assert.equal(await x.publisher.triggerRetry(x.config.grant.recipient_id, 'user_retry'), false);
});

test('malformed acknowledgements are ambiguous and never valid consumption', async t => {
  const x = await setup(t); x.clock.advance(INTERVAL); await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START));
  const status = await x.publisher.dispatchNext(x.config.subscription.subscription_id, { async deliver() { return { okay: true }; } });
  assert.equal(status.last_valid_consumption_at, undefined); assert.equal(status.delivery_state, 'backoff');
});

test('page partitions, selection size, replay read limits and cursor isolation are enforced', async t => {
  const apps = Array.from({ length: 33 }, (_, i) => app(`org.example.a${String(i).padStart(2, '0')}`));
  const x = await setup(t, scope(apps, { aggregation_interval_ms: 2 * INTERVAL }));
  for (let i = 0; i < 3; i++) {
    x.clock.advance(2 * INTERVAL);
    const pages = await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START + i * 2 * INTERVAL, 2 * INTERVAL,
      [{ application: apps[0], foreground_duration_ms: MINUTE }]));
    assert.equal(pages.length, 2); assert.deepEqual(pages[1].summary.apps, []); assert.equal(pages[1].sequence, pages[0].sequence + 1);
  }
  const first = await x.publisher.selectReplay({ subscription_id: x.config.subscription.subscription_id, max_bytes: 65536 });
  assert.equal(first.events.length, 4); assert.equal(first.has_more, true); assert.ok(Buffer.byteLength(canonical(first)) <= 65536);
  const next = await x.publisher.selectReplay({ subscription_id: x.config.subscription.subscription_id, cursor: first.next_cursor });
  assert.equal(next.events.length, 2); assert.equal(next.has_more, false);
  await assert.rejects(x.publisher.selectReplay({ subscription_id: x.config.subscription.subscription_id, cursor: randomUUID().replaceAll('-', '') }), code('cursor_invalid'));
  await x.publisher.selectReplay({ subscription_id: x.config.subscription.subscription_id });
  await x.publisher.selectReplay({ subscription_id: x.config.subscription.subscription_id });
  await assert.rejects(x.publisher.selectReplay({ subscription_id: x.config.subscription.subscription_id }), code('rate_limited'));
});

test('expiry uses observation start; renewal cannot extend immutable event lifetime', async t => {
  const x = await setup(t, scope(undefined, { history_max_age_ms: 2 * INTERVAL }));
  x.clock.advance(INTERVAL); const [event] = await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START));
  assert.equal(event.expires_at, iso(START + 2 * INTERVAL));
  const request = { subscription_id: x.config.subscription.subscription_id, idempotency_key: randomUUID(), requested_expires_at: x.config.subscription.expires_at };
  const first = await x.publisher.renewSubscription(request); const second = await x.publisher.renewSubscription(request); assert.deepEqual(first, second);
  assert.equal((await x.store.read()).recipients[x.config.grant.recipient_id].entries[0].event.expires_at, event.expires_at);
  x.clock.advance(INTERVAL);
  const replay = await x.publisher.selectReplay({ subscription_id: x.config.subscription.subscription_id });
  assert.deepEqual(replay.events, []); assert.equal(replay.gaps[0].reason, 'expired');
});

test('clock rollback blocks data operations while local denial still commits', async t => {
  const x = await setup(t); x.clock.advance(INTERVAL); await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START));
  x.clock.value -= MINUTE;
  await assert.rejects(x.publisher.selectReplay({ subscription_id: x.config.subscription.subscription_id }), code('clock_untrusted'));
  await x.publisher.revoke(x.config.grant.recipient_id);
  const saved = await x.store.read(); assert.equal(saved.recipients[x.config.grant.recipient_id].grant.state, 'revoked');
});

test('byte quota evicts complete windows with bounded gaps', async t => {
  const x = await setup(t, scope(undefined, { history_max_bytes: 16384 }));
  for (let i = 0; i < 20; i++) { x.clock.advance(INTERVAL); await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START + i * INTERVAL)); }
  const status = await x.publisher.getLocalStatus(x.config.grant.recipient_id);
  assert.ok(status.retention.retained_bytes <= 16384); assert.ok(status.gap_count > 0); assert.ok(status.retention.queued_events < 20);
});

test('denied OS permission and durable global monitoring off prevent data operations', async t => {
  const x = await setup(t); x.clock.advance(INTERVAL);
  x.publisher.permission = 'denied';
  await assert.rejects(x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START)), code('consent_inactive'));
  assert.equal((await x.publisher.getLocalStatus(x.config.grant.recipient_id)).delivery_state, 'blocked');
  x.publisher.permission = 'granted'; await x.publisher.setMonitoringApproved(false);
  const reboot = new DevicePublisher({ store: new JsonStore(x.file, {}), clock: x.clock, credentials: x.credentials });
  await assert.rejects(reboot.finalizeWindow(x.config.subscription.subscription_id, candidate(START)), code('consent_inactive'));
  assert.equal((await reboot.getLocalStatus(x.config.grant.recipient_id)).consent_state, 'paused');
});

test('creation and renewal keys are idempotent, conflicting input is rejected and revocation cannot be renewed', async t => {
  const x = await setup(t);
  const request = { grant_id: x.config.grant.grant_id, idempotency_key: x.config.subscription.idempotency_key,
    requested_scope: x.config.subscription.scope, requested_expires_at: x.config.subscription.expires_at };
  assert.deepEqual(await x.publisher.configureSubscription(request), x.config.subscription);
  await assert.rejects(x.publisher.configureSubscription({ ...request, requested_expires_at: iso(START + INTERVAL) }), code('conflicting_duplicate'));
  const renewal = { subscription_id: x.config.subscription.subscription_id, idempotency_key: randomUUID(), requested_expires_at: x.config.subscription.expires_at };
  await x.publisher.renewSubscription(renewal);
  await assert.rejects(x.publisher.renewSubscription({ ...renewal, requested_expires_at: iso(START + INTERVAL) }), code('conflicting_duplicate'));
  await assert.rejects(x.publisher.renewSubscription({ ...renewal, idempotency_key: randomUUID(), token: 'PRIVATE_TOKEN' }), code('invalid_request'));
  await x.publisher.revoke(x.config.grant.recipient_id);
  await assert.rejects(x.publisher.renewSubscription(renewal), code('consent_inactive'));
});

test('four hour offline restart preserves authorized backlog with bounded fresh catchup', async t => {
  const x = await setup(t); await x.publisher.setNetworkAvailable(false);
  for (let i = 0; i < 16; i++) { x.clock.advance(INTERVAL); await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START + i * INTERVAL)); }
  assert.equal((await x.publisher.getLocalStatus(x.config.grant.recipient_id)).delivery_state, 'offline');
  const rebootStore = new JsonStore(x.file, {});
  const reboot = new DevicePublisher({ store: rebootStore, clock: x.clock, credentials: x.credentials });
  await reboot.initialize(); let sent = 0;
  const adapter = { async deliver(event) { sent++; return x.receipt(event); } };
  for (let i = 0; i < 16; i++) await reboot.dispatchNext(x.config.subscription.subscription_id, adapter);
  assert.equal(sent, 4); assert.equal((await reboot.getLocalStatus(x.config.grant.recipient_id)).retention.queued_events, 12);
  x.clock.advance(3600000);
  for (let i = 0; i < 16; i++) await reboot.dispatchNext(x.config.subscription.subscription_id, adapter);
  assert.equal(sent, 8);
});

test('receiver capability intersection rejects unsupported namespace and insufficient approved cadence', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'oap-negotiation-'));
  const store = new JsonStore(path.join(dir, 'device.json'), {}); cleanAllocatedTemp(t, dir, store);
  const c = configuration(START), provider = new Map([[c.grant.recipient_id, c.credential]]);
  const publisher = new DevicePublisher({ store, clock: { now: () => START }, credentials: provider });
  const receiver = capabilities('receiver');
  await assert.rejects(publisher.approve({ ...c, receiverCapabilities: { ...receiver, application_namespaces: ['unsupported.namespace'] } }), code('unsupported_capability'));
  await assert.rejects(publisher.approve({ ...c, receiverCapabilities: { ...receiver, limits: { ...receiver.limits, max_fresh_events_per_hour: 1 } } }), code('scope_unsupported'));
  await assert.rejects(publisher.approve({ ...c, binding: { ...c.binding, token: 'PRIVATE_TOKEN' } }), code('invalid_request'));
});

test('idempotency quota never evicts live keys and cannot block revocation', async t => {
  const x = await setup(t);
  for (let i = 0; i < 63; i++) await x.publisher.renewSubscription({ subscription_id: x.config.subscription.subscription_id,
    idempotency_key: randomUUID(), requested_expires_at: x.config.subscription.expires_at });
  await assert.rejects(x.publisher.renewSubscription({ subscription_id: x.config.subscription.subscription_id,
    idempotency_key: randomUUID(), requested_expires_at: x.config.subscription.expires_at }), code('storage_unavailable'));
  assert.equal((await x.publisher.revoke(x.config.grant.recipient_id)).consent_state, 'revoked');
});

test('accelerated full day respects rolling publication budgets, record limits and final grant expiry', async t => {
  const x = await setup(t); const dispatchTimes = [];
  const adapter = { async deliver(event) {
    assert.ok(Buffer.byteLength(canonical(event)) <= 16384);
    dispatchTimes.push(x.clock.now()); return x.receipt(event);
  } };
  for (let i = 0; i < 95; i++) {
    x.clock.advance(INTERVAL); await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START + i * INTERVAL));
    await x.publisher.dispatchNext(x.config.subscription.subscription_id, adapter);
    const inHour = dispatchTimes.filter(n => n > x.clock.now() - 3600000); assert.ok(inHour.length <= 4);
  }
  x.clock.advance(INTERVAL);
  await assert.rejects(x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START + 95 * INTERVAL)), code('expired'));
  const status = await x.publisher.getLocalStatus(x.config.grant.recipient_id);
  assert.equal(status.consent_state, 'expired'); assert.equal(status.retention.queued_events, 0);
  assert.ok(status.retention.retained_bytes <= status.retention.max_bytes);
});

test('recipient backpressure cannot be bypassed by another event, restart or an early explicit repair', async t => {
  const x = await setup(t);
  for (let i = 0; i < 2; i++) { x.clock.advance(INTERVAL); await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START + i * INTERVAL)); }
  const second = configuration(START); x.credentialMap.set(second.grant.recipient_id, second.credential); await x.publisher.approve(second);
  await x.publisher.finalizeWindow(second.subscription.subscription_id, candidate(START + INTERVAL));
  let attempts = 0;
  const failing = { async deliver() { attempts++; throw new OapError('temporary_unavailable', undefined, { retryAfterMs: 2 * 3600000 }); } };
  await x.publisher.dispatchNext(x.config.subscription.subscription_id, failing);
  await x.publisher.dispatchNext(x.config.subscription.subscription_id, failing); assert.equal(attempts, 1);
  assert.equal(await x.publisher.triggerRetry(x.config.grant.recipient_id, 'credential_repair'), false);
  let other = 0;
  await x.publisher.dispatchNext(second.subscription.subscription_id, { async deliver(event) { other++; return x.receipt(event); } }); assert.equal(other, 1);
  const reboot = new DevicePublisher({ store: new JsonStore(x.file, {}), clock: x.clock, credentials: x.credentials });
  await reboot.initialize(); await reboot.dispatchNext(x.config.subscription.subscription_id, failing); assert.equal(attempts, 1);
  x.clock.advance(2 * 3600000);
  await reboot.dispatchNext(x.config.subscription.subscription_id, failing); assert.equal(attempts, 1);
  assert.equal((await reboot.getLocalStatus(x.config.grant.recipient_id)).delivery_state, 'exhausted');
  assert.equal(await reboot.triggerRetry(x.config.grant.recipient_id, 'user_retry'), true);
  const successful = { async deliver(event) { attempts++; return x.receipt(event); } };
  await reboot.dispatchNext(x.config.subscription.subscription_id, successful);
  await reboot.dispatchNext(x.config.subscription.subscription_id, successful); assert.equal(attempts, 3);
});

test('short receiver retry hint pauses every pending recipient event until its deadline', async t => {
  const x = await setup(t);
  for (let i = 0; i < 2; i++) { x.clock.advance(INTERVAL); await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START + i * INTERVAL)); }
  let attempts = 0;
  await x.publisher.dispatchNext(x.config.subscription.subscription_id, { async deliver() {
    attempts++; throw new OapError('rate_limited', undefined, { retryAfterMs: 30 * MINUTE });
  } });
  const successful = { async deliver(event) { attempts++; return x.receipt(event); } };
  await x.publisher.dispatchNext(x.config.subscription.subscription_id, successful); assert.equal(attempts, 1);
  x.clock.advance(30 * MINUTE - 1); await x.publisher.dispatchNext(x.config.subscription.subscription_id, successful); assert.equal(attempts, 1);
  x.clock.advance(1); await x.publisher.dispatchNext(x.config.subscription.subscription_id, successful); assert.equal(attempts, 2);
});

test('suppressed oversized and unobservable windows expose safe health instead of healthy zero usage', async t => {
  const apps = Array.from({ length: 32 }, (_, i) => app(`org.example.a${String(i).padStart(2, '0')}.${'x'.repeat(100)}`));
  const x = await setup(t, scope(apps));
  // Negotiate the stricter cap as part of a fresh local approval, not by changing queue contents.
  await x.publisher.revoke(x.config.grant.recipient_id);
  const c = configuration(START, scope(apps)); x.credentialMap.set(c.grant.recipient_id, c.credential);
  const receiver = capabilities('receiver');
  await x.publisher.approve({ ...c, receiverCapabilities: { ...receiver, limits: { ...receiver.limits, max_event_bytes: 4096 } } });
  x.clock.advance(INTERVAL);
  const input = candidate(START, INTERVAL, apps.map(application => ({ application, foreground_duration_ms: MINUTE })));
  assert.deepEqual(await x.publisher.finalizeWindow(c.subscription.subscription_id, input), []);
  assert.equal((await x.publisher.getLocalStatus(c.grant.recipient_id)).delivery_state, 'unsupported');
  assert.equal((await x.publisher.getLocalError(c.grant.recipient_id)).code, 'payload_too_large');
  const next = configuration(x.clock.now()); x.credentialMap.set(next.grant.recipient_id, next.credential); await x.publisher.approve(next);
  const start = x.clock.now(); x.clock.advance(INTERVAL);
  assert.deepEqual(await x.publisher.finalizeWindow(next.subscription.subscription_id, { start: iso(start), end: iso(start + INTERVAL), observations: [], observed_intervals: [] }), []);
  assert.equal((await x.publisher.getLocalStatus(next.grant.recipient_id)).delivery_state, 'blocked');
  assert.equal((await x.publisher.getLocalError(next.grant.recipient_id)).code, 'history_unavailable');
});

test('valid JSON corrupt accounting cannot increase retries or grant activity authority', async t => {
  for (const corrupt of [r => { r.entries[0].attempts = -100; }, r => { r.limits.max_attempts_per_cycle = 100; }, r => { r.subscription.state = 'expired'; }]) {
    const x = await setup(t); x.clock.advance(INTERVAL); await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START));
    await x.store.transaction(state => corrupt(state.recipients[x.config.grant.recipient_id]));
    let sent = 0;
    await assert.rejects(x.publisher.dispatchNext(x.config.subscription.subscription_id, { async deliver(event) { sent++; return x.receipt(event); } }), code('consent_inactive'));
    assert.equal(sent, 0);
  }
  const x = await setup(t); await x.store.transaction(state => { state.monitoringApproved = 'true'; });
  await assert.rejects(x.publisher.initialize(), code('consent_inactive'));
});

async function finalizeSequential(x, count, firstIndex = 0, subscriptionId = x.config.subscription.subscription_id) {
  for (let i = firstIndex; i < firstIndex + count; i++) {
    x.clock.advance(INTERVAL);
    await x.publisher.finalizeWindow(subscriptionId, candidate(START + i * INTERVAL));
  }
}

test('a replay cursor cannot cross recipient authority', async t => {
  const x = await setup(t); const second = configuration(START);
  x.credentialMap.set(second.grant.recipient_id, second.credential); await x.publisher.approve(second);
  await finalizeSequential(x, 6);
  const first = await x.publisher.selectReplay({ subscription_id: x.config.subscription.subscription_id });
  assert.equal(first.has_more, true);
  await assert.rejects(x.publisher.selectReplay({ subscription_id: second.subscription.subscription_id, cursor: first.next_cursor }), code('cursor_invalid'));
  const secondBatch = await x.publisher.selectReplay({ subscription_id: second.subscription.subscription_id });
  assert.deepEqual(secondBatch.events, []); assert.deepEqual(secondBatch.gaps, []); assert.equal(secondBatch.recipient_id, second.grant.recipient_id);
});

test('cursor lifetime expires while a longer approved subscription remains active', async t => {
  const x = await setup(t, scope(), { expires: START + 2 * 86400000 });
  await finalizeSequential(x, 6);
  const first = await x.publisher.selectReplay({ subscription_id: x.config.subscription.subscription_id });
  assert.equal(first.has_more, true);
  x.clock.advance(86400000);
  assert.equal((await x.publisher.getLocalStatus(x.config.grant.recipient_id)).consent_state, 'active');
  await assert.rejects(x.publisher.selectReplay({ subscription_id: x.config.subscription.subscription_id, cursor: first.next_cursor }), code('cursor_invalid'));
  const current = await x.publisher.selectReplay({ subscription_id: x.config.subscription.subscription_id });
  assert.deepEqual(current.events, []); assert.ok(current.gaps.length > 0);
});

test('an evicted cursor position returns cursor_stale with safe current-scope recovery gaps', async t => {
  const x = await setup(t, scope(undefined, { history_max_bytes: 32768 }));
  await finalizeSequential(x, 6);
  const first = await x.publisher.selectReplay({ subscription_id: x.config.subscription.subscription_id });
  assert.equal(first.has_more, true); const originalPosition = first.events.at(-1).sequence;
  await finalizeSequential(x, 20, 6);
  await assert.rejects(x.publisher.selectReplay({ subscription_id: x.config.subscription.subscription_id, cursor: first.next_cursor }), code('cursor_stale'));
  const current = await x.publisher.selectReplay({ subscription_id: x.config.subscription.subscription_id });
  assert.ok(current.gaps.some(g => g.reason === 'eviction' && g.from_sequence <= originalPosition && g.to_sequence >= originalPosition));
  assert.ok(current.events.every(e => e.sequence > originalPosition));
  for (const gap of current.gaps) assert.deepEqual(Object.keys(gap).sort(), ['from_sequence', 'reason', 'to_sequence']);
});

test('scope narrowing invalidates replay cursors even after the new epoch is admitted', async t => {
  const x = await setup(t, scope([app('org.example.reader'), app('org.example.video')]));
  await finalizeSequential(x, 6);
  const first = await x.publisher.selectReplay({ subscription_id: x.config.subscription.subscription_id }); assert.equal(first.has_more, true);
  const next = await x.publisher.narrowScope(x.config.grant.recipient_id, scope());
  x.credentialMap.set(x.config.grant.recipient_id, { ...x.config.credential, stream_id: next.stream_id, subscription_id: next.subscription_id, scope_revision: next.scope_revision });
  await assert.rejects(x.publisher.selectReplay({ subscription_id: next.subscription_id, cursor: first.next_cursor }), code('cursor_invalid'));
  const current = await x.publisher.selectReplay({ subscription_id: next.subscription_id });
  assert.deepEqual(current.events, []); assert.deepEqual(current.gaps, []); assert.equal(current.stream_id, next.stream_id);
});

test('four active recipient cap rejects the fifth without changing existing authority', async t => {
  const x = await setup(t);
  for (let i = 0; i < 3; i++) {
    const c = configuration(START); x.credentialMap.set(c.grant.recipient_id, c.credential); await x.publisher.approve(c);
  }
  const before = await x.store.read(), fifth = configuration(START);
  x.credentialMap.set(fifth.grant.recipient_id, fifth.credential);
  await assert.rejects(x.publisher.approve(fifth), code('storage_unavailable'));
  const after = await x.store.read(); assert.deepEqual(after, before);
  assert.equal(Object.keys(after.recipients).length, 4);
  assert.equal((await x.publisher.getLocalStatus(x.config.grant.recipient_id)).consent_state, 'active');
});

test('revocation markers expire at original credential expiry without affecting unrelated consent', async t => {
  const x = await setup(t, scope(), { expires: START + 3600000, credentialExpires: START + 2 * 3600000 });
  const other = configuration(START, scope(), { expires: START + 4 * 3600000 });
  x.credentialMap.set(other.grant.recipient_id, other.credential); await x.publisher.approve(other);
  await x.publisher.revoke(x.config.grant.recipient_id); assert.equal(x.credentialMap.has(x.config.grant.recipient_id), false);
  let state = await x.store.read(); assert.equal(state.markers.length, 1); assert.equal(state.markers[0].expires, START + 2 * 3600000);
  x.clock.advance(3600000); await x.publisher.getLocalStatus(other.grant.recipient_id);
  state = await x.store.read(); assert.equal(state.markers.length, 1);
  x.clock.advance(3600000); assert.equal((await x.publisher.getLocalStatus(other.grant.recipient_id)).consent_state, 'active');
  state = await x.store.read(); assert.deepEqual(state.markers, []); assert.deepEqual(state.retired, []);
  assert.equal(state.recipients[x.config.grant.recipient_id], undefined); assert.ok(state.recipients[other.grant.recipient_id]);
});

test('negative or future persisted publication/read checkpoints fail closed', async t => {
  for (const corrupt of [r => { r.freshBudget = [-1]; }, r => { r.readBudget = [-1]; }, r => { r.freshBudget = [START + 1]; }, r => { r.readBudget = [START + 1]; }]) {
    const x = await setup(t); await x.store.transaction(state => corrupt(state.recipients[x.config.grant.recipient_id]));
    await assert.rejects(x.publisher.initialize(), code('consent_inactive'));
  }
});

async function overflowRecoveredGapCheckpoint(t) {
  const x = await setup(t, scope(undefined, { history_max_bytes: 16384 }), { expires: START + 3 * 86400000 });
  x.clock.advance(32 * 3600000);
  // Synthetic recovered checkpoint: 128 bounded prior loss ranges, no payloads.
  // The next real finalization/whole-window eviction exercises the overflow.
  await x.store.transaction(state => {
    const r = state.recipients[x.config.grant.recipient_id]; r.nextSequence = 129;
    r.gaps = Array.from({ length: 128 }, (_, i) => ({ from_sequence: i + 1, to_sequence: i + 1,
      reason: (i + 1) % 2 ? 'eviction' : 'expired', expires: x.clock.now() + 3600000 }));
  });
  const start = x.clock.now() - INTERVAL;
  const observed = Array.from({ length: 64 }, (_, i) => ({ start: iso(start + i * 13000), end: iso(start + i * 13000 + 10000) }));
  const input = { ...candidate(start), coverage: { status: 'partial', observed_intervals: observed, reasons: ['source_unavailable'] } };
  await x.publisher.finalizeWindow(x.config.subscription.subscription_id, input);
  assert.equal((await x.publisher.getLocalError(x.config.grant.recipient_id)).code, 'history_unavailable');
  assert.equal((await x.store.read()).recipients[x.config.grant.recipient_id].gaps.length, 0);
  return x;
}

test('gap-detail overflow warning survives successful windows and expires at its fixed control deadline', async t => {
  const x = await overflowRecoveredGapCheckpoint(t);
  const warningUntil = (await x.store.read()).recipients[x.config.grant.recipient_id].gapDetailLostUntil;
  const start = x.clock.now(); x.clock.advance(INTERVAL);
  const [event] = await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(start));
  await x.publisher.dispatchNext(x.config.subscription.subscription_id, { async deliver(e) { return x.receipt(e); } });
  assert.equal((await x.publisher.getLocalError(x.config.grant.recipient_id)).code, 'history_unavailable');
  assert.equal((await x.store.read()).recipients[x.config.grant.recipient_id].gapDetailLostUntil, warningUntil);
  assert.equal(event.expires_at, iso(start + 86400000));
  x.clock.advance(warningUntil - x.clock.now());
  assert.equal(await x.publisher.getLocalError(x.config.grant.recipient_id), null);
  assert.equal((await x.store.read()).recipients[x.config.grant.recipient_id].gapDetailLostUntil, 0);
});

test('scope narrowing and revocation remove old gap-detail warnings', async t => {
  const narrowed = await overflowRecoveredGapCheckpoint(t);
  const next = await narrowed.publisher.narrowScope(narrowed.config.grant.recipient_id, scope(undefined, { history_max_bytes: 16384, history_max_age_ms: 3600000 }));
  narrowed.credentialMap.set(narrowed.config.grant.recipient_id, { ...narrowed.config.credential, stream_id: next.stream_id, subscription_id: next.subscription_id, scope_revision: next.scope_revision });
  assert.equal(await narrowed.publisher.getLocalError(narrowed.config.grant.recipient_id), null);
  assert.equal((await narrowed.store.read()).recipients[narrowed.config.grant.recipient_id].gapDetailLostUntil, 0);
  const revoked = await overflowRecoveredGapCheckpoint(t); await revoked.publisher.revoke(revoked.config.grant.recipient_id);
  assert.equal(await revoked.publisher.getLocalError(revoked.config.grant.recipient_id), null);
  assert.equal((await revoked.store.read()).recipients[revoked.config.grant.recipient_id].gapDetailLostUntil, 0);
});

test('permanent catalogue errors ignore optimistic retry flags and retry hints', async t => {
  const x = await setup(t); x.clock.advance(INTERVAL); await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START));
  let attempts = 0;
  const adapter = { async deliver() { attempts++; throw { code: 'invalid_event', retryable: true, retryAfterMs: 2 * 3600000, message: 'PRIVATE_SERVER_CONTENT' }; } };
  assert.equal((await x.publisher.dispatchNext(x.config.subscription.subscription_id, adapter)).delivery_state, 'permanent_error');
  let r = (await x.store.read()).recipients[x.config.grant.recipient_id];
  assert.equal(r.backpressureUntil, 0); assert.equal(r.cycleStopped, false); assert.equal(r.entries[0].permanent, true);
  x.clock.advance(3 * 3600000); await x.publisher.dispatchNext(x.config.subscription.subscription_id, adapter); assert.equal(attempts, 1);
  assert.equal((await readFile(x.file, 'utf8')).includes('PRIVATE_SERVER_CONTENT'), false);
});

test('unclassified lost responses retry the same frozen event with bounded attempts and no private errors', async t => {
  const x = await setup(t); x.clock.advance(INTERVAL);
  const [original] = await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START));
  const observed = [];
  const adapter = { async deliver(event) {
    observed.push(canonical(event)); const error = new Error('PRIVATE_TRANSPORT_SECRET'); error.code = 'ECONNRESET'; error.retryable = false; throw error;
  } };
  for (let i = 0; i < 6; i++) {
    await x.publisher.dispatchNext(x.config.subscription.subscription_id, adapter);
    x.clock.advance(60000);
  }
  assert.equal(observed.length, 6); assert.ok(observed.every(value => value === canonical(original)));
  const status = await x.publisher.dispatchNext(x.config.subscription.subscription_id, adapter);
  assert.equal(observed.length, 6); assert.equal(status.delivery_state, 'exhausted'); assert.equal(status.last_valid_consumption_at, undefined);
  const r = (await x.store.read()).recipients[x.config.grant.recipient_id];
  assert.equal(r.entries[0].permanent, undefined); assert.equal(r.freshBudget.length, 1);
  assert.equal((await readFile(x.file, 'utf8')).includes('PRIVATE_TRANSPORT_SECRET'), false);
});

async function separatelyTimedSetup(t, effectiveScope = scope(), options) {
  const x = await setup(t, effectiveScope, options);
  const clock = { wall: START, ticks: 0, now() { return this.wall; }, elapsed() { return this.ticks; }, trusted() { return true; },
    advance(ms) { this.wall += ms; this.ticks += ms; }, stepWall(ms) { this.wall += ms; } };
  x.clock = clock; x.publisher = new DevicePublisher({ store: x.store, clock, credentials: x.credentials, random: () => 0.5 });
  x.receipt = event => ({ protocol_version: '0.1.0', event_id: event.event_id, recipient_id: event.recipient_id, stream_id: event.stream_id,
    sequence: event.sequence, received_at: iso(clock.now()), disposition: 'accepted', validation: 'valid' });
  return x;
}

test('small forward wall step cannot replenish fresh budget within boot or across a conservative restart', async t => {
  const x = await separatelyTimedSetup(t); await finalizeSequential(x, 5);
  let sent = 0; const adapter = { async deliver(event) { sent++; return x.receipt(event); } };
  for (let i = 0; i < 4; i++) await x.publisher.dispatchNext(x.config.subscription.subscription_id, adapter);
  x.clock.advance(58 * MINUTE); x.clock.stepWall(2 * MINUTE);
  await x.publisher.dispatchNext(x.config.subscription.subscription_id, adapter); assert.equal(sent, 4);
  const reboot = new DevicePublisher({ store: new JsonStore(x.file, {}), clock: x.clock, credentials: x.credentials });
  await reboot.initialize(); await reboot.dispatchNext(x.config.subscription.subscription_id, adapter); assert.equal(sent, 4);
  x.clock.advance(2 * MINUTE); await reboot.dispatchNext(x.config.subscription.subscription_id, adapter); assert.equal(sent, 5);
});

test('failed read preserves monotonic checkpoint and a wall step cannot refill reads after restart', async t => {
  const x = await separatelyTimedSetup(t);
  for (let i = 0; i < 4; i++) await x.publisher.selectReplay({ subscription_id: x.config.subscription.subscription_id });
  x.clock.advance(59000); x.clock.stepWall(2 * MINUTE);
  await assert.rejects(x.publisher.selectReplay({ subscription_id: x.config.subscription.subscription_id }), code('rate_limited'));
  const state = await x.store.read(); assert.equal(state.budgetCheckpoint, START + 59000); assert.equal(state.budgetWallCheckpoint, START + 179000);
  const reboot = new DevicePublisher({ store: new JsonStore(x.file, {}), clock: x.clock, credentials: x.credentials });
  await assert.rejects(reboot.selectReplay({ subscription_id: x.config.subscription.subscription_id }), code('rate_limited'));
  x.clock.advance(1000); assert.deepEqual((await reboot.selectReplay({ subscription_id: x.config.subscription.subscription_id })).events, []);
});

test('small wall step cannot shorten retry hints or explicit cycle cooldown', async t => {
  const x = await separatelyTimedSetup(t); await finalizeSequential(x, 1);
  let sent = 0;
  await x.publisher.dispatchNext(x.config.subscription.subscription_id, { async deliver() { sent++; throw new OapError('rate_limited', undefined, { retryAfterMs: INTERVAL }); } });
  x.clock.advance(14 * MINUTE); x.clock.stepWall(2 * MINUTE);
  const successful = { async deliver(event) { sent++; return x.receipt(event); } };
  assert.equal((await x.publisher.dispatchNext(x.config.subscription.subscription_id, successful)).delivery_state, 'backoff'); assert.equal(sent, 1);
  assert.equal(await x.publisher.triggerRetry(x.config.grant.recipient_id, 'user_retry'), false);
  const reboot = new DevicePublisher({ store: new JsonStore(x.file, {}), clock: x.clock, credentials: x.credentials });
  assert.equal(await reboot.triggerRetry(x.config.grant.recipient_id, 'user_retry'), false);
  x.clock.advance(MINUTE); assert.equal(await reboot.triggerRetry(x.config.grant.recipient_id, 'user_retry'), true);
  await reboot.dispatchNext(x.config.subscription.subscription_id, successful); assert.equal(sent, 2);
});

test('forwarded UTC expires activity and grants strictly while budgets continue on elapsed time', async t => {
  const x = await separatelyTimedSetup(t, scope(undefined, { history_max_age_ms: 2 * INTERVAL }), { expires: START + 2 * INTERVAL });
  await finalizeSequential(x, 1); x.clock.advance(14 * MINUTE); x.clock.stepWall(2 * MINUTE);
  let sent = 0; await assert.rejects(x.publisher.dispatchNext(x.config.subscription.subscription_id, { async deliver(event) { sent++; return x.receipt(event); } }), code('expired'));
  assert.equal(sent, 0); const status = await x.publisher.getLocalStatus(x.config.grant.recipient_id);
  assert.equal(status.consent_state, 'expired'); assert.equal(status.retention.queued_events, 0);
  assert.deepEqual((await x.store.read()).recipients[x.config.grant.recipient_id].entries, []);
});

test('invalid uncertain UTC cannot prevent durable revocation or poison finite checkpoints', async t => {
  const x = await setup(t); x.clock.advance(INTERVAL); await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START));
  const before = await x.store.read(); x.clock.value = NaN; x.clock.trusted = () => false;
  assert.equal((await x.publisher.revoke(x.config.grant.recipient_id)).consent_state, 'revoked');
  const state = await x.store.read(); assert.equal(state.lastClock, before.lastClock); assert.equal(state.budgetCheckpoint, before.budgetCheckpoint);
  assert.equal(state.budgetWallCheckpoint, before.budgetWallCheckpoint); assert.deepEqual(state.recipients[x.config.grant.recipient_id].entries, []);
  x.clock.value = START + INTERVAL; x.clock.trusted = () => true;
  const reboot = new DevicePublisher({ store: new JsonStore(x.file, {}), clock: x.clock, credentials: x.credentials });
  await reboot.initialize(); assert.equal((await reboot.getLocalStatus(x.config.grant.recipient_id)).consent_state, 'revoked');
});

async function endpointPairedSetup(t, extraCredential = {}) {
  const x = await setup(t); await x.publisher.revoke(x.config.grant.recipient_id);
  const c = configuration(START); Object.assign(c.credential, { endpoint: 'http://127.0.0.1:43101/', ...extraCredential });
  c.binding.profile_id = c.credential.profile_id;
  x.credentialMap.set(c.grant.recipient_id, c.credential);
  await x.publisher.approve({ ...c, receiverCapabilities: capabilities('receiver', [c.binding.profile_id]) }); x.config = c;
  return x;
}

test('a substituted protected endpoint is rejected after restart until fresh local pairing', async t => {
  const x = await endpointPairedSetup(t); x.clock.advance(INTERVAL); await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START));
  const fingerprint = (await x.store.read()).recipients[x.config.grant.recipient_id].destinationFingerprint;
  assert.match(fingerprint, /^[0-9a-f]{64}$/);
  x.credentialMap.set(x.config.grant.recipient_id, { ...x.config.credential, endpoint: 'http://127.0.0.1:43102/' });
  const reboot = new DevicePublisher({ store: new JsonStore(x.file, {}), clock: x.clock, credentials: x.credentials });
  let sent = 0;
  await assert.rejects(reboot.dispatchNext(x.config.subscription.subscription_id, { async deliver(event) { sent++; return x.receipt(event); } }), code('unauthorized'));
  assert.equal(sent, 0); assert.equal((await reboot.getLocalStatus(x.config.grant.recipient_id)).delivery_state, 'credential_unusable');
});

test('changed destination trust during asynchronous preparation fails the publisher send fence', async t => {
  const x = await endpointPairedSetup(t, { profile_id: 'direct-https-v1', endpoint: 'https://agent.example/', tls: { peerKeySha256: Buffer.alloc(32, 1).toString('base64') } });
  x.clock.advance(INTERVAL); await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START));
  let release, began, sent = 0;
  const gate = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { began = resolve; });
  const operation = x.publisher.dispatchNext(x.config.subscription.subscription_id, { async deliver(event, binding, { beforeSend }) {
    began(); await gate; beforeSend(); sent++; return x.receipt(event);
  } });
  await started; x.credentialMap.set(x.config.grant.recipient_id, { ...x.config.credential, tls: { peerKeySha256: Buffer.alloc(32, 2).toString('base64') } });
  release(); const status = await operation;
  assert.equal(sent, 0); assert.equal(status.delivery_state, 'credential_unusable'); assert.equal(status.last_valid_consumption_at, undefined);
});

test('finite same-target credential rotation preserves the pairing and immutable event', async t => {
  const x = await endpointPairedSetup(t); x.clock.advance(INTERVAL);
  const [event] = await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START));
  const before = await x.store.read(), recipientId = x.config.grant.recipient_id;
  const replacement = { ...x.config.credential, token: 'ISOLATED-TEST-ONLY-ROTATED-TOKEN', expires_at: iso(START + 2 * 86400000) };
  x.credentialMap.set(recipientId, replacement);
  let sent = 0; const status = await x.publisher.dispatchNext(x.config.subscription.subscription_id, { async deliver(e) {
    sent++; assert.equal(canonical(e), canonical(event)); return x.receipt(e);
  } });
  assert.equal(sent, 1); assert.equal(status.retention.queued_events, 0);
  const after = await x.store.read(); assert.equal(after.recipients[recipientId].destinationFingerprint, before.recipients[recipientId].destinationFingerprint);
  assert.equal(after.recipients[recipientId].entries[0].event.expires_at, event.expires_at);
  assert.equal((await readFile(x.file, 'utf8')).includes(replacement.token), false);
  await x.publisher.revoke(recipientId);
  assert.equal((await x.store.read()).markers.find(marker => marker.recipient_id === recipientId).expires, START + 2 * 86400000);
});

test('populated state missing its destination approval fingerprint fails closed', async t => {
  const x = await endpointPairedSetup(t); await x.store.transaction(state => { delete state.recipients[x.config.grant.recipient_id].destinationFingerprint; });
  await assert.rejects(x.publisher.initialize(), code('consent_inactive'));
});

test('excessive credential rotation lifetime is rejected before reservation and at the asynchronous send fence', async t => {
  const x = await endpointPairedSetup(t); x.clock.advance(INTERVAL); await x.publisher.finalizeWindow(x.config.subscription.subscription_id, candidate(START));
  x.credentialMap.set(x.config.grant.recipient_id, { ...x.config.credential, expires_at: '2126-10-04T00:00:00.000Z' });
  let sent = 0;
  await assert.rejects(x.publisher.dispatchNext(x.config.subscription.subscription_id, { async deliver(event) { sent++; return x.receipt(event); } }), code('unauthorized'));
  assert.equal(sent, 0); assert.equal((await x.store.read()).recipients[x.config.grant.recipient_id].credentialDeadline, START + 86400000);
  const asynchronous = await endpointPairedSetup(t); asynchronous.clock.advance(INTERVAL);
  await asynchronous.publisher.finalizeWindow(asynchronous.config.subscription.subscription_id, candidate(START));
  let release, began;
  const gate = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { began = resolve; });
  const operation = asynchronous.publisher.dispatchNext(asynchronous.config.subscription.subscription_id, { async deliver(event, binding, { beforeSend }) {
    began(); await gate; beforeSend(); sent++; return asynchronous.receipt(event);
  } });
  await started;
  asynchronous.credentialMap.set(asynchronous.config.grant.recipient_id, { ...asynchronous.config.credential, expires_at: '2126-10-04T00:00:00.000Z' });
  release(); assert.equal((await operation).delivery_state, 'credential_unusable'); assert.equal(sent, 0);
  await asynchronous.publisher.revoke(asynchronous.config.grant.recipient_id);
  assert.equal((await asynchronous.store.read()).markers.find(m => m.recipient_id === asynchronous.config.grant.recipient_id).expires, START + 86400000);
});
