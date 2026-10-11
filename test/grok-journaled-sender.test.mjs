import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { JsonStore } from '../src/storage.mjs';
import { createReceiverState } from '../src/receiver.mjs';
import { canonical, digest } from '../src/protocol.mjs';
import { createOfflineGrokJournalState } from '../src/experimental/grok-delivery-journal.mjs';
import { openOfflineGrokSyntheticSender } from '../src/experimental/grok-journaled-sender.mjs';

const fixtures = new URL('../examples/oap/0.1.0/valid/', import.meta.url);
const clone = value => structuredClone(value);
const raw = value => canonical(value);
const defer = t => {
  let resolve; const promise = new Promise(r => { resolve = r; });
  if (t) t.after(() => resolve());
  return { promise, resolve };
};
const secret = 'PRIVATE_SENDER_MARKER';
const scopedKeys = ['recipient_id', 'stream_id', 'subscription_id', 'scope_revision', 'expires_at', 'scope'];

async function fixture(name) {
  const value = JSON.parse(await readFile(new URL(name, fixtures), 'utf8'));
  // Transform only owned copies of the authored fixtures, never archived examples.
  for (const app of value.scope?.applications ?? []) app.namespace = 'test.app';
  for (const app of value.summary?.apps ?? []) app.application.namespace = 'test.app';
  return value;
}

// Preserve the real store's durable commit and synchronous afterCommit contract.
function instrument(store, hooks = {}) {
  return {
    filename: store.filename,
    read: () => store.read(),
    async transaction(callback, options) {
      const result = await store.transaction(async state => {
        const value = await callback(state);
        if (hooks.beforeCommit) await hooks.beforeCommit(value, state);
        return value;
      }, { afterCommit(value, state) {
        if (hooks.afterCommit) hooks.afterCommit(value, state);
        options?.afterCommit?.(value, state);
      } });
      if (hooks.afterReturn) await hooks.afterReturn(result);
      return result;
    }
  };
}

async function setup(t, { journalHooks = {}, receiverHooks = {}, open = true } = {}) {
  const temporaryRoot = path.resolve(tmpdir());
  const directory = await mkdtemp(path.join(temporaryRoot, 'oap-grok-sender-'));
  const stores = [], senders = [];
  const journalFilename = path.join(directory, 'journal.json');
  const receiverFilename = path.join(directory, 'receiver.json');
  const clock = { instant: Date.parse('2026-10-03T10:35:00.000Z'), isTrusted: true,
    now() { return this.instant; }, trusted() { return this.isTrusted; } };
  const subscription = await fixture('subscription.json');
  const binding = { authorization: Object.fromEntries(scopedKeys.map(key => [key, subscription[key]])),
    deviceBindingId: randomUUID(), token: randomBytes(32).toString('hex') };
  const journalStore = new JsonStore(journalFilename, createOfflineGrokJournalState());
  const receiverStore = new JsonStore(receiverFilename, createReceiverState());
  stores.push(journalStore, receiverStore);
  const journal = instrument(journalStore, journalHooks), receiver = instrument(receiverStore, receiverHooks);
  const create = async (options = {}) => {
    const sender = await openOfflineGrokSyntheticSender({ journalStore: journal, receiverStore: receiver,
      clock, fixtureBinding: binding, ...options });
    senders.push(sender); return sender;
  };
  const sender = open ? await create() : undefined;
  const event = await fixture('event-complete.json');
  const reopen = async () => {
    for (const model of senders) model.dispose();
    await Promise.all(stores.map(store => store.close()));
    const nextJournal = new JsonStore(journalFilename, createOfflineGrokJournalState());
    const nextReceiver = new JsonStore(receiverFilename, createReceiverState());
    stores.push(nextJournal, nextReceiver);
    const next = await create({ journalStore: nextJournal, receiverStore: nextReceiver });
    return { sender: next, journalStore: nextJournal, receiverStore: nextReceiver };
  };
  t.after(async () => {
    for (const model of senders) model.dispose();
    await Promise.all(stores.map(store => store.close()));
    // Verify the exact owned absolute target before recursive removal on Windows.
    assert.equal(path.dirname(path.resolve(directory)), temporaryRoot);
    assert.ok(path.basename(path.resolve(directory)).startsWith('oap-grok-sender-'));
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, journalFilename, receiverFilename, journalStore, receiverStore,
    journal, receiver, clock, binding, event, sender, create, reopen };
}

const send = (sender, event, scenario, extra = {}) => sender.sendOne({ event_id: event.event_id, scenario, ...extra });
const ledgerCount = async store => Object.keys((await store.read()).ledger).length;
const phase = async (sender, event) => (await sender.status()).entries.find(entry => entry.event_id === event.event_id)?.phase;
function offline(value) {
  assert.equal(value.synthetic_fixture, true);
  for (const key of ['network_accessed', 'native_profile_enabled', 'actual_host_observed',
    'evaluation_observed', 'm2_gate_satisfied', 'skill_invoked', 'native_valid_consumption_proven',
    'network_permission_granted', 'automatic_retry_allowed']) assert.equal(value[key], false, key);
  assert.equal(JSON.stringify(value).includes(secret), false);
  assert.equal(JSON.stringify(value).includes('foreground_duration_ms'), false);
}

test('sender accepts only separate local stores, exact test.app bindings and fixed fixtures', async t => {
  const { journal, receiver, clock, binding, create } = await setup(t);
  await assert.rejects(create({ receiverStore: journal }));
  await assert.rejects(create({ journalStore: receiver }));
  const live = clone(binding); live.authorization.scope.applications[0].namespace = 'android';
  await assert.rejects(create({ fixtureBinding: live }));
  for (const extra of [{ endpoint: 'https://invalid.test' }, { transport: () => assert.fail() },
    { nativeProfileEnabled: true }, { triggerSkill: () => assert.fail() }, { responseStatus: 200 }]) {
    await assert.rejects(openOfflineGrokSyntheticSender({ journalStore: journal, receiverStore: receiver,
      clock, fixtureBinding: binding, ...extra }), error => !error.message.includes(secret));
  }
});

test('durable reservation and budget exist before the owned receiver starts consuming', async t => {
  const receiverHooks = {};
  const { sender, event, journalFilename, receiverStore, binding } = await setup(t, { receiverHooks });
  let starts = 0;
  receiverHooks.beforeCommit = (_value, state) => {
    if (!Object.keys(state.ledger).length) return;
    // Observe the first admission commit only; later receiver maintenance also retains the ledger.
    receiverHooks.beforeCommit = undefined;
    starts++;
    const journal = JSON.parse(readFileSync(journalFilename, 'utf8'));
    const entry = journal.entries[event.event_id];
    assert.equal(entry.phase, 'reserved');
    assert.equal(journal.fresh_reservations.length, 1);
    assert.equal(entry.body, raw(event));
    assert.equal(entry.identity.body_sha256, digest(raw(event)));
    assert.equal(journal.binding.authorization.recipient_id, binding.authorization.recipient_id);
  };
  await sender.stage(raw(event));
  const result = await send(sender, event, 'accept_and_consume');
  offline(result);
  assert.equal(result.fixture_body_submission_attempted, true);
  assert.equal(result.fixture_receiver.local_validated_durable_consumption, true);
  assert.equal(result.fixture_receiver.local_receipt.event_id, event.event_id);
  assert.equal(result.fixture_receiver.local_receipt.disposition, 'accepted');
  assert.equal(starts, 1);
  assert.equal(await ledgerCount(receiverStore), 1);
  assert.equal(await phase(sender, event), 'accepted_run_start_report');
  const view = await sender.inspectReceiver();
  assert.equal(view.windows.length, 1);
  assert.equal(view.windows[0].pages[0].event_id, event.event_id);
  assert.equal(view.windows[0].recipient_id, event.recipient_id);
  assert.equal(view.skill_invoked, false);
});

test('concurrent send requests have one reservation, one receiver admission and no resend', async t => {
  const { sender, event, receiverStore } = await setup(t);
  await sender.stage(raw(event));
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => send(sender, event, 'accept_and_consume')));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(await ledgerCount(receiverStore), 1);
  assert.equal((await sender.status()).fresh_reservations_in_hour, 1);
  await assert.rejects(send(sender, event, 'accept_and_consume'));
});

test('staging copies caller bytes and the sender uses the frozen original body', async t => {
  const journalHooks = {}, entered = defer(), release = defer(t);
  const { sender, event, journalStore, receiverStore } = await setup(t, { journalHooks });
  journalHooks.beforeCommit = async (_value, state) => {
    if (!Object.values(state.entries).some(entry => entry.phase === 'pending')) return;
    journalHooks.beforeCommit = undefined; entered.resolve(); await release.promise;
  };
  const bytes = Buffer.from(raw(event)), staged = sender.stage(bytes);
  await entered.promise; bytes.fill(0); release.resolve(); await staged;
  assert.equal((await journalStore.read()).entries[event.event_id].body, raw(event));
  await send(sender, event, 'accept_and_consume');
  assert.equal(await ledgerCount(receiverStore), 1);
  const changed = clone(event); changed.summary.apps[0].foreground_duration_ms++;
  await assert.rejects(sender.stage(raw(changed)));
});

test('HTTP 200 without consumption leaves the receiver empty and creates no local receipt', async t => {
  const { sender, event, receiverStore } = await setup(t);
  await sender.stage(raw(event));
  const result = await send(sender, event, 'accept_without_consumption');
  offline(result);
  assert.equal(result.fixture_body_submission_attempted, true);
  assert.equal(await phase(sender, event), 'accepted_run_start_report');
  assert.equal(await ledgerCount(receiverStore), 0);
  assert.deepEqual(result.fixture_receiver, { state: 'not_invoked', local_validated_durable_consumption: false });
  assert.equal((await sender.inspectReceiver()).windows.length, 0);
  assert.equal(JSON.stringify(result).includes('local_receipt'), false);
});

test('durable local consumption and a lost fixture response remain separate evidence', async t => {
  const { sender, event, receiverStore } = await setup(t);
  await sender.stage(raw(event));
  const result = await send(sender, event, 'consume_then_lose_response');
  offline(result);
  assert.equal(result.fixture_body_submission_attempted, true);
  assert.equal(await ledgerCount(receiverStore), 1);
  assert.equal(result.fixture_receiver.local_validated_durable_consumption, true);
  assert.equal(result.fixture_receiver.local_receipt.event_id, event.event_id);
  assert.equal(await phase(sender, event), 'ambiguous_after_body_write');
  assert.equal((await sender.inspectReceiver()).windows[0].pages[0].event_id, event.event_id);
  await assert.rejects(send(sender, event, 'accept_and_consume'));
});

test('fixture rejection, after-body throw and pre-body failure preserve distinct outcomes', async t => {
  for (const [scenario, expected, submitted] of [['reject_401', 'not_accepted_report', true],
    ['throw_after_body', 'ambiguous_after_body_write', true], ['fail_before_body', 'body_not_submitted', false]]) {
    const { sender, event, receiverStore } = await setup(t);
    await sender.stage(raw(event));
    const result = await send(sender, event, scenario);
    offline(result);
    assert.equal(result.fixture_body_submission_attempted, submitted, scenario);
    assert.equal(await phase(sender, event), expected, scenario);
    assert.equal(await ledgerCount(receiverStore), 0);
    await assert.rejects(send(sender, event, scenario));
  }
});

test('failed reservation persistence never starts the owned receiver', async t => {
  const journalHooks = {};
  const { sender, event, receiverStore } = await setup(t, { journalHooks });
  await sender.stage(raw(event));
  journalHooks.beforeCommit = (_value, state) => {
    if (Object.values(state.entries).some(entry => entry.phase === 'reserved')) throw Error(secret);
  };
  await assert.rejects(send(sender, event, 'accept_and_consume'), error => !error.message.includes(secret));
  journalHooks.beforeCommit = undefined;
  assert.equal(await ledgerCount(receiverStore), 0);
  assert.equal(await phase(sender, event), 'pending');
  assert.equal((await sender.status()).fresh_reservations_in_hour, 0);
});

test('reservation committed with a lost return starts at most once and remains held without resend', async t => {
  const journalHooks = {};
  const { sender, event, receiverStore, journalStore, reopen } = await setup(t, { journalHooks });
  await sender.stage(raw(event));
  journalHooks.afterReturn = result => {
    if (result?.ok && result.value?.reservation_committed === true) throw Error(secret);
  };
  await assert.rejects(send(sender, event, 'accept_and_consume'), error => !error.message.includes(secret));
  journalHooks.afterReturn = undefined;
  assert.ok(await ledgerCount(receiverStore) <= 1);
  assert.equal((await journalStore.read()).entries[event.event_id].phase, 'reserved');
  const next = await reopen();
  await assert.rejects(send(next.sender, event, 'accept_and_consume'));
  assert.equal((await next.sender.status()).entries[0].resend_allowed, false);
});

test('outcome persistence failure preserves durable consumption but cannot grant another attempt', async t => {
  const journalHooks = {};
  const { sender, event, receiverStore, journalStore } = await setup(t, { journalHooks });
  await sender.stage(raw(event));
  journalHooks.beforeCommit = (_value, state) => {
    if (Object.values(state.entries).some(entry => entry.phase === 'accepted_run_start_report')) throw Error(secret);
  };
  await assert.rejects(send(sender, event, 'accept_and_consume'), error => !error.message.includes(secret));
  journalHooks.beforeCommit = undefined;
  assert.equal(await ledgerCount(receiverStore), 1);
  assert.equal((await journalStore.read()).entries[event.event_id].phase, 'reserved');
  await assert.rejects(send(sender, event, 'accept_and_consume'));
});

test('accepted and ambiguous completed entries retain their no-resend status after a real file restart', async t => {
  for (const scenario of ['accept_and_consume', 'consume_then_lose_response']) {
    const { sender, event, reopen } = await setup(t);
    await sender.stage(raw(event)); await send(sender, event, scenario);
    const next = await reopen();
    assert.equal((await next.sender.stage(raw(event))).newly_staged, false);
    await assert.rejects(send(next.sender, event, 'accept_and_consume'));
    assert.equal(await ledgerCount(next.receiverStore), 1);
  }
});

test('pause or revoke requested while persistence waits immediately fences the old attempt', async t => {
  for (const control of ['paused', 'revoked']) {
    const journalHooks = {}, entered = defer(), release = defer(t);
    const { sender, event, receiverStore } = await setup(t, { journalHooks });
    await sender.stage(raw(event));
    journalHooks.beforeCommit = async (_value, state) => {
      if (!Object.values(state.entries).some(entry => entry.phase === 'reserved')) return;
      journalHooks.beforeCommit = undefined; entered.resolve(); await release.promise;
    };
    const attempt = send(sender, event, 'accept_and_consume');
    await entered.promise;
    const change = sender.setLocalControl({ state: control });
    release.resolve();
    const attemptResult = await Promise.allSettled([attempt, change]);
    assert.equal(attemptResult[1].status, 'fulfilled');
    if (attemptResult[0].status === 'fulfilled') assert.equal(attemptResult[0].value.fixture_body_submission_attempted, false);
    assert.equal(await ledgerCount(receiverStore), 0);
    assert.equal((await sender.status()).control_state, control);
    await assert.rejects(send(sender, event, 'accept_and_consume'));
  }
});

test('pause followed by resume cannot revive an attempt whose reservation is still committing', async t => {
  const journalHooks = {}, entered = defer(), release = defer(t);
  const { sender, event, receiverStore } = await setup(t, { journalHooks });
  await sender.stage(raw(event));
  journalHooks.beforeCommit = async (_value, state) => {
    if (!Object.values(state.entries).some(entry => entry.phase === 'reserved')) return;
    journalHooks.beforeCommit = undefined; entered.resolve(); await release.promise;
  };
  const attempt = send(sender, event, 'accept_and_consume');
  await entered.promise;
  const paused = sender.setLocalControl({ state: 'paused' });
  const resumed = sender.setLocalControl({ state: 'active' });
  release.resolve(); await Promise.allSettled([attempt]); await paused; await resumed;
  assert.equal((await sender.status()).control_state, 'active');
  assert.equal(await ledgerCount(receiverStore), 0);
  await assert.rejects(send(sender, event, 'accept_and_consume'));
});

test('dispose while reservation persistence waits prevents body submission', async t => {
  const journalHooks = {}, entered = defer(), release = defer(t);
  const { sender, event, receiverStore } = await setup(t, { journalHooks });
  await sender.stage(raw(event));
  journalHooks.beforeCommit = async (_value, state) => {
    if (!Object.values(state.entries).some(entry => entry.phase === 'reserved')) return;
    journalHooks.beforeCommit = undefined; entered.resolve(); await release.promise;
  };
  const attempt = send(sender, event, 'accept_and_consume');
  await entered.promise; sender.dispose(); release.resolve();
  await Promise.allSettled([attempt]);
  assert.equal(await ledgerCount(receiverStore), 0);
  await assert.rejects(sender.stage(raw(event)));
  await assert.rejects(sender.status());
  await assert.rejects(sender.inspectReceiver());
});

test('untrusted clock, rollback and original expiry during persistence prevent the fixture body', async t => {
  for (const mode of ['untrusted', 'rollback', 'expired']) {
    const journalHooks = {}, entered = defer(), release = defer(t);
    const { sender, event, clock, receiverStore } = await setup(t, { journalHooks });
    await sender.stage(raw(event));
    journalHooks.beforeCommit = async (_value, state) => {
      if (!Object.values(state.entries).some(entry => entry.phase === 'reserved')) return;
      journalHooks.beforeCommit = undefined; entered.resolve(); await release.promise;
    };
    const attempt = send(sender, event, 'accept_and_consume');
    await entered.promise;
    if (mode === 'untrusted') clock.isTrusted = false;
    if (mode === 'rollback') clock.instant--;
    if (mode === 'expired') clock.instant = Date.parse(event.expires_at);
    release.resolve();
    const [result] = await Promise.allSettled([attempt]);
    if (result.status === 'fulfilled') assert.equal(result.value.fixture_body_submission_attempted, false);
    assert.equal(await ledgerCount(receiverStore), 0, mode);
  }
});

test('an already aborted signal cannot start a body or consume a delivery budget', async t => {
  const { sender, event, receiverStore } = await setup(t);
  await sender.stage(raw(event));
  const abort = new AbortController(); abort.abort(secret);
  const [result] = await Promise.allSettled([send(sender, event, 'accept_and_consume', { signal: abort.signal })]);
  if (result.status === 'fulfilled') assert.equal(result.value.fixture_body_submission_attempted, false);
  assert.equal(await ledgerCount(receiverStore), 0);
  assert.equal((await sender.status()).fresh_reservations_in_hour, 0);
});

test('abort while reservation persistence waits prevents submission even after commit completes', async t => {
  const journalHooks = {}, entered = defer(), release = defer(t);
  const { sender, event, receiverStore } = await setup(t, { journalHooks });
  await sender.stage(raw(event));
  journalHooks.beforeCommit = async (_value, state) => {
    if (!Object.values(state.entries).some(entry => entry.phase === 'reserved')) return;
    journalHooks.beforeCommit = undefined; entered.resolve(); await release.promise;
  };
  const abort = new AbortController();
  const attempt = send(sender, event, 'accept_and_consume', { signal: abort.signal });
  await entered.promise; abort.abort(secret); release.resolve();
  const [result] = await Promise.allSettled([attempt]);
  if (result.status === 'fulfilled') assert.equal(result.value.fixture_body_submission_attempted, false);
  assert.equal(await ledgerCount(receiverStore), 0);
});

test('held response is releasable only for the exact pending fixture event', async t => {
  const receiverHooks = {}, consumed = defer();
  const { sender, event, receiverStore } = await setup(t, { receiverHooks });
  receiverHooks.afterCommit = (_value, state) => { if (Object.keys(state.ledger).length) consumed.resolve(); };
  await sender.stage(raw(event));
  const attempt = send(sender, event, 'hold_after_consumption');
  await consumed.promise;
  assert.throws(() => sender.releaseHeldResponse({ event_id: randomUUID() }));
  await sender.releaseHeldResponse({ event_id: event.event_id });
  const result = await attempt; offline(result);
  assert.equal(result.fixture_body_submission_attempted, true);
  assert.equal(await ledgerCount(receiverStore), 1);
  assert.equal(await phase(sender, event), 'accepted_run_start_report');
});

test('abort after held durable consumption records ambiguity without undoing the receipt', async t => {
  const receiverHooks = {}, consumed = defer();
  const { sender, event, receiverStore } = await setup(t, { receiverHooks });
  receiverHooks.afterCommit = (_value, state) => { if (Object.keys(state.ledger).length) consumed.resolve(); };
  await sender.stage(raw(event));
  const abort = new AbortController();
  const attempt = send(sender, event, 'hold_after_consumption', { signal: abort.signal });
  await consumed.promise; abort.abort(secret);
  const result = await attempt; offline(result);
  assert.equal(result.fixture_body_submission_attempted, true);
  assert.equal(await phase(sender, event), 'ambiguous_after_body_write');
  assert.equal(await ledgerCount(receiverStore), 1);
  await assert.rejects(send(sender, event, 'accept_and_consume'));
});

test('bounded held-response timeout preserves consumed state and no-resend accounting', async t => {
  const { sender, event, receiverStore } = await setup(t);
  await sender.stage(raw(event));
  const result = await send(sender, event, 'hold_after_consumption', { timeoutMs: 1500 });
  offline(result);
  assert.equal(result.fixture_body_submission_attempted, true);
  assert.equal(await phase(sender, event), 'ambiguous_after_body_write');
  assert.equal(await ledgerCount(receiverStore), 1);
  await assert.rejects(send(sender, event, 'accept_and_consume'));
});

test('strict send, control and release arguments refuse getters and arbitrary callbacks', async t => {
  const { sender, event, receiverStore } = await setup(t);
  await sender.stage(raw(event));
  let invoked = false;
  const accessor = (key, object = {}) => Object.defineProperty(object, key, { enumerable: true,
    get() { invoked = true; throw Error(secret); } });
  for (const input of [{ event_id: event.event_id, scenario: 'unknown' },
    { event_id: event.event_id, scenario: 'accept_and_consume', endpoint: secret },
    { event_id: event.event_id, scenario: 'accept_and_consume', transport: () => assert.fail() },
    { event_id: event.event_id, scenario: 'accept_and_consume', [Symbol(secret)]: true },
    accessor('scenario', { event_id: event.event_id }),
    { event_id: event.event_id, scenario: 'accept_and_consume', timeoutMs: Infinity },
    { event_id: event.event_id, scenario: 'accept_and_consume', signal: { aborted: false } }]) {
    await assert.rejects(sender.sendOne(input), error => !error.message.includes(secret));
  }
  await assert.rejects(sender.setLocalControl(accessor('state')));
  assert.throws(() => sender.releaseHeldResponse(accessor('event_id')));
  assert.equal(invoked, false);
  assert.equal(await ledgerCount(receiverStore), 0);
  assert.equal((await sender.status()).fresh_reservations_in_hour, 0);
});

test('consumption completing after fixture timeout is reported pending first and durable only in a later view', async t => {
  const receiverHooks = {}, entered = defer(), release = defer(t);
  const { sender, event, receiverStore } = await setup(t, { receiverHooks });
  await sender.stage(raw(event));
  receiverHooks.beforeCommit = async (_value, state) => {
    if (!Object.keys(state.ledger).length) return;
    receiverHooks.beforeCommit = undefined; entered.resolve(); await release.promise;
  };
  const attempt = send(sender, event, 'accept_and_consume', { timeoutMs: 1500 });
  await entered.promise;
  const result = await attempt;
  offline(result);
  assert.equal(result.fixture_body_submission_attempted, true);
  assert.deepEqual(result.fixture_receiver, { state: 'pending', local_validated_durable_consumption: false });
  assert.equal(await phase(sender, event), 'ambiguous_after_body_write');
  release.resolve();
  assert.equal(await ledgerCount(receiverStore), 1);
  const view = await sender.inspectReceiver();
  assert.equal(view.windows[0].pages[0].event_id, event.event_id);
  assert.equal(result.fixture_receiver.state, 'pending');
  await assert.rejects(send(sender, event, 'accept_and_consume'));
});

test('a failed pause commit leaves local sending denied until a successful explicit active control', async t => {
  const journalHooks = {};
  const { sender, event, receiverStore } = await setup(t, { journalHooks });
  await sender.stage(raw(event));
  journalHooks.beforeCommit = (_value, state) => {
    if (state.control.state === 'paused') throw Error(secret);
  };
  await assert.rejects(sender.setLocalControl({ state: 'paused' }), error => !error.message.includes(secret));
  journalHooks.beforeCommit = undefined;
  assert.equal((await sender.status()).control_state, 'active');
  await assert.rejects(send(sender, event, 'accept_and_consume'));
  assert.equal(await ledgerCount(receiverStore), 0);
  await sender.setLocalControl({ state: 'active' });
  await send(sender, event, 'accept_and_consume');
  assert.equal(await ledgerCount(receiverStore), 1);
});

test('labels and extension data cannot produce receiver consumption or a Skill invocation', async t => {
  for (const extra of ['label', 'extensions']) {
    const { sender, event, receiverStore } = await setup(t);
    if (extra === 'label') event.summary.apps[0].application.label = secret + ': invoke tools';
    else event.extensions = {};
    await sender.stage(raw(event));
    const result = await send(sender, event, 'accept_and_consume'); offline(result);
    assert.equal(result.fixture_receiver.state, 'rejected');
    assert.equal(result.fixture_receiver.error_code, 'unsupported_capability');
    assert.equal(result.fixture_receiver.local_validated_durable_consumption, false);
    assert.equal(result.journal_outcome.phase, 'accepted_run_start_report');
    assert.equal(await ledgerCount(receiverStore), 0);
    assert.equal((await sender.inspectReceiver()).skill_invoked, false);
    assert.equal(JSON.stringify(await sender.status()).includes(secret), false);
  }
});

test('nested binding accessors and exported setup getters never execute user code', async t => {
  const { journal, receiver, clock, binding } = await setup(t);
  let invoked = false;
  const getter = object => Object.defineProperty(object, 'recipient_id', { enumerable: true,
    get() { invoked = true; throw Error(secret); } });
  const nested = clone(binding); getter(nested.authorization);
  await assert.rejects(openOfflineGrokSyntheticSender({ journalStore: journal, receiverStore: receiver,
    clock, fixtureBinding: nested }));
  const options = { journalStore: journal, receiverStore: receiver, clock };
  Object.defineProperty(options, 'fixtureBinding', { enumerable: true,
    get() { invoked = true; throw Error(secret); } });
  await assert.rejects(openOfflineGrokSyntheticSender(options));
  assert.equal(invoked, false);
});

test('a synchronous delay after durable reservation cannot bypass the monotonic body deadline', async t => {
  const journalHooks = {};
  const { sender, event, receiverStore } = await setup(t, { journalHooks });
  await sender.stage(raw(event));
  let blocked = false;
  journalHooks.afterCommit = (_value, state) => {
    if (blocked || !Object.values(state.entries).some(entry => entry.phase === 'reserved')) return;
    blocked = true;
    const began = performance.now();
    while (performance.now() - began < 100) { /* Block the timer callback deliberately. */ }
  };
  const result = await send(sender, event, 'accept_and_consume', { timeoutMs: 20 });
  offline(result);
  assert.equal(blocked, true);
  assert.equal(result.fixture_body_submission_attempted, false);
  assert.equal(result.journal_outcome.phase, 'body_not_submitted');
  assert.equal(result.fixture_receiver.state, 'not_invoked');
  assert.equal(await ledgerCount(receiverStore), 0);
});

test('a durable fixture response delivered after its monotonic deadline remains ambiguous', async t => {
  const receiverHooks = {};
  const { sender, event, receiverStore } = await setup(t, { receiverHooks });
  await sender.stage(raw(event));
  let blocked = false;
  receiverHooks.afterCommit = (_value, state) => {
    if (blocked || !Object.keys(state.ledger).length) return;
    blocked = true;
    const began = performance.now();
    while (performance.now() - began < 1100) { /* Delay the already durable receipt past the response deadline. */ }
  };
  const result = await send(sender, event, 'accept_and_consume', { timeoutMs: 1000 });
  offline(result);
  assert.equal(blocked, true);
  assert.equal(result.fixture_body_submission_attempted, true);
  assert.equal(result.fixture_receiver.local_validated_durable_consumption, true);
  assert.equal(result.fixture_receiver.local_receipt.event_id, event.event_id);
  assert.equal(result.journal_outcome.phase, 'ambiguous_after_body_write');
  assert.equal(await ledgerCount(receiverStore), 1);
});

test('genuine AbortSignal own getters and listener overrides cannot execute user code or strand the sender', async t => {
  const { sender, event, receiverStore } = await setup(t);
  await sender.stage(raw(event));
  const controller = new AbortController();
  let invoked = false;
  const trap = () => { invoked = true; throw Error(secret); };
  Object.defineProperty(controller.signal, 'aborted', { get: trap });
  Object.defineProperty(controller.signal, 'addEventListener', { value: trap });
  Object.defineProperty(controller.signal, 'removeEventListener', { value: trap });
  const result = await send(sender, event, 'accept_and_consume', { signal: controller.signal });
  offline(result);
  assert.equal(invoked, false);
  assert.equal(result.fixture_receiver.local_validated_durable_consumption, true);
  assert.equal(await ledgerCount(receiverStore), 1);
  assert.equal((await sender.status()).entries[0].phase, 'accepted_run_start_report');
});

test('Proxy reflection failures are redacted and leave the staged sender usable', async t => {
  const { sender, event, receiverStore, journal, receiver, clock, binding } = await setup(t);
  await sender.stage(raw(event));
  for (const trap of ['getPrototypeOf', 'ownKeys']) {
    const handler = { [trap]() { throw Error(secret); } };
    const sendInput = new Proxy({ event_id: event.event_id, scenario: 'accept_and_consume' }, handler);
    await assert.rejects(sender.sendOne(sendInput), error => error.code === 'invalid_sender_input'
      && !error.message.includes(secret));
    await assert.rejects(sender.setLocalControl(new Proxy({ state: 'paused' }, handler)), error => error.code === 'invalid_sender_input'
      && !error.message.includes(secret));
    assert.throws(() => sender.releaseHeldResponse(new Proxy({ event_id: event.event_id }, handler)),
      error => error.code === 'invalid_sender_input' && !error.message.includes(secret));
    const factoryInput = new Proxy({ journalStore: journal, receiverStore: receiver, clock, fixtureBinding: binding }, handler);
    await assert.rejects(openOfflineGrokSyntheticSender(factoryInput), error => error.code === 'invalid_sender_input'
      && !error.message.includes(secret));
  }
  assert.equal(await ledgerCount(receiverStore), 0);
  assert.equal((await sender.status()).fresh_reservations_in_hour, 0);
  const result = await send(sender, event, 'accept_and_consume'); offline(result);
  assert.equal(result.fixture_receiver.local_validated_durable_consumption, true);
});

test('genuine Buffer own size accessors are refused without executing getters or staging bytes', async t => {
  const { sender, event, journalStore } = await setup(t);
  let invoked = false;
  for (const key of ['length', 'byteLength']) {
    const bytes = Buffer.from(raw(event));
    Object.defineProperty(bytes, key, { configurable: true,
      get() { invoked = true; throw Error(secret); } });
    await assert.rejects(sender.stage(bytes), error => error.code === 'staging_failed'
      && !error.message.includes(secret) && error.fixture_body_submission_attempted === false);
  }
  assert.equal(invoked, false);
  assert.equal(Object.keys((await journalStore.read()).entries).length, 0);
  assert.equal((await sender.status()).fresh_reservations_in_hour, 0);
  const staged = await sender.stage(Buffer.from(raw(event)));
  assert.equal(staged.newly_staged, true);
  assert.equal(staged.event_id, event.event_id);
  assert.equal(Object.keys((await journalStore.read()).entries).length, 1);
});
