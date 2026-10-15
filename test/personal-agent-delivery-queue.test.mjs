import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { ActivityStore } from '../integrations/openclaw/personal-agent/store.mjs';
import { notifyDecision, drainNotifications } from '../integrations/openclaw/personal-agent/notification.mjs';
import { claimDelivery, enqueueDelivery, currentDelivery, deliveryStatus, DELIVERY_LEASE_MS } from '../integrations/openclaw/personal-agent/delivery-store.mjs';

const BASE = Date.parse('2026-10-15T18:00:00.000Z');
const OWNER = { agentId: 'main', sessionKey: 'agent:main:main' };
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'liveabit-delivery-queue-'));
  t.after(() => {
    assert(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    rmSync(directory, { recursive: true, force: true });
  });
  let now = BASE, connected = false, sends = 0;
  const settings = { ...OWNER, databasePath: join(directory, 'activity.sqlite'),
    deliveryPolicyPath: join(directory, 'delivery.json'), deliveryStatePath: join(directory, 'state.json'),
    now: () => now };
  const policy = { format: 'liveabit.openclaw.companion-delivery.v1', enabled: true, agent_id: 'main',
    channel: 'companion', identity_source: 'openclaw.nodes.status', command: 'system.notify', node_id: 'a'.repeat(64),
    cooldown_minutes: 1, quiet_start_hour: 22, quiet_end_hour: 8, time_zone: 'America/Chicago' };
  const save = () => writeFileSync(settings.deliveryPolicyPath, JSON.stringify(policy)); save();
  writeFileSync(settings.deliveryStatePath, JSON.stringify({ format: 'liveabit.openclaw.delivery-state.v1', processed_event_ids: [], last_sent_at: null }));
  const use = work => { const store = new ActivityStore(settings.databasePath, settings); try { return work(store); } finally { store.close(); } };
  const make = extra => use(store => store.recordDecision({ ...OWNER, topic: 'Synthetic episode', action: 'question', approach: 'ask intent',
    rationale: 'Activity cannot establish intent.', prompt: 'Would you like a different next step?', ...extra }));
  const node = () => ({ nodeId: policy.node_id, platform: 'android', paired: true, connected,
    commands: ['system.notify'], permissions: { notifications: true } });
  const nodes = { list: async () => ({ nodes: [node()] }), invoke: async args => { sends++; return { ok: true, nodeId: args.nodeId, command: args.command }; } };
  return { settings, policy, use, save, make, nodes, node, advance: amount => { now += amount; },
    connect: () => { connected = true; }, sends: () => sends,
    notify: (decisionId, extra = {}) => notifyDecision({ settings, context: OWNER, decisionId, nodes, guard: () => {}, ...extra }),
    drain: (extra = {}) => drainNotifications({ settings, nodes, ...extra }) };
}

test('offline intent survives reopening and reconnect delivers once without claiming display or reading', async t => {
  const f = fixture(t), record = f.make();
  const initial = await f.notify(record.decision_id);
  assert.equal(initial.delivery_queued, true);
  assert.equal(initial.notification_attempted, false);
  assert.equal(f.use(store => store.db.prepare('SELECT COUNT(*) AS n FROM notifications').get().n), 0);
  const status = f.use(store => deliveryStatus(store, record.decision_id));
  assert.equal(status.status, 'queued');
  assert.equal(status.checks, 1);
  f.connect();
  assert.equal((await f.drain()).reason, 'no_due_delivery');
  f.advance(30000);
  const delivered = await f.drain();
  assert.equal(delivered.notification_attempted, true);
  assert.equal(delivered.native_invocation_confirmed, true);
  assert.equal(delivered.physical_display_confirmed, false);
  assert.equal(delivered.user_read_confirmed, false);
  assert.equal((await f.notify(record.decision_id)).reason, 'already_attempted');
  assert.equal((await f.drain()).reason, 'no_due_delivery');
  assert.equal(f.sends(), 1);
});

test('a long outage cancels an obsolete prompt instead of sending it on reconnection', async t => {
  const f = fixture(t), record = f.make(); await f.notify(record.decision_id);
  f.advance(15 * 60000); f.connect();
  assert.equal((await f.drain()).reason, 'no_due_delivery');
  assert.equal(f.use(store => deliveryStatus(store, record.decision_id)).reason, 'stale_decision');
  assert.equal(f.sends(), 0);
});

test('supporting observation age can expire before the decision deadline', async t => {
  const f = fixture(t), eventId = randomUUID();
  // Independent stored-window fixture: a question based on an already 14-minute-old window.
  f.use(store => store.db.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    'fixture:stream', eventId, 1, randomUUID(), BASE - 15 * 60000, BASE - 14 * 60000,
    BASE - 14 * 60000, BASE + 86400000, BASE, 'synthetic-hash', null,
    JSON.stringify([{ application: { namespace: 'android', id: 'example.app' }, foreground_duration_ms: 1000, transition_count: 1 }]), 'accepted'));
  const record = f.make({ eventId }); await f.notify(record.decision_id);
  f.advance(60000); f.connect(); await f.drain();
  assert.equal(f.use(store => deliveryStatus(store, record.decision_id)).status, 'settled');
  assert.equal(f.sends(), 0);
});

test('changed preferences cancel the old intent even if delivery is subsequently enabled again', async t => {
  const f = fixture(t), record = f.make(); await f.notify(record.decision_id);
  f.policy.enabled = false; f.save();
  assert.equal((await f.drain()).reason, 'delivery_unavailable');
  f.policy.enabled = true; f.save(); f.advance(30000); f.connect();
  assert.equal((await f.notify(record.decision_id)).delivery_queued, false);
  assert.equal((await f.drain()).reason, 'no_due_delivery');
  assert.equal(f.sends(), 0);
});

test('changing the private destination never redirects an already queued prompt', async t => {
  const f = fixture(t), record = f.make(); await f.notify(record.decision_id);
  f.policy.node_id = 'b'.repeat(64); f.save(); f.advance(30000); f.connect();
  const outcome = await f.drain();
  assert.equal(outcome.reason, 'delivery_policy_changed');
  assert.equal(outcome.notification_attempted, false);
  assert.equal(f.sends(), 0);
});

test('an observed opt-out revokes an inventory check even after the same policy is enabled again', async t => {
  const f = fixture(t), record = f.make();
  let finishInventory;
  const pending = f.notify(record.decision_id, { nodes: { ...f.nodes,
    list: () => new Promise(resolve => { finishInventory = resolve; }) } });
  f.policy.enabled = false; f.save(); await f.drain();
  f.policy.enabled = true; f.save(); f.connect();
  finishInventory({ nodes: [f.node()] });
  await assert.rejects(pending, /delivery_cancelled/);
  assert.equal(f.sends(), 0);
  assert.equal(f.use(store => deliveryStatus(store, record.decision_id)).reason, 'delivery_unavailable');
});

test('a new requested prompt supersedes an older waiting prompt', async t => {
  const f = fixture(t), older = f.make(); await f.notify(older.decision_id);
  f.advance(1000);
  const newer = f.make(); await f.notify(newer.decision_id);
  assert.equal(f.use(store => deliveryStatus(store, older.decision_id)).reason, 'superseded');
  f.advance(30000); f.connect(); await f.drain();
  assert.equal(f.sends(), 1);
  assert.equal(f.use(store => deliveryStatus(store, newer.decision_id)).reason, 'confirmed');
});

test('a new prompt fences an older inventory check before its native reservation', async t => {
  const f = fixture(t), older = f.make();
  let finishInventory;
  const pending = f.notify(older.decision_id, { nodes: { ...f.nodes,
    list: () => new Promise(resolve => { finishInventory = resolve; }) } });
  f.advance(1000);
  const newer = f.make(); await f.notify(newer.decision_id);
  f.connect(); finishInventory({ nodes: [f.node()] });
  await assert.rejects(pending, /delivery_cancelled/);
  assert.equal(f.sends(), 0);
  f.advance(30000); await f.drain();
  assert.equal(f.sends(), 1);
  assert.equal(f.use(store => deliveryStatus(store, older.decision_id)).reason, 'superseded');
});

test('lost native acknowledgement settles uncertain and never returns to the retry queue', async t => {
  const f = fixture(t), record = f.make(); await f.notify(record.decision_id); f.advance(30000); f.connect();
  let calls = 0;
  const nodes = { ...f.nodes, invoke: async () => { calls++; throw new Error('response lost after possible effect'); } };
  const outcome = await f.drain({ nodes });
  assert.equal(outcome.outcome, 'uncertain');
  assert.equal(outcome.delivery_queued, false);
  f.advance(60000);
  assert.equal((await f.drain({ nodes })).reason, 'no_due_delivery');
  assert.equal((await f.notify(record.decision_id, { nodes })).reason, 'already_attempted');
  assert.equal(calls, 1);
});

test('a crashed pre-dispatch claim is reclaimed but concurrent workers cannot share its lease', t => {
  const f = fixture(t), record = f.make();
  f.use(store => enqueueDelivery(store, { ...OWNER, decisionId: record.decision_id, policy: f.policy }));
  const a = f.use(store => claimDelivery(store, OWNER));
  assert(a);
  assert.equal(f.use(store => claimDelivery(store, OWNER)), null);
  f.advance(DELIVERY_LEASE_MS);
  const b = f.use(store => claimDelivery(store, OWNER));
  assert(b); assert.notEqual(a.lease, b.lease);
  assert.throws(() => f.use(store => currentDelivery(store, a)), /delivery_cancelled/);
  assert(f.use(store => currentDelivery(store, b)));
});

test('revoking an unfinished tool invocation cancels its intent before service recovery', async t => {
  const f = fixture(t), record = f.make(); let active = true;
  await assert.rejects(f.notify(record.decision_id, { guard: () => { if (!active) throw new Error('invocation revoked'); },
    nodes: { ...f.nodes, list: async () => { active = false; return { nodes: [f.node()] }; } } }), /invocation revoked/);
  assert.equal(f.use(store => deliveryStatus(store, record.decision_id)).reason, 'cancelled_before_invocation');
  f.advance(DELIVERY_LEASE_MS); f.connect(); await f.drain();
  assert.equal(f.sends(), 0);
  assert.equal(f.use(store => store.db.prepare('SELECT COUNT(*) AS n FROM notifications').get().n), 0);
});

test('stopping a service during inventory retains its unreserved intent for the next startup', async t => {
  const f = fixture(t), record = f.make(); await f.notify(record.decision_id); f.advance(30000);
  let active = true;
  await assert.rejects(f.drain({ guard: () => { if (!active) throw new Error('service stopped'); },
    nodes: { ...f.nodes, list: async () => { active = false; return { nodes: [f.node()] }; } } }), /service stopped/);
  f.advance(DELIVERY_LEASE_MS); f.connect();
  assert.equal((await f.drain()).native_invocation_confirmed, true);
  assert.equal(f.sends(), 1);
});

test('a crash after native reservation becomes uncertain without invoking again', async t => {
  const f = fixture(t), record = f.make();
  f.use(store => {
    enqueueDelivery(store, { ...OWNER, decisionId: record.decision_id, policy: f.policy });
    claimDelivery(store, OWNER);
    store.reserveNotification({ ...OWNER, decisionId: record.decision_id, policy: f.policy, legacyLastSentAt: null });
  });
  f.advance(DELIVERY_LEASE_MS); f.connect(); await f.drain();
  const native = f.use(store => store.db.prepare('SELECT outcome,reason FROM notifications WHERE decision_id=?').get(record.decision_id));
  assert.equal(native.outcome, 'uncertain');
  assert.equal(native.reason, 'interrupted_invocation');
  assert.equal(f.sends(), 0);
});

test('inventory failures use bounded backoff and preserve no false native send attempts', async t => {
  const f = fixture(t), record = f.make(); let inventories = 0;
  const nodes = { list: async () => { inventories++; throw new Error('network down'); }, invoke: async () => assert.fail('must not invoke') };
  await f.notify(record.decision_id, { nodes });
  for (let index = 0; index < 12; index++) { f.advance(120000); await f.drain({ nodes }); }
  assert(inventories <= 8);
  assert.equal(f.use(store => deliveryStatus(store, record.decision_id)).status, 'settled');
  assert.equal(f.use(store => store.db.prepare('SELECT COUNT(*) AS n FROM notifications').get().n), 0);
});

test('a stuck inventory read times out without blocking the worker indefinitely', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t), record = f.make();
  const pending = f.notify(record.decision_id, { nodes: {
    list: () => new Promise(() => {}), invoke: async () => assert.fail('inventory read never authorized a send')
  } });
  f.advance(15000); t.mock.timers.tick(15000);
  const outcome = await pending;
  assert.equal(outcome.reason, 'inventory_unavailable');
  assert.equal(outcome.delivery_queued, true);
  assert.equal(outcome.notification_attempted, false);
});

test('lost authorization cancels waiting delivery rather than retrying a different or unknown node', async t => {
  for (const mutation of [node => ({ ...node, paired: false }), node => ({ ...node, paired: 'true' }),
    node => ({ ...node, connected: undefined }), node => ({ ...node, permissions: { notifications: false } }), () => null]) {
    const f = fixture(t), record = f.make(); await f.notify(record.decision_id); f.advance(30000);
    const node = mutation(f.node());
    const outcome = await f.drain({ nodes: { ...f.nodes, list: async () => ({ nodes: node ? [node] : [] }) } });
    assert.equal(outcome.delivery_queued, false);
    assert.equal(outcome.reason, 'companion_unavailable');
    assert.equal(f.sends(), 0);
  }
});

test('untrusted callers cannot queue a foreign decision or choose its notification body', async t => {
  const f = fixture(t), record = f.make();
  await assert.rejects(f.notify(record.decision_id, { context: { agentId: 'foreign', sessionKey: 'agent:foreign:main' } }), /decision_unavailable/);
  f.connect();
  let body;
  await f.notify(record.decision_id, { nodes: { ...f.nodes, invoke: async args => { body = args.params.body; return { ok: true, nodeId: args.nodeId, command: args.command }; } },
    prompt: 'untrusted replacement' });
  assert.equal(body, 'Would you like a different next step?');
});
