import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { JsonStore } from '../src/storage.mjs';
import { canonical } from '../src/protocol.mjs';
import { createOfflineGrokJournalState, openOfflineGrokDeliveryJournal } from '../src/experimental/grok-delivery-journal.mjs';
import { exerciseGrokDeliveryJournal } from '../scripts/exercise-grok-delivery-journal.mjs';

const examples = new URL('../examples/oap/0.1.0/valid/', import.meta.url);
const clone = value => structuredClone(value);
const raw = value => canonical(value);
const rejects = code => error => error?.code === code;
const finalObservation = overrides => ({ connectionFailed: false, requestBodyWritten: true, responseStatus: 200, ...overrides });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const execute = promisify(execFile);
const evidenceParent = fileURLToPath(new URL('../artifacts/grok-delivery-journal/', import.meta.url));
const evidenceDirectories = async () => (await readdir(evidenceParent).catch(error => {
  if (error.code === 'ENOENT') return [];
  throw error;
})).sort();

async function fixture(name) {
  const value = JSON.parse(await readFile(new URL(name, examples), 'utf8'));
  // Transform an owned copy only; archived protocol fixtures stay unchanged.
  for (const app of value.scope?.applications ?? []) app.namespace = 'test.app';
  for (const app of value.summary?.apps ?? []) app.application.namespace = 'test.app';
  return value;
}

async function setup(t) {
  const temporaryRoot = path.resolve(tmpdir());
  const directory = await mkdtemp(path.join(temporaryRoot, 'oap-grok-journal-'));
  const stores = [];
  const models = [];
  t.after(async () => {
    for (const model of models) model.dispose();
    for (const store of stores) await store.close();
    // Resolve and check the exact owned target before recursive removal on Windows.
    assert.equal(path.dirname(path.resolve(directory)), temporaryRoot);
    assert.ok(path.basename(path.resolve(directory)).startsWith('oap-grok-journal-'));
    await rm(directory, { recursive: true, force: true });
  });
  const filename = path.join(directory, 'journal.json');
  const clock = { instant: Date.parse('2026-10-03T10:35:00.000Z'), isTrusted: true,
    now() { return this.instant; }, trusted() { return this.isTrusted; } };
  const subscription = await fixture('subscription.json');
  const authorization = Object.fromEntries(['recipient_id', 'stream_id', 'subscription_id', 'scope_revision', 'expires_at', 'scope']
    .map(key => [key, subscription[key]]));
  const binding = { authorization, deviceBindingId: randomUUID() };
  const store = new JsonStore(filename, createOfflineGrokJournalState()); stores.push(store);
  const create = async (candidate = binding, alternateStore = store) => {
    const model = await openOfflineGrokDeliveryJournal({ store: alternateStore, clock, fixtureBinding: candidate });
    models.push(model); return model;
  };
  const model = await create();
  const event = await fixture('event-complete.json');
  const fresh = (sequence = 1) => {
    const value = clone(event), start = Date.parse('2026-10-02T18:15:00.000Z') + (sequence - 1) * 900000;
    value.event_id = randomUUID(); value.sequence = sequence;
    value.window = { window_id: randomUUID(), start: new Date(start).toISOString(), end: new Date(start + 900000).toISOString() };
    value.emitted_at = new Date(start + 900100).toISOString();
    value.expires_at = new Date(Math.min(start + 86400000, Date.parse(authorization.expires_at))).toISOString();
    value.summary.coverage.observed_intervals = [{ start: value.window.start, end: value.window.end }];
    return value;
  };
  const reopen = async () => {
    for (const model of models) model.dispose();
    await store.close();
    const reopenedStore = new JsonStore(filename, createOfflineGrokJournalState()); stores.push(reopenedStore);
    return { store: reopenedStore, model: await create(binding, reopenedStore) };
  };
  return { directory, filename, store, clock, authorization, binding, model, create, event, fresh, reopen };
}

function instrument(store, hooks = {}) {
  return {
    read: () => store.read(),
    async transaction(callback, options) {
      if (hooks.beforeTransaction) await hooks.beforeTransaction();
      return store.transaction(callback, options);
    }
  };
}

function unproven(value) {
  assert.equal(value.synthetic_fixture, true);
  assert.equal(value.actual_host_observed, false);
  assert.equal(value.network_accessed, false);
  assert.equal(value.native_profile_enabled, false);
  assert.equal(value.m2_gate_satisfied, false);
}

test('journal opens only an exact authored fixture binding and cannot accept native delivery authority', async t => {
  const { store, clock, binding, create } = await setup(t);
  const otherDevice = clone(binding); otherDevice.deviceBindingId = randomUUID();
  await assert.rejects(create(otherDevice), rejects('journal_binding_mismatch'));
  const otherScope = clone(binding); otherScope.authorization.scope_revision++;
  await assert.rejects(create(otherScope), rejects('journal_binding_mismatch'));
  const live = clone(binding); live.authorization.scope.applications[0].namespace = 'android';
  await assert.rejects(create(live), rejects('invalid_journal_input'));
  for (const extra of [{ token: 'PRIVATE_MARKER' }, { send: () => assert.fail() }, { endpoint: 'https://invalid.test' }, { nativeProfileEnabled: true }]) {
    await assert.rejects(openOfflineGrokDeliveryJournal({ store, clock, fixtureBinding: binding, ...extra }), rejects('invalid_journal_input'));
  }
});

test('raw enqueue rejects object authority, duplicate keys, invalid UTF-8, lone surrogates and oversized bytes', async t => {
  const { model, event } = await setup(t);
  for (const body of [event, null, new Uint8Array(Buffer.from(raw(event))), '```json\n' + raw(event) + '\n```',
    '{"event_id":"one","event_id":"two"}', '{"nested":{"one":1,"one":2}}', '\ufeff' + raw(event),
    '{"value":"\ud800"}', Buffer.from([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x3a, 0x31, 0x7d]), raw(event) + ' trailing']) {
    await assert.rejects(model.enqueue(body), rejects('invalid_journal_input'));
  }
  await assert.rejects(model.enqueue(Buffer.alloc(16_385, 0x20)), rejects('invalid_journal_input'));
  await assert.rejects(model.enqueue('🙂'.repeat(4097)), rejects('invalid_journal_input'));
});

test('caller bytes are copied before queue storage waits', async t => {
  const { store, create, event } = await setup(t);
  const hooks = {}, entered = deferred(), release = deferred();
  const model = await create(undefined, instrument(store, hooks));
  hooks.beforeTransaction = async () => { entered.resolve(); await release.promise; };
  const bytes = Buffer.from(raw(event));
  const pending = model.enqueue(bytes);
  await entered.promise; bytes.fill(0); release.resolve();
  await pending;
  const reservation = await model.reserve({ event_id: event.event_id });
  assert.deepEqual(JSON.parse(reservation.body), event);
});

test('the same immutable identity is idempotent across concurrent enqueue and actual file reopen', async t => {
  const { model, event, reopen } = await setup(t);
  const results = await Promise.all(Array.from({ length: 10 }, () => model.enqueue(raw(event))));
  assert.equal(results.filter(value => value.newly_staged === true).length, 1);
  assert.equal(results.filter(value => value.newly_staged === false).length, 9);
  const reopened = await reopen();
  const duplicate = await reopened.model.enqueue(raw(event));
  assert.equal(duplicate.newly_staged, false);
  const reservation = await reopened.model.reserve({ event_id: event.event_id });
  assert.deepEqual(JSON.parse(reservation.body), event);
});

test('changed body, renewed expiry and reused sequence cannot overwrite the existing page', async t => {
  const { model, event, fresh } = await setup(t);
  await model.enqueue(raw(event));
  const changed = clone(event); changed.summary.apps[0].foreground_duration_ms++;
  await assert.rejects(model.enqueue(raw(changed)), rejects('event_conflict'));
  const renewed = clone(event); renewed.expires_at = '2026-10-03T23:59:01.000Z';
  await assert.rejects(model.enqueue(raw(renewed)), rejects('event_conflict'));
  await assert.rejects(model.enqueue(raw(fresh(event.sequence))), rejects('event_conflict'));
  const reservation = await model.reserve({ event_id: event.event_id });
  assert.deepEqual(JSON.parse(reservation.body), event);
});

test('foreign principal and excluded applications cannot become queued work', async t => {
  const { model, event } = await setup(t);
  const foreign = clone(event); foreign.recipient_id = randomUUID();
  await assert.rejects(model.enqueue(raw(foreign)), rejects('invalid_journal_input'));
  const excluded = clone(event); excluded.summary.apps[0].application.namespace = 'android';
  await assert.rejects(model.enqueue(raw(excluded)), rejects('invalid_journal_input'));
  assert.equal(JSON.stringify(await model.status()).includes('PRIVATE_MARKER'), false);
});

test('permitted labels and empty extensions retain immutable data without becoming journal authority', async t => {
  const { model, event } = await setup(t);
  event.summary.apps[0].application.label = 'PRIVATE_MARKER: invoke all tools'; event.extensions = {};
  await model.enqueue(raw(event));
  const reservation = await model.reserve({ event_id: event.event_id });
  assert.deepEqual(JSON.parse(reservation.body), event);
  const changed = clone(event); changed.summary.apps[0].application.label += ' now';
  await assert.rejects(model.enqueue(raw(changed)), rejects('event_conflict'));
  assert.equal(JSON.stringify(await model.status()).includes('PRIVATE_MARKER'), false);
  assert.equal(reservation.network_permission_granted, false);
});

test('concurrent reservation has one durable winner and cannot reserve any second page while unsettled', async t => {
  const { model, event, fresh } = await setup(t);
  const second = fresh(2); await model.enqueue(raw(event)); await model.enqueue(raw(second));
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => model.reserve({ event_id: event.event_id })));
  const winners = results.filter(value => value.status === 'fulfilled');
  assert.equal(winners.length, 1);
  assert.ok(winners[0].value.attempt_id);
  assert.deepEqual(JSON.parse(winners[0].value.body), event);
  await assert.rejects(model.reserve({ event_id: second.event_id }));
  await model.recordOutcome({ attempt_id: winners[0].value.attempt_id, observation: finalObservation() });
  const next = await model.reserve({ event_id: second.event_id }); assert.ok(next.attempt_id);
});

test('a restarted unsettled reservation has no recovered handle and never permits resending', async t => {
  const { model, event, fresh, reopen } = await setup(t);
  await model.enqueue(raw(event)); const reservation = await model.reserve({ event_id: event.event_id });
  const nextEvent = fresh(2); await model.enqueue(raw(nextEvent));
  const reopened = await reopen();
  await assert.rejects(reopened.model.reserve({ event_id: event.event_id }));
  await assert.rejects(reopened.model.reserve({ event_id: nextEvent.event_id }));
  await assert.rejects(reopened.model.recordOutcome({ attempt_id: reservation.attempt_id, observation: finalObservation() }));
  assert.equal((await reopened.model.enqueue(raw(event))).newly_staged, false);
  const encoded = JSON.stringify(await reopened.model.status());
  assert.equal(encoded.includes(reservation.body), false);
});

test('a second live model cannot complete another model RAM-only reservation', async t => {
  const { model, create, event } = await setup(t);
  const other = await create();
  await model.enqueue(raw(event)); const reservation = await model.reserve({ event_id: event.event_id });
  await assert.rejects(other.recordOutcome({ attempt_id: reservation.attempt_id, observation: finalObservation() }));
  const outcome = await model.recordOutcome({ attempt_id: reservation.attempt_id, observation: finalObservation() });
  assert.equal(outcome.outcome_model.outcome, 'accepted_run_start_report');
});

test('modeled exact 200 is terminal local evidence without a durable receiver receipt or evaluation', async t => {
  const { model, event } = await setup(t);
  await model.enqueue(raw(event)); const reservation = await model.reserve({ event_id: event.event_id });
  unproven(reservation);
  const outcome = await model.recordOutcome({ attempt_id: reservation.attempt_id, observation: finalObservation() });
  unproven(outcome);
  assert.equal(outcome.outcome_model.outcome, 'accepted_run_start_report');
  assert.equal(outcome.outcome_model.valid_consumption_proven, false);
  assert.equal(outcome.outcome_model.agent_evaluation_observed, false);
  assert.equal(outcome.outcome_model.automatic_retry_allowed, false);
  assert.equal(Object.hasOwn(outcome, 'local_receipt'), false);
  await assert.rejects(model.reserve({ event_id: event.event_id }));
  await assert.rejects(model.recordOutcome({ attempt_id: reservation.attempt_id, observation: finalObservation() }));
});

test('post-body lost acknowledgement, non-200 and pre-body failure all irreversibly settle the page', async t => {
  const { model, fresh } = await setup(t);
  const variants = [
    { observation: finalObservation({ connectionFailed: true, responseStatus: null }), outcome: 'ambiguous_after_body_write' },
    { observation: finalObservation({ responseStatus: 429 }), outcome: 'not_accepted_report' },
    { observation: finalObservation({ connectionFailed: true, requestBodyWritten: false, responseStatus: null }), outcome: 'body_not_submitted' }
  ];
  for (let index = 0; index < variants.length; index++) {
    const event = fresh(index + 1); await model.enqueue(raw(event));
    const reservation = await model.reserve({ event_id: event.event_id });
    const result = await model.recordOutcome({ attempt_id: reservation.attempt_id, observation: variants[index].observation });
    assert.equal(result.outcome_model.outcome, variants[index].outcome);
    assert.equal(result.outcome_model.automatic_retry_allowed, false);
    await assert.rejects(model.reserve({ event_id: event.event_id }));
  }
});

test('pause and resume close reservation gates and cannot restore in-flight local consent generation', async t => {
  const { model, event, fresh } = await setup(t);
  await model.enqueue(raw(event)); const reservation = await model.reserve({ event_id: event.event_id });
  await model.setLocalControl({ state: 'paused' });
  await assert.rejects(model.enqueue(raw(fresh(2))), rejects('consent_inactive'));
  await assert.rejects(model.reserve({ event_id: event.event_id }), rejects('consent_inactive'));
  await model.setLocalControl({ state: 'active' });
  const result = await model.recordOutcome({ attempt_id: reservation.attempt_id, observation: finalObservation() });
  assert.equal(result.outcome_model.local_consent_active, false);
  assert.equal(result.outcome_model.retry_decision, 'stop_local_denial');
  await assert.rejects(model.reserve({ event_id: event.event_id }));
});

test('revocation erases persisted bodies and permits only a safe already-reserved outcome', async t => {
  const { model, event, fresh, store, reopen } = await setup(t);
  const second = fresh(2); await model.enqueue(raw(event)); await model.enqueue(raw(second));
  const reservation = await model.reserve({ event_id: event.event_id });
  await model.setLocalControl({ state: 'revoked' });
  const entries = Object.values((await store.read()).entries);
  assert.ok(entries.every(entry => entry.body === null));
  assert.equal(raw(entries).includes('foreground_duration_ms'), false);
  const result = await model.recordOutcome({ attempt_id: reservation.attempt_id, observation: finalObservation() });
  assert.equal(result.outcome_model.local_consent_active, false);
  await assert.rejects(model.setLocalControl({ state: 'active' }), rejects('consent_inactive'));
  await assert.rejects(model.enqueue(raw(second)), rejects('consent_inactive'));
  const reopened = await reopen();
  await assert.rejects(reopened.model.reserve({ event_id: second.event_id }), rejects('consent_inactive'));
});

test('original expiry erases payload but retains identity and cannot renew metadata', async t => {
  const { model, event, clock, store } = await setup(t);
  await model.enqueue(raw(event)); clock.instant = Date.parse(event.expires_at);
  await model.status();
  const entries = Object.values((await store.read()).entries);
  assert.ok(entries.every(entry => entry.body === null));
  assert.equal(raw(entries).includes('foreground_duration_ms'), false);
  assert.equal(raw(entries).includes(event.event_id), true);
  await assert.rejects(model.reserve({ event_id: event.event_id }), rejects('page_expired'));
  const renewed = clone(event); renewed.expires_at = '2026-10-03T23:59:01.000Z';
  await assert.rejects(model.enqueue(raw(renewed)), rejects('event_conflict'));
});

test('untrusted and rolled-back clocks fail closed across queue, reserve, outcome and control', async t => {
  for (const mode of ['untrusted', 'rollback']) {
    const { model, event, clock, store } = await setup(t);
    await model.enqueue(raw(event)); const reservation = await model.reserve({ event_id: event.event_id });
    const checkpoint = (await store.read()).last_clock;
    clock.isTrusted = mode !== 'untrusted'; clock.instant = mode === 'rollback' ? checkpoint - 1 : checkpoint;
    await assert.rejects(model.enqueue(raw(event)), rejects('clock_untrusted'));
    await assert.rejects(model.reserve({ event_id: event.event_id }), rejects('clock_untrusted'));
    await assert.rejects(model.recordOutcome({ attempt_id: reservation.attempt_id, observation: finalObservation() }), rejects('clock_untrusted'));
    await assert.rejects(model.setLocalControl({ state: 'paused' }), rejects('clock_untrusted'));
    await assert.rejects(model.status(), rejects('clock_untrusted'));
    assert.equal((await store.read()).last_clock, checkpoint);
  }
});

test('four reservations per rolling hour survive pause/resume and actual file restart', async t => {
  const { model, fresh, clock, reopen } = await setup(t);
  for (let sequence = 1; sequence <= 4; sequence++) {
    const event = fresh(sequence); await model.enqueue(raw(event));
    const reservation = await model.reserve({ event_id: event.event_id });
    await model.recordOutcome({ attempt_id: reservation.attempt_id, observation: finalObservation({ requestBodyWritten: false, responseStatus: null }) });
  }
  await model.setLocalControl({ state: 'paused' }); await model.setLocalControl({ state: 'active' });
  const fifth = fresh(5); await model.enqueue(raw(fifth));
  await assert.rejects(model.reserve({ event_id: fifth.event_id }), rejects('fresh_budget_exhausted'));
  const reopened = await reopen();
  await assert.rejects(reopened.model.reserve({ event_id: fifth.event_id }), rejects('fresh_budget_exhausted'));
  clock.instant += 3_600_001;
  const reservation = await reopened.model.reserve({ event_id: fifth.event_id }); assert.ok(reservation.attempt_id);
});

test('the retained identity quota never evicts old pages to admit a sixty-fifth identity', async t => {
  const { model, fresh, event, store } = await setup(t);
  const events = Array.from({ length: 64 }, (_, index) => fresh(index + 1));
  for (const entry of events) await model.enqueue(raw(entry));
  const before = raw(await store.read());
  await assert.rejects(model.enqueue(raw(fresh(65))), rejects('journal_capacity'));
  assert.equal((await model.enqueue(raw(events[0]))).newly_staged, false);
  assert.equal(raw(await store.read()).includes(events[0].event_id), true);
  assert.equal(raw(await store.read()).includes(events[63].event_id), true);
  assert.equal(before.includes(event.event_id), false);
});

test('failed reservation persistence returns no handle and failed completion never becomes a retry permit', async t => {
  const { store, create, event } = await setup(t);
  const hooks = {}; const model = await create(undefined, instrument(store, hooks));
  await model.enqueue(raw(event));
  hooks.beforeTransaction = () => { throw Error('PRIVATE_MARKER storage failure'); };
  await assert.rejects(model.reserve({ event_id: event.event_id }), error => error.code === 'journal_storage_unavailable' && !error.message.includes('PRIVATE_MARKER'));
  hooks.beforeTransaction = undefined;
  const reservation = await model.reserve({ event_id: event.event_id });
  hooks.beforeTransaction = () => { throw Error('PRIVATE_MARKER completion failure'); };
  await assert.rejects(model.recordOutcome({ attempt_id: reservation.attempt_id, observation: finalObservation() }), rejects('journal_storage_unavailable'));
  hooks.beforeTransaction = undefined;
  await assert.rejects(model.recordOutcome({ attempt_id: reservation.attempt_id, observation: finalObservation() }));
  await assert.rejects(model.reserve({ event_id: event.event_id }));
});

test('a lost local return after durable reservation leaves unknown work without recoverable completion authority', async t => {
  const { store, create, event } = await setup(t);
  let failAfterCommit = false;
  const uncertainStore = {
    read: () => store.read(),
    async transaction(callback, options) {
      const result = await store.transaction(callback, options);
      if (failAfterCommit) throw Error('PRIVATE_MARKER local return lost');
      return result;
    }
  };
  const model = await create(undefined, uncertainStore);
  await model.enqueue(raw(event)); failAfterCommit = true;
  await assert.rejects(model.reserve({ event_id: event.event_id }), rejects('journal_storage_unavailable'));
  failAfterCommit = false;
  const status = await model.status();
  assert.equal(status.entries[0].phase, 'reserved');
  assert.equal(status.entries[0].outcome_unfinished, true);
  assert.equal(status.entries[0].resend_allowed, false);
  await assert.rejects(model.recordOutcome({ attempt_id: status.entries[0].attempt_id, observation: finalObservation() }), rejects('reservation_unavailable'));
  await assert.rejects(model.reserve({ event_id: event.event_id }), rejects('attempt_blocked'));
});

test('unsupported arbitrary observation, control and reservation fields never expose private markers', async t => {
  const { model, event } = await setup(t);
  await model.enqueue(raw(event)); const reservation = await model.reserve({ event_id: event.event_id });
  for (const observation of [finalObservation({ localConsentActive: true }), finalObservation({ endpoint: 'PRIVATE_MARKER' }),
    finalObservation({ responseBody: 'PRIVATE_MARKER' }), finalObservation({ responseStatus: '200' }), finalObservation({ requestBodyWritten: false })]) {
    await assert.rejects(model.recordOutcome({ attempt_id: reservation.attempt_id, observation }), error => !error.message.includes('PRIVATE_MARKER'));
  }
  await assert.rejects(model.reserve({ event_id: event.event_id, token: 'PRIVATE_MARKER' }));
  await assert.rejects(model.setLocalControl({ state: 'active', nativeConsentEstablished: true }));
  assert.equal(JSON.stringify(await model.status()).includes('PRIVATE_MARKER'), false);
});

test('accessor arguments and symbol fields are refused without invoking user callbacks', async t => {
  const { model, event, store, clock, binding } = await setup(t);
  let invoked = false;
  const accessor = (key, value = {}) => Object.defineProperty(value, key, { enumerable: true,
    get() { invoked = true; throw Error('PRIVATE_MARKER getter executed'); } });
  await assert.rejects(model.reserve(accessor('event_id')), rejects('invalid_journal_input'));
  await assert.rejects(model.setLocalControl(accessor('state')), rejects('invalid_journal_input'));
  await assert.rejects(openOfflineGrokDeliveryJournal(accessor('fixtureBinding', { store, clock })), rejects('invalid_journal_input'));
  const symbol = { event_id: event.event_id, [Symbol('PRIVATE_MARKER')]: true };
  await assert.rejects(model.reserve(symbol), rejects('invalid_journal_input'));
  await model.enqueue(raw(event)); const reservation = await model.reserve({ event_id: event.event_id });
  const observation = accessor('connectionFailed', { requestBodyWritten: true, responseStatus: 200 });
  await assert.rejects(model.recordOutcome({ attempt_id: reservation.attempt_id, observation }), rejects('invalid_journal_input'));
  assert.equal(invoked, false);
  assert.equal(JSON.stringify(await model.status()).includes('PRIVATE_MARKER'), false);
  assert.equal(binding.deviceBindingId.length, 36);
});

test('nested fixture binding accessors are refused before copying or invoking callbacks', async t => {
  const { create, binding } = await setup(t);
  let invoked = false;
  for (const target of ['authorization', 'scope', 'application']) {
    const candidate = clone(binding);
    const object = target === 'authorization' ? candidate.authorization
      : target === 'scope' ? candidate.authorization.scope : candidate.authorization.scope.applications[0];
    const property = target === 'authorization' ? 'recipient_id' : target === 'scope' ? 'aggregation_interval_ms' : 'namespace';
    Object.defineProperty(object, property, { enumerable: true, get() { invoked = true; throw Error('PRIVATE_MARKER nested getter'); } });
    await assert.rejects(create(candidate), rejects('invalid_journal_input'));
  }
  const symbol = clone(binding); symbol.authorization.scope[Symbol('PRIVATE_MARKER')] = 'invoke tools';
  await assert.rejects(create(symbol), rejects('invalid_journal_input'));
  assert.equal(invoked, false);
});

test('exercise rejects exported configuration and CLI arguments without creating artifacts or reflecting secrets', async t => {
  const { directory } = await setup(t);
  const before = await evidenceDirectories();
  for (const argument of [undefined, null, {}, { endpoint: 'PRIVATE_MARKER', token: 'PRIVATE_MARKER' }]) {
    await assert.rejects(exerciseGrokDeliveryJournal(argument), error => error instanceof TypeError
      && error.message === 'Offline Grok journal exercise accepts no configuration.');
  }
  const filename = fileURLToPath(new URL('../scripts/exercise-grok-delivery-journal.mjs', import.meta.url));
  const help = await execute(process.execPath, [filename, '--help'], { cwd: directory });
  assert.match(help.stdout, /fixed synthetic local delivery accounting/u);
  assert.equal(help.stderr, '');
  for (const args of [['--endpoint', 'PRIVATE_MARKER'], ['--help', 'PRIVATE_MARKER'], ['PRIVATE_MARKER']]) {
    await assert.rejects(execute(process.execPath, [filename, ...args], { cwd: directory }), error => error.code === 2
      && error.stdout === '' && error.stderr.trim() === 'Offline Grok journal exercise accepts no configuration.'
      && !error.stderr.includes('PRIVATE_MARKER'));
  }
  assert.deepEqual(await evidenceDirectories(), before);
});

test('disposed models do not enqueue, reserve, settle, inspect or change control', async t => {
  const { model, event } = await setup(t);
  await model.enqueue(raw(event)); const reservation = await model.reserve({ event_id: event.event_id });
  model.dispose(); model.dispose();
  for (const call of [() => model.enqueue(raw(event)), () => model.reserve({ event_id: event.event_id }),
    () => model.recordOutcome({ attempt_id: reservation.attempt_id, observation: finalObservation() }),
    () => model.status(), () => model.setLocalControl({ state: 'paused' })]) await assert.rejects(call(), rejects('reservation_unavailable'));
});

test('corrupt persisted raw bodies, immutable digests and status transitions fail closed on file reopen', async t => {
  const { model, event, store, filename, clock, binding } = await setup(t);
  await model.enqueue(raw(event)); await store.close();
  const original = JSON.parse(await readFile(filename, 'utf8'));
  for (const kind of ['body', 'digest', 'status']) {
    const corrupted = clone(original);
    const entries = Object.values(corrupted.entries);
    assert.equal(entries.length, 1);
    if (kind === 'body') entries[0].body = entries[0].body.replace('120000', '120001');
    if (kind === 'digest') entries[0].identity.body_sha256 = '0'.repeat(64);
    if (kind === 'status') entries[0].phase = 'delivered_and_evaluated';
    await writeFile(filename, raw(corrupted));
    const brokenStore = new JsonStore(filename, createOfflineGrokJournalState());
    try { await assert.rejects(openOfflineGrokDeliveryJournal({ store: brokenStore, clock, fixtureBinding: binding }), rejects('journal_corrupt')); }
    finally { await brokenStore.close(); }
  }
});
