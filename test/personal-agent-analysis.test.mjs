import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer, request } from 'node:http';
import { ActivityStore } from '../integrations/openclaw/personal-agent/store.mjs';
import { canonical } from '../integrations/openclaw/personal-agent/observation.mjs';
import { receiveActivity, receiptHandler, RECEIPT_FORMAT } from '../integrations/openclaw/personal-agent/receipt.mjs';
import { claimAnalysis, ownedAnalysis, beginAnalysisDispatch, attachAnalysisRun, releaseAnalysis } from '../integrations/openclaw/personal-agent/analysis-store.mjs';
import { runAnalysisTick } from '../integrations/openclaw/personal-agent/analysis.mjs';
import { createInvocationBindings } from '../integrations/openclaw/personal-agent/invocation.mjs';
import { recordConversationFeedback } from '../integrations/openclaw/personal-agent/conversation.mjs';
import { notifyDecision } from '../integrations/openclaw/personal-agent/notification.mjs';
import { enqueueDelivery, claimDelivery, currentDelivery, deliveryStatus } from '../integrations/openclaw/personal-agent/delivery-store.mjs';

const BASE = Date.parse('2026-10-15T17:00:00.000Z');
const DAY = 86400000;
function event(time = BASE, overrides = {}) {
  return { protocol_version: '0.2.0-draft.2', event_name: 'activity.observation', event_id: randomUUID(),
    recipient_id: randomUUID(), stream_id: randomUUID(), subscription_id: randomUUID(), scope_revision: 1, sequence: 1,
    emitted_at: new Date(time - 1000).toISOString(), expires_at: new Date(time - 301000 + DAY).toISOString(),
    window: { window_id: randomUUID(), start: new Date(time - 301000).toISOString(), end: new Date(time - 1000).toISOString() },
    observation: { metric: 'foreground_duration', unit: 'millisecond', coverage: 'unknown', quality: 'unverified_estimate',
      apps: [{ application: { namespace: 'android', id: 'com.example.video' }, foreground_duration_ms: 120000, transition_count: 2 }] }, ...overrides };
}
const payload = observation => ({ message: 'Untrusted caller wrapper.\n' + canonical(observation) });
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'liveabit-review-test-')), clock = { now: BASE };
  const settings = { format: 'liveabit.personal-agent.settings.v2', enabled: true,
    agentId: 'main', mainKey: 'main', mainSessionKey: 'agent:main:main', sessionKey: 'agent:main:liveabit-activity',
    databasePath: join(root, 'activity.sqlite'), timeZone: 'America/Chicago', historyDays: 30, episodeDays: 90,
    accountabilityEmailsEnabled: false, analysisEnabled: true, analysisCoalesceMs: 300000 };
  const now = () => clock.now;
  const use = work => { const store = new ActivityStore(settings.databasePath, { ...settings, now }); try { return work(store); } finally { store.close(); } };
  const receive = observation => receiveActivity(payload(observation), settings, { now });
  const job = () => use(store => store.db.prepare('SELECT * FROM analysis_jobs').get());
  const state = () => use(store => store.db.prepare('SELECT * FROM analysis_state').get());
  const tick = runtime => runAnalysisTick({ runtime, getSettings: () => settings, now });
  t.after(() => { assert(resolve(root).startsWith(resolve(tmpdir()) + sep)); rmSync(root, { recursive: true, force: true }); });
  return { root, clock, now, settings, use, receive, job, state, tick };
}
function runtime({ run, wait = async () => ({ status: 'ok' }) } = {}) {
  return { gateway: { isAvailable: async () => true }, subagent: { run: run ?? (async params => ({ runId: params.idempotencyKey, sessionKey: params.sessionKey })), waitForRun: wait } };
}

test('durable receipt commits observation and obligation together, acknowledges without model execution, and coalesces duplicates', t => {
  const f = fixture(t), first = event();
  const ack = f.receive(first);
  assert.equal(ack.format, RECEIPT_FORMAT); assert.equal(ack.durable, true);
  assert.equal(ack.analysis_scheduled, true); assert.equal(Object.hasOwn(ack, 'runId'), false);
  const original = f.job();
  f.clock.now += 60000;
  assert.equal(f.receive(first).disposition, 'duplicate');
  f.receive(event(f.clock.now));
  assert.equal(f.job().id, original.id); assert.equal(f.job().due, original.due);
  assert.equal(f.state().requested_generation, 2);
  assert.equal(f.use(store => store.db.prepare('SELECT COUNT(*) AS n FROM events').get().n), 2);
});

test('scheduler write failure rolls back the observation instead of issuing a false receipt', t => {
  const f = fixture(t), observation = event();
  f.use(store => store.db.exec("CREATE TRIGGER synthetic_failure BEFORE INSERT ON analysis_jobs BEGIN SELECT RAISE(ABORT,'synthetic scheduler write failure'); END;"));
  assert.throws(() => f.receive(observation), /synthetic scheduler write failure/);
  assert.equal(f.use(store => store.event(observation.event_id)), null);
  assert.equal(f.state(), undefined);
});

test('the new receipt endpoint never acknowledges model work that legacy settings cannot schedule', t => {
  const f = fixture(t), wire = payload(event());
  assert.throws(() => receiveActivity(wire, { ...f.settings, format: 'liveabit.personal-agent.settings.v1',
    sessionKey: f.settings.mainSessionKey, analysisEnabled: undefined }, { now: f.now }), /invalid_personal_agent_settings/);
  assert.equal(f.job(), undefined);
  assert.equal(f.use(store => store.db.prepare('SELECT COUNT(*) AS n FROM events').get().n), 0);
});

test('independent workers cannot claim the same review; expired lease rejects stale completion', t => {
  const f = fixture(t); f.receive(event()); f.clock.now += 300000;
  const first = f.use(store => claimAnalysis(store, f.settings));
  assert(first); assert.equal(f.use(store => claimAnalysis(store, f.settings)), null);
  f.clock.now += 90001;
  const recovered = f.use(store => claimAnalysis(store, f.settings));
  assert.equal(recovered.id, first.id); assert.notEqual(recovered.lease_token, first.lease_token);
  assert.throws(() => f.use(store => ownedAnalysis(store, first)), /review_lease_unavailable/);
  assert.throws(() => f.use(store => releaseAnalysis(store, first, { outcome: 'ok' })), /review_lease_unavailable/);
});

test('crash after run admission recovers the same run instead of launching a second model invocation', async t => {
  const f = fixture(t); f.receive(event()); f.clock.now += 300000;
  const job = f.use(store => claimAnalysis(store, f.settings));
  f.use(store => beginAnalysisDispatch(store, job));
  f.use(store => attachAnalysisRun(store, job, 'already-admitted'));
  f.clock.now += 90001;
  let calls = 0;
  const result = await f.tick(runtime({ run: async () => { calls++; throw new Error('must not rerun'); },
    wait: async ({ runId }) => { assert.equal(runId, 'already-admitted'); return { status: 'ok' }; } }));
  assert.equal(calls, 0); assert.equal(result.completed, true); assert.equal(f.job(), undefined);
  assert.equal(f.state().completed_generation, 1);
});

test('successful model completion without a recorded decision stays distinguishable across restart and does not retry', async t => {
  const f = fixture(t); f.receive(event()); f.clock.now += 300000;
  let runs = 0;
  const host = runtime({ run: async params => { runs++; return { runId: params.idempotencyKey, sessionKey: params.sessionKey }; } });
  const result = await f.tick(host);
  assert.equal(result.completed, true);
  assert.equal(result.decision_recorded, false);
  assert.equal(f.job(), undefined);
  // Each fixture operation closes/reopens SQLite: this is a durable diagnosis,
  // not a temporary result that vanishes after process restart.
  assert.equal(f.state().last_outcome, 'completed_without_decision');
  assert.equal(f.state().completed_generation, 1);
  assert.equal(f.use(store => store.db.prepare('SELECT COUNT(*) AS n FROM decisions').get().n), 0);
  assert.equal((await f.tick(host)).claimed, false);
  assert.equal(runs, 1, 'missing decision is not authority to retry a completed model run');
});

test('successful model completion with an explicit no-intervention decision preserves the recorded choice across restart', async t => {
  const f = fixture(t); f.receive(event()); f.clock.now += 300000;
  let recorded;
  const host = runtime({ wait: async ({ runId }) => {
    recorded = f.use(store => store.recordDecision({ ...f.settings,
      reviewId: store.reviewIdentity({ ...f.settings, runId }), reviewRunId: runId,
      topic: 'A deliberate break', action: 'no_intervention', approach: 'respect stated intent',
      rationale: 'Synthetic context explicitly identifies intentional leisure.' }));
    return { status: 'ok' };
  } });
  const result = await f.tick(host);
  assert.equal(result.completed, true);
  assert.equal(result.decision_recorded, true);
  assert.equal(f.job(), undefined);
  assert.equal(f.state().last_outcome, 'ok');
  const stored = f.use(store => store.episodes(f.settings.agentId, f.settings.sessionKey)[0].decisions[0]);
  assert.equal(stored.id, recorded.decision_id);
  assert.equal(stored.action, 'no_intervention');
  assert.equal(stored.notification, null);
});

test('a linked reply fences old unreserved advice and permits a new trusted review choice supported by the same event', async t => {
  for (const checking of [false, true]) {
    const f = fixture(t), observation = event(); f.receive(observation); f.clock.now += 300000;
    f.settings.now = f.now;
    f.settings.deliveryPolicyPath = join(f.root, 'delivery.json');
    f.settings.deliveryStatePath = join(f.root, 'delivery-state.json');
    const owner = { agentId: f.settings.agentId, sessionKey: f.settings.sessionKey };
    const policy = { format: 'liveabit.openclaw.companion-delivery.v1', enabled: true, agent_id: owner.agentId,
      channel: 'companion', identity_source: 'openclaw.nodes.status', command: 'system.notify', node_id: 'a'.repeat(64),
      cooldown_minutes: 1, quiet_start_hour: 22, quiet_end_hour: 8, time_zone: 'America/Chicago' };
    writeFileSync(f.settings.deliveryPolicyPath, JSON.stringify(policy));
    writeFileSync(f.settings.deliveryStatePath, JSON.stringify({ format: 'liveabit.openclaw.delivery-state.v1',
      processed_event_ids: [], last_sent_at: null }));
    const firstJob = f.use(store => claimAnalysis(store, f.settings));
    const firstRun = 'liveabit-review-' + firstJob.admission_key;
    const first = f.use(store => {
      beginAnalysisDispatch(store, firstJob); attachAnalysisRun(store, firstJob, firstRun);
      return store.recordDecision({ ...owner, reviewId: store.reviewIdentity({ ...owner, runId: firstRun }), reviewRunId: firstRun,
        eventId: observation.event_id, topic: 'A synthetic pause', action: 'question', approach: 'ask intent',
        rationale: 'Intent is unknown.', prompt: 'Was this the break you intended?' });
    });
    let oldClaim;
    f.use(store => {
      enqueueDelivery(store, { ...owner, decisionId: first.decision_id, policy });
      if (checking) oldClaim = claimDelivery(store, owner);
    });
    const report = f.use(store => recordConversationFeedback({ store, settings: f.settings,
      invocation: { agentId: owner.agentId, sessionKey: f.settings.mainSessionKey, sandboxed: false },
      args: { episodeId: first.episode_id, decisionId: first.decision_id, kind: 'user_report', outcome: 'unhelpful',
        report: 'A reminder is not helping; the first step feels too big.' } }));
    assert.equal(report.analysis_scheduled, true);
    const cancelled = f.use(store => deliveryStatus(store, first.decision_id));
    assert.equal(cancelled.status, 'settled'); assert.equal(cancelled.reason, 'new_user_report');
    if (checking) assert.throws(() => f.use(store => currentDelivery(store, oldClaim)), /delivery_cancelled/);
    f.use(store => releaseAnalysis(store, firstJob, { outcome: 'ok' }));
    assert.equal(f.job().reason, 'user_reply');
    const sent = [];
    const nodes = { list: async () => ({ nodes: [{ nodeId: policy.node_id, paired: true, connected: true, platform: 'android',
      commands: ['system.notify'], permissions: { notifications: true } }] }), invoke: async args => {
      sent.push(args.params.body); return { ok: true, nodeId: args.nodeId, command: args.command };
    } };
    let second;
    const host = runtime({ wait: async ({ runId }) => {
      const choice = { ...owner, episodeId: first.episode_id, eventId: observation.event_id,
        action: 'nudge', approach: 'smaller first step', rationale: 'Use the explicit report to change the approach.',
        prompt: 'Would opening the first slide be a manageable start?' };
      second = f.use(store => store.recordDecision({ ...choice,
        reviewId: store.reviewIdentity({ ...owner, runId }), reviewRunId: runId }));
      const replay = f.use(store => store.recordDecision({ ...choice,
        reviewId: store.reviewIdentity({ ...owner, runId }), reviewRunId: runId }));
      assert.equal(replay.duplicate, true); assert.equal(replay.decision_id, second.decision_id);
      const result = await notifyDecision({ settings: f.settings, context: owner,
        decisionId: second.decision_id, nodes, guard: () => {} });
      assert.equal(result.native_invocation_confirmed, true);
      return { status: 'ok' };
    } });
    assert.equal((await f.tick(host)).decision_recorded, true);
    assert.notEqual(second.decision_id, first.decision_id);
    assert.deepEqual(sent, ['Would opening the first slide be a manageable start?']);
    assert.equal(f.use(store => store.db.prepare('SELECT COUNT(*) AS n FROM decisions WHERE event_id=?').get(observation.event_id).n), 2);
    const legacy = f.use(store => store.recordDecision({ ...owner, eventId: observation.event_id,
      action: 'nudge', approach: 'legacy replay', rationale: 'This is a replay, not a fresh trusted review.' }));
    assert.equal(legacy.duplicate, true, 'legacy event replay still creates no new decision');
    assert.throws(() => f.use(store => store.recordDecision({ agentId: 'foreign', sessionKey: 'agent:foreign:activity',
      eventId: observation.event_id, reviewId: randomUUID(), action: 'nudge', approach: 'foreign', rationale: 'Must reject.' })), /event_unavailable/);
  }
});

test('linked report, old-intent cancellation and review request roll back together if scheduling fails', t => {
  const f = fixture(t), owner = { agentId: f.settings.agentId, sessionKey: f.settings.sessionKey };
  const first = f.use(store => store.recordDecision({ ...owner, topic: 'A synthetic pause',
    action: 'question', approach: 'ask intent', rationale: 'Intent is unknown.', prompt: 'Was this intentional?' }));
  const policy = { node_id: 'a'.repeat(64) };
  f.use(store => {
    enqueueDelivery(store, { ...owner, decisionId: first.decision_id, policy });
    store.db.exec("CREATE TRIGGER synthetic_review_failure BEFORE INSERT ON analysis_jobs BEGIN SELECT RAISE(ABORT,'synthetic reply scheduling failure'); END;");
  });
  assert.throws(() => f.use(store => recordConversationFeedback({ store, settings: f.settings,
    invocation: { agentId: owner.agentId, sessionKey: f.settings.mainSessionKey, sandboxed: false },
    args: { episodeId: first.episode_id, kind: 'user_report', outcome: 'intentional_use', report: 'This was a planned break.' } })), /synthetic reply scheduling failure/);
  assert.equal(f.use(store => store.db.prepare('SELECT COUNT(*) AS n FROM feedback').get().n), 0);
  assert.equal(f.use(store => deliveryStatus(store, first.decision_id)).status, 'queued');
  assert.equal(f.state(), undefined);
});

test('lost admission response retries with stable idempotency while pending run polls never redispatch', async t => {
  const f = fixture(t); f.receive(event()); f.clock.now += 300000;
  const keys = [];
  let attempts = 0, polls = 0;
  const host = runtime({ run: async params => {
    keys.push(params.idempotencyKey); attempts++;
    assert.equal(params.deliver, false); assert.equal(params.sessionKey, f.settings.sessionKey);
    assert(!params.message.includes('Untrusted caller wrapper'));
    if (attempts === 1) throw new Error('response lost after admission');
    return { runId: params.idempotencyKey, sessionKey: params.sessionKey };
  }, wait: async () => ({ status: ++polls === 1 ? 'pending' : 'ok' }) });
  assert.equal((await f.tick(host)).outcome, 'unavailable');
  f.clock.now = f.job().due;
  assert.equal((await f.tick(host)).outcome, 'pending');
  f.clock.now = f.job().due;
  assert.equal((await f.tick(host)).completed, true);
  assert.equal(attempts, 2); assert.equal(keys[0], keys[1]); assert.equal(polls, 2);
});

test('an admitted native continuation survives ordinary polling lease release but not run replacement or service stop', async t => {
  const f = fixture(t); f.receive(event()); f.clock.now += 300000;
  let retained, serviceActive = true;
  const host = runtime({ run: async params => { retained = params.assertCurrent;
    return { runId: params.idempotencyKey, sessionKey: params.sessionKey }; }, wait: async () => ({ status: 'pending' }) });
  await runAnalysisTick({ runtime: host, getSettings: () => f.settings, now: f.now,
    guard() { if (!serviceActive) throw new Error('service_stopped'); } });
  assert.equal(f.job().lease_token, null);
  assert.equal(f.job().lease_until, null);
  retained();
  f.clock.now = f.job().due;
  const nextPoll = f.use(store => claimAnalysis(store, f.settings));
  retained();
  serviceActive = false; assert.throws(() => retained(), /service_stopped/);
  serviceActive = true;
  f.use(store => releaseAnalysis(store, nextPoll, { outcome: 'error' }));
  assert.throws(() => retained(), /review_lease_unavailable/);
});

test('a tool executing before admission response is durably bound, including when that response is lost', async t => {
  const f = fixture(t); f.receive(event()); f.clock.now += 300000;
  let first, second, attempts = 0, runId;
  const host = runtime({ run: async params => {
    attempts++; runId = params.idempotencyKey;
    const made = f.use(store => {
      const reviewId = store.reviewIdentity({ ...f.settings, runId });
      assert(reviewId);
      return store.recordDecision({ ...f.settings, reviewId, reviewRunId: runId,
        topic: 'Early tool', action: 'question', approach: 'ask intent', rationale: 'Intent is unknown.', prompt: 'Was this intentional?' });
    });
    if (attempts === 1) { first = made; throw new Error('lost response after early tool'); }
    second = made;
    return { runId, sessionKey: params.sessionKey };
  } });
  await f.tick(host); f.clock.now = f.job().due;
  await f.tick(host);
  assert.equal(second.duplicate, true); assert.equal(first.decision_id, second.decision_id);
  assert.equal(f.use(store => store.db.prepare('SELECT COUNT(*) AS n FROM decisions').get().n), 1);
  // A stored decision is not a send. An interrupted review may still request
  // this original unattempted decision through the existing delivery guard.
  const reserve = () => f.use(store => store.reserveNotification({ decisionId: second.decision_id,
    agentId: f.settings.agentId, sessionKey: f.settings.sessionKey, policy: { time_zone: 'America/Chicago',
      quiet_start_hour: 22, quiet_end_hour: 8, cooldown_minutes: 60 }, legacyLastSentAt: null }));
  assert.equal(reserve().reserved, true); assert.equal(reserve().reserved, false);
  assert.throws(() => f.use(store => store.reviewIdentity({ ...f.settings, runId })), /review_invocation_unavailable/);
});

test('expired and superseded scheduled run identities fail closed instead of becoming legacy activity runs', t => {
  const f = fixture(t); f.receive(event()); f.clock.now += 300000;
  const job = f.use(store => claimAnalysis(store, f.settings));
  f.use(store => beginAnalysisDispatch(store, job));
  const runId = 'liveabit-review-' + job.admission_key;
  assert.equal(f.use(store => store.reviewIdentity({ ...f.settings, runId })), job.id);
  f.clock.now = job.deadline + 1;
  assert.throws(() => f.use(store => store.reviewIdentity({ ...f.settings, runId })), /review_invocation_unavailable/);
  f.receive(event(f.clock.now));
  assert.throws(() => f.use(store => store.reviewIdentity({ ...f.settings, runId })), /review_invocation_unavailable/);
  assert.throws(() => f.use(store => store.reviewIdentity({ ...f.settings, runId: 'liveabit-review-forged' })), /review_invocation_unavailable/);
  assert.equal(f.use(store => store.reviewIdentity({ ...f.settings, runId: randomUUID() })), null);
});

test('documented hook metadata binds tool calls although the SDK factory context has no runId', t => {
  const f = fixture(t); f.receive(event()); f.clock.now += 300000;
  const job = f.use(store => claimAnalysis(store, f.settings)); f.use(store => beginAnalysisDispatch(store, job));
  const bindings = createInvocationBindings({ getSettings: () => f.settings, now: f.now });
  const factory = { agentId: f.settings.agentId, sessionKey: f.settings.sessionKey, sessionId: 'synthetic-session' };
  const hook = { ...factory, toolName: 'liveabit_record_decision', toolCallId: 'call-1', runId: 'liveabit-review-' + job.admission_key };
  const hookEvent = { toolName: hook.toolName, params: { reviewId: 'model-forgery' } };
  assert.equal(bindings.before(hookEvent, hook), undefined);
  const bound = bindings.resolve(factory, hook.toolName, hook.toolCallId);
  assert.equal(bound.runId, hook.runId); bound.assertCurrent();
  assert.equal(bindings.before(hookEvent, { ...hook, runId: 'conflicting-run' }).block, true);
  assert.throws(() => bindings.resolve({ ...factory, sessionId: 'other-session' }, hook.toolName, hook.toolCallId), /invocation_unavailable/);
  bindings.after(hookEvent, hook); assert.throws(() => bound.assertCurrent(), /invocation_unavailable/);
  assert.throws(() => bindings.resolve(factory, hook.toolName, hook.toolCallId), /invocation_unavailable/);
  f.clock.now = job.deadline;
  assert.equal(bindings.before(hookEvent, { ...hook, toolCallId: 'expired-call' }).block, true);
  assert.throws(() => bindings.resolve(factory, hook.toolName, 'expired-call'), /invocation_unavailable/);
});

test('hook cancellation before execution rejects a binding even without a best-effort after hook', t => {
  const f = fixture(t), bindings = createInvocationBindings({ getSettings: () => f.settings, now: f.now });
  const controller = new AbortController(), factory = { agentId: f.settings.agentId, sessionKey: f.settings.sessionKey };
  const hook = { ...factory, toolName: 'liveabit_context', toolCallId: 'cancelled-read', runId: 'legacy-run', abortSignal: controller.signal };
  bindings.before({ toolName: hook.toolName, params: {} }, hook);
  const binding = bindings.resolve(factory, hook.toolName, hook.toolCallId);
  controller.abort();
  assert.throws(() => binding.assertCurrent(), /invocation_unavailable/);
  assert.throws(() => bindings.resolve(factory, hook.toolName, hook.toolCallId), /invocation_unavailable/);
});

test('a stalled native admission has a bounded deadline and its late continuation loses authority', async t => {
  const f = fixture(t); f.receive(event()); f.clock.now += 300000;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let captured, settle;
  const host = runtime({ run: params => { captured = params; return new Promise(resolve => { settle = resolve; }); } });
  const pending = f.tick(host);
  await new Promise(resolve => setImmediate(resolve));
  assert(captured); f.clock.now += 45000; t.mock.timers.tick(45000);
  const result = await pending;
  assert.equal(result.outcome, 'unavailable'); assert.equal(f.job().attempts, 1);
  assert.throws(() => captured.assertCurrent(), /review_lease_unavailable/);
  settle({ runId: captured.idempotencyKey, sessionKey: captured.sessionKey });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.job().run_id, null);
});

test('an observation arriving during a running review remains pending for the next generation', async t => {
  const f = fixture(t); f.receive(event()); f.clock.now += 300000;
  const host = runtime({ wait: async () => {
    f.clock.now += 1000; f.receive(event(f.clock.now)); return { status: 'ok' };
  } });
  assert.equal((await f.tick(host)).completed, true);
  assert.equal(f.state().completed_generation, 1); assert.equal(f.state().requested_generation, 2);
  assert.equal(f.job().target_generation, null); assert(f.job().due > f.clock.now);
});

test('a linked reply and an intentional follow-up coalesce without hiding new observations', t => {
  const f = fixture(t); f.receive(event());
  const original = f.job();
  f.use(store => store.recordDecision({ ...f.settings, reviewId: 'synthetic-followup', topic: 'Follow-up',
    action: 'defer', approach: 'wait', rationale: 'Reassess later.' }));
  f.use(store => store.scheduleAnalysis({ ...f.settings, dueAt: f.clock.now + 3600000, reason: 'agent_followup', reviewId: 'synthetic-followup' }));
  assert.equal(f.job().due, original.due);
  f.use(store => store.scheduleAnalysis({ ...f.settings, dueAt: f.clock.now, reason: 'user_reply' }));
  assert.equal(f.job().due, f.clock.now); assert.equal(f.job().reason, 'user_reply');
  assert.equal(f.state().requested_generation, 3);
});

test('agent follow-up compute is capped and idempotent until genuinely new activity or a linked report arrives', t => {
  const f = fixture(t), original = event(); f.receive(original); f.clock.now += 300000;
  let lastDecision;
  for (let index = 0; index < 4; index++) {
    const job = f.use(store => claimAnalysis(store, f.settings));
    f.use(store => beginAnalysisDispatch(store, job));
    lastDecision = f.use(store => store.recordDecision({ ...f.settings, reviewId: job.id,
      topic: 'Reconsideration ' + index, action: 'defer', approach: 'wait for feedback', rationale: 'No fresh user response.' }));
    const schedule = () => f.use(store => store.scheduleAnalysis({ ...f.settings,
      dueAt: f.clock.now + 60000, reason: 'agent_followup', reviewId: job.id }));
    const first = schedule();
    if (index < 3) {
      assert.equal(first.scheduled, true); assert.equal(schedule().duplicate, true);
      assert.equal(f.state().followup_count, index + 1);
    } else { assert.equal(first.scheduled, false); assert.equal(first.reason, 'followup_budget_exhausted'); }
    f.use(store => releaseAnalysis(store, job, { outcome: 'ok' }));
    if (f.job()) f.clock.now = f.job().due;
  }
  assert.equal(f.job(), undefined);
  f.receive(original); assert.equal(f.state().followup_count, 3); assert.equal(f.job(), undefined);
  f.use(store => store.recordFeedback({ ...f.settings, episodeId: lastDecision.episode_id,
    kind: 'user_report', outcome: 'intentional_use', report: 'I chose this break.', requestReview: true }));
  assert.equal(f.state().followup_count, 0); assert.equal(f.job().due, f.clock.now);
  f.use(store => store.db.prepare('UPDATE analysis_state SET followup_count=3').run());
  f.receive(event(f.clock.now)); assert.equal(f.state().followup_count, 0);
});

test('stale observations remain historical evidence but do not trigger delayed interventions; due work expires', async t => {
  const f = fixture(t);
  assert.equal(f.receive(event(BASE - 900000)).analysis_scheduled, false);
  assert.equal(f.job(), undefined);
  f.receive(event()); f.clock.now += 1200001;
  let runs = 0;
  await f.tick(runtime({ run: async () => { runs++; } }));
  assert.equal(runs, 0); assert.equal(f.job(), undefined); assert.equal(f.state().last_outcome, 'expired');
  f.receive(event(f.clock.now)); assert(f.job());
});

test('fresh activity after an outage gets a fresh review deadline even before the overdue scheduler wakes', t => {
  const f = fixture(t); f.receive(event()); const old = f.job();
  f.clock.now = old.deadline + 1;
  f.receive(event(f.clock.now));
  assert.notEqual(f.job().id, old.id);
  assert.equal(f.job().due, f.clock.now + 300000);
  assert.equal(f.state().completed_generation, 1);
  assert.equal(f.state().requested_generation, 2);
});

test('model admission outages back off and stop after bounded attempts', async t => {
  const f = fixture(t); f.receive(event()); f.clock.now += 300000;
  const host = runtime({ run: async () => { throw new Error('model offline'); } });
  const delays = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    const before = f.clock.now; await f.tick(host); delays.push(f.job().due - before); f.clock.now = f.job().due;
  }
  assert.deepEqual(delays, [30000, 60000, 120000, 240000, 300000]);
  await f.tick(host);
  assert.equal(f.job(), undefined); assert.equal(f.state().last_outcome, 'attempts_exhausted');
});

test('legacy conversation episode aliases preserve earlier decisions without changing original ownership', t => {
  const f = fixture(t);
  const made = f.use(store => store.recordDecision({ agentId: 'main', sessionKey: 'agent:main:main', topic: 'Earlier episode',
    action: 'question', approach: 'ask intent', rationale: 'Unknown intent', prompt: 'Was this intentional?' }));
  const store = new ActivityStore(f.settings.databasePath, { ...f.settings, now: f.now, legacyEpisodeSessionKeys: ['agent:main:main'] });
  try {
    assert.equal(store.episodes('main', f.settings.sessionKey)[0].id, made.episode_id);
    assert.equal(store.notificationDecision(made.decision_id, 'main', f.settings.sessionKey).session_key, 'agent:main:main');
    assert.throws(() => store.notificationDecision(made.decision_id, 'other', 'agent:other:main'), /decision_unavailable/);
  } finally { store.close(); }
});

test('a scheduled review has one durable decision identity even without a model-provided event identity', t => {
  const f = fixture(t); f.receive(event()); f.clock.now += 300000;
  const job = f.use(store => claimAnalysis(store, f.settings));
  f.use(store => beginAnalysisDispatch(store, job));
  f.use(store => attachAnalysisRun(store, job, 'first-native-run'));
  const first = f.use(store => store.recordDecision({ ...f.settings,
    reviewId: store.reviewIdentity({ ...f.settings, runId: 'first-native-run' }), reviewRunId: 'first-native-run',
    topic: 'Intentional pause', action: 'question', approach: 'ask intent', rationale: 'Unknown intent', prompt: 'Was this intentional?' }));
  const later = f.use(store => store.recordDecision({ ...f.settings, reviewId: job.id,
    topic: 'Accidental second topic', action: 'nudge', approach: 'redirect', rationale: 'Retry after tool result loss', prompt: 'Try this instead.' }));
  assert.equal(later.duplicate, true); assert.equal(later.decision_id, first.decision_id);
  assert.equal(f.use(store => store.db.prepare('SELECT COUNT(*) AS n FROM decisions').get().n), 1);
  f.use(store => releaseAnalysis(store, job, { outcome: 'error' }));
  const retry = f.job(); assert.equal(retry.id, job.id); assert.notEqual(retry.admission_key, job.admission_key);
});

test('actual HTTP receiver rejects unauthorized traffic before storage and binds receipt to exact wire body', async t => {
  const f = fixture(t), token = 'synthetic-hook-token';
  const server = createServer(receiptHandler({ getToken: () => token, getSettings: () => f.settings, now: f.now }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const post = (body, key = token) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, method: 'POST', headers: {
      Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks)) }));
    }); req.on('error', reject); req.end(body);
  });
  assert.equal((await post('{}', 'wrong')).status, 401);
  assert.equal(f.job(), undefined);
  const probe = await post('{}'); assert.equal(probe.status, 400); assert.equal(probe.body.error, 'activity_message_required');
  const observation = event(), wire = JSON.stringify(payload(observation));
  const receipt = await post(wire); assert.equal(receipt.status, 200);
  assert.equal(receipt.body.event_id, observation.event_id);
  assert.equal(receipt.body.body_sha256, createHash('sha256').update(wire).digest('hex'));
  assert.equal(receipt.body.durable, true); assert.equal(Object.hasOwn(receipt.body, 'runId'), false);
  assert.equal((await post(wire)).body.disposition, 'duplicate');
  const changed = structuredClone(observation); changed.observation.apps[0].foreground_duration_ms++;
  assert.equal((await post(JSON.stringify(payload(changed)))).status, 409);
});
