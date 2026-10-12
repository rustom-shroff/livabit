// Fixed authored local exercise. No configuration, provider credentials, network or agent invocation.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { ManualClock } from '../src/clock.mjs';
import { JsonStore } from '../src/storage.mjs';
import { createReceiverState } from '../src/receiver.mjs';
import { canonical, digest } from '../src/protocol.mjs';
import { createSyntheticWebhookProbeEvent } from '../src/experimental/grok-webhook-probe.mjs';
import { createOfflineGrokJournalState } from '../src/experimental/grok-delivery-journal.mjs';
import { openOfflineGrokSyntheticSender } from '../src/experimental/grok-journaled-sender.mjs';

const PROJECT = fileURLToPath(new URL('../', import.meta.url));
const NOW = Date.parse('2026-10-08T15:00:00.000Z');
const iso = value => new Date(value).toISOString();
const code = expected => error => error?.code === expected;
function page(base, sequence, end, now) {
  const event = structuredClone(base);
  event.event_id = randomUUID(); event.sequence = sequence; event.window.window_id = randomUUID();
  event.window.start = iso(end - 900_000); event.window.end = iso(end);
  event.emitted_at = iso(now); event.expires_at = iso(now + 900_000);
  event.summary.coverage.observed_intervals = [{ start: event.window.start, end: event.window.end }];
  return event;
}
async function waitForConsumption(store, eventId) {
  for (let index = 0; index < 200; index++) {
    if (Object.values((await store.read()).ledger).some(entry => entry.event_id === eventId)) return;
    await delay(5);
  }
  throw new Error('Owned fixture did not finish local consumption.');
}

export async function exerciseGrokJournaledSender(...args) {
  if (args.length) throw new TypeError('Offline Grok sender exercise accepts no configuration.');
  const parent = path.join(PROJECT, 'artifacts', 'grok-journaled-sender');
  const directory = path.join(parent, `run-${randomUUID()}`);
  await mkdir(parent, { recursive: true }); await mkdir(directory);
  const journalFilename = path.join(directory, 'fixture-journal-state.json');
  const receiverFilename = path.join(directory, 'fixture-receiver-state.json');
  const clock = new ManualClock(NOW), base = createSyntheticWebhookProbeEvent(NOW);
  const fixtureBinding = { deviceBindingId: randomUUID(), token: randomBytes(32).toString('hex'), authorization: {
    recipient_id: base.recipient_id, stream_id: base.stream_id, subscription_id: base.subscription_id,
    scope_revision: 1, expires_at: iso(NOW + 86_400_000), scope: {
      applications: base.summary.apps.map(app => structuredClone(app.application)),
      allowed_fields: ['foreground_duration_ms'], event_names: ['activity.summary'],
      aggregation_interval_ms: 900_000, history_max_age_ms: 86_400_000, history_max_bytes: 4_194_304 } } };
  let journalStore, receiverStore, sender;
  const open = async () => {
    journalStore = new JsonStore(journalFilename, createOfflineGrokJournalState());
    receiverStore = new JsonStore(receiverFilename, createReceiverState());
    sender = await openOfflineGrokSyntheticSender({ journalStore, receiverStore, clock, fixtureBinding });
  };
  await open();
  const checks = [], outcomes = [], views = {};
  const send = (event, scenario) => sender.sendOne({ event_id: event.event_id, scenario, timeoutMs: 5000 });
  try {
    const first = Array.from({ length: 5 }, (_, index) => page(base, index + 1, NOW - (4 - index) * 900_000, NOW));
    for (const event of first) await sender.stage(canonical(event));
    const scenarios = ['accept_and_consume', 'accept_without_consumption', 'consume_then_lose_response'];
    for (let index = 0; index < scenarios.length; index++) {
      const result = await send(first[index], scenarios[index]);
      assert.equal(result.body_sha256, digest(canonical(first[index])));
      assert.equal(result.original_expires_at, first[index].expires_at);
      assert.equal(result.native_valid_consumption_proven, false);
      assert.equal(result.network_accessed, false); outcomes.push(result);
    }
    checks.push('exact_immutable_body_and_original_deadline_used');
    assert.deepEqual(outcomes.map(result => result.journal_outcome.phase),
      ['accepted_run_start_report', 'accepted_run_start_report', 'ambiguous_after_body_write']);
    assert.deepEqual(outcomes.map(result => result.fixture_receiver.local_validated_durable_consumption), [true, false, true]);
    checks.push('run_start_report_and_durable_local_consumption_are_distinct');
    const held = send(first[3], 'hold_after_consumption');
    held.catch(() => {}); // Install handling before any separate fixture assertion can fail.
    await waitForConsumption(receiverStore, first[3].event_id);
    await sender.setLocalControl({ state: 'paused' });
    const heldResult = await held; outcomes.push(heldResult);
    assert.equal(heldResult.fixture_body_submission_attempted, true);
    assert.equal(heldResult.journal_outcome.phase, 'ambiguous_after_body_write');
    await sender.setLocalControl({ state: 'active' });
    await assert.rejects(send(first[3], 'accept_and_consume'), code('reservation_failed'));
    checks.push('pause_does_not_recall_consumption_or_authorize_resend_after_resume');
    await assert.rejects(send(first[4], 'accept_and_consume'), code('reservation_failed'));
    assert.equal((await sender.status()).fresh_reservations_in_hour, 4);
    checks.push('persisted_four_attempt_hour_budget_is_shared_by_scenarios');
    views.first_hour = await sender.status();

    clock.advance(3_600_001);
    const next = Array.from({ length: 4 }, (_, index) => page(base, index + 6, NOW + (index + 1) * 900_000, clock.now()));
    for (const event of next) await sender.stage(canonical(event));
    const secondScenarios = ['fail_before_body', 'throw_after_body', 'reject_401'];
    const second = [];
    for (let index = 0; index < secondScenarios.length; index++) {
      const result = await send(next[index], secondScenarios[index]); second.push(result); outcomes.push(result);
    }
    assert.deepEqual(second.map(result => result.journal_outcome.phase),
      ['body_not_submitted', 'ambiguous_after_body_write', 'not_accepted_report']);
    assert.deepEqual(second.map(result => result.fixture_body_submission_attempted), [false, true, true]);
    assert.ok(second.every(result => result.fixture_receiver.local_validated_durable_consumption === false));
    checks.push('before_body_failure_partial_submission_and_received_rejection_stay_separate');
    const interrupted = send(next[3], 'hold_after_consumption');
    interrupted.catch(() => {});
    // Observe a durable final consumer copy before retiring its sender; no speculative receipt.
    await waitForConsumption(receiverStore, next[3].event_id);
    sender.dispose();
    await assert.rejects(interrupted, error => error?.code === 'outcome_commit_failed'
      && error.fixture_body_submission_attempted === true);
    await Promise.all([journalStore.close(), receiverStore.close()]);
    await open();
    views.restarted = await sender.status();
    const unfinished = views.restarted.entries.find(entry => entry.event_id === next[3].event_id);
    assert.equal(unfinished.outcome_unfinished, true); assert.equal(unfinished.remote_side_effect_possible, true);
    await assert.rejects(send(next[3], 'accept_and_consume'), code('reservation_failed'));
    assert.ok(Object.values((await receiverStore.read()).ledger).some(entry => entry.event_id === next[3].event_id));
    checks.push('restart_keeps_unfinished_reservation_held_and_retains_local_consumption');
    views.receiver = await sender.inspectReceiver();
    assert.equal(views.receiver.skill_invoked, false);
    assert.ok(views.receiver.windows.some(window => window.pages.some(entry => entry.event_id === next[3].event_id)));
    checks.push('final_receiver_observation_is_separate_from_missing_sender_outcome');
    await sender.setLocalControl({ state: 'revoked' }); views.revoked = await sender.status();
    assert.ok(views.revoked.entries.every(entry => entry.body_retained === false));
    assert.ok(Object.values((await receiverStore.read()).ledger).some(entry => entry.event_id === next[3].event_id));
    checks.push('sender_revocation_purges_journal_bodies_without_erasing_admitted_copies');
    assert.ok(outcomes.every(result => result.automatic_retry_allowed === false));
    checks.push('no_scenario_enables_network_profile_retry_or_evaluation');
    const report = { target: 'grok-bot', evidence_kind: 'offline_grok_journaled_sender_exercise',
      generated_at: iso(Date.now()), simulated_at: iso(NOW), node: process.version,
      checks_passed: checks.length, checks, outcomes, views,
      synthetic_fixture: true, virtual_wire_only: true, network_accessed: false,
      account_accessed: false, real_credential_used: false, personal_activity_used: false,
      actual_host_observed: false, native_profile_enabled: false, frozen_probe_integrated: false,
      native_valid_consumption_proven: false, model_invoked: false, skill_invoked: false,
      intermediary_created: false, automatic_retry_allowed: false, m2_gate_satisfied: false,
      single_owner_store_only: true, power_loss_survival_proven: false };
    await writeFile(path.join(directory, 'exercise.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return { target: report.target, evidence_kind: report.evidence_kind, checks_passed: checks.length,
      run_directory: directory, network_accessed: false, native_profile_enabled: false, m2_gate_satisfied: false };
  } finally {
    sender?.dispose(); await Promise.all([journalStore?.close(), receiverStore?.close()]);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('node scripts/exercise-grok-journaled-sender.mjs\nExercises fixed authored local submission scenarios and writes a new evidence folder. No configuration, provider credentials, network, account, native profile or agent evaluation.');
  } else if (args.length) {
    console.error('Offline Grok sender exercise accepts no configuration.'); process.exitCode = 2;
  } else {
    try { console.log(JSON.stringify(await exerciseGrokJournaledSender())); }
    catch { console.error('The offline Grok sender exercise could not complete.'); process.exitCode = 1; }
  }
}
