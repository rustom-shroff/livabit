// Fixed authored local exercise; no credentials, destination, dispatch or provider access.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ManualClock } from '../src/clock.mjs';
import { JsonStore } from '../src/storage.mjs';
import { canonical } from '../src/protocol.mjs';
import { createSyntheticWebhookProbeEvent } from '../src/experimental/grok-webhook-probe.mjs';
import { createOfflineGrokJournalState, openOfflineGrokDeliveryJournal } from '../src/experimental/grok-delivery-journal.mjs';

const PROJECT = fileURLToPath(new URL('../', import.meta.url));
const NOW = Date.parse('2026-10-08T15:00:00.000Z');
const iso = value => new Date(value).toISOString();
const code = value => error => error?.code === value;
function page(base, sequence, end, now) {
  const event = structuredClone(base);
  event.event_id = randomUUID(); event.sequence = sequence; event.window.window_id = randomUUID();
  event.window.start = iso(end - 900_000); event.window.end = iso(end);
  event.emitted_at = iso(now); event.expires_at = iso(now + 900_000);
  event.summary.coverage.observed_intervals = [{ start: event.window.start, end: event.window.end }];
  return event;
}

export async function exerciseGrokDeliveryJournal(...args) {
  if (args.length) throw new TypeError('Offline Grok journal exercise accepts no configuration.');
  const parent = path.join(PROJECT, 'artifacts', 'grok-delivery-journal');
  const directory = path.join(parent, `run-${randomUUID()}`);
  await mkdir(parent, { recursive: true }); await mkdir(directory);
  const filename = path.join(directory, 'fixture-journal-state.json');
  const clock = new ManualClock(NOW);
  const base = createSyntheticWebhookProbeEvent(NOW);
  const fixtureBinding = { deviceBindingId: randomUUID(), authorization: {
    recipient_id: base.recipient_id, stream_id: base.stream_id, subscription_id: base.subscription_id,
    scope_revision: 1, expires_at: iso(NOW + 86_400_000), scope: {
      applications: base.summary.apps.map(app => structuredClone(app.application)),
      allowed_fields: ['foreground_duration_ms'], event_names: ['activity.summary'],
      aggregation_interval_ms: 900_000, history_max_age_ms: 86_400_000, history_max_bytes: 4_194_304 } } };
  let store = new JsonStore(filename, createOfflineGrokJournalState());
  let journal = await openOfflineGrokDeliveryJournal({ store, clock, fixtureBinding });
  const checks = [], outcomes = [];
  try {
    const events = Array.from({ length: 5 }, (_, index) => page(base, index + 1, NOW - (4 - index) * 900_000, NOW));
    for (const event of events) await journal.enqueue(canonical(event));
    assert.equal((await journal.enqueue(JSON.stringify(events[0], null, 2))).newly_staged, false);
    checks.push('canonical_identity_is_unchanged_by_representation');
    const changed = structuredClone(events[0]); changed.summary.apps[0].foreground_duration_ms++;
    await assert.rejects(journal.enqueue(canonical(changed)), code('event_conflict'));
    checks.push('changed_immutable_body_rejected');
    for (let index = 0; index < 4; index++) {
      const reservation = await journal.reserve({ event_id: events[index].event_id });
      assert.equal(reservation.body, canonical(events[index]));
      assert.equal(reservation.network_permission_granted, false);
      await assert.rejects(journal.reserve({ event_id: events[index].event_id }), code('attempt_blocked'));
      const observation = index === 0 ? { connectionFailed: false, requestBodyWritten: true, responseStatus: 200 }
        : index === 1 ? { connectionFailed: true, requestBodyWritten: true, responseStatus: null }
        : index === 2 ? { connectionFailed: true, requestBodyWritten: false, responseStatus: null }
        : { connectionFailed: false, requestBodyWritten: true, responseStatus: 503 };
      if (index === 3) {
        await journal.setLocalControl({ state: 'paused' });
        await journal.setLocalControl({ state: 'active' });
      }
      const outcome = await journal.recordOutcome({ attempt_id: reservation.attempt_id, observation });
      outcomes.push(outcome);
      assert.equal(outcome.valid_consumption_proven, false);
      assert.equal(outcome.outcome_model.automatic_retry_allowed, false);
      await assert.rejects(journal.reserve({ event_id: events[index].event_id }), code('attempt_blocked'));
    }
    assert.deepEqual(outcomes.map(outcome => outcome.phase), ['accepted_run_start_report', 'ambiguous_after_body_write',
      'body_not_submitted', 'not_accepted_report']);
    checks.push('each_reserved_page_is_irreversible_and_outcomes_stay_separate');
    assert.equal(outcomes[3].outcome_model.local_consent_active, false);
    checks.push('pause_resume_does_not_renew_an_inflight_reservation_generation');
    await assert.rejects(journal.reserve({ event_id: events[4].event_id }), code('fresh_budget_exhausted'));
    checks.push('four_fresh_reservations_spend_persisted_hour_budget');
    journal.dispose(); await store.close();
    store = new JsonStore(filename, createOfflineGrokJournalState());
    journal = await openOfflineGrokDeliveryJournal({ store, clock, fixtureBinding });
    const restarted = await journal.status();
    assert.equal(restarted.fresh_reservations_in_hour, 4);
    assert.equal(restarted.entries.find(entry => entry.event_id === events[0].event_id).phase, 'accepted_run_start_report');
    checks.push('actual_file_reopen_preserves_terminal_results_and_budget');
    clock.advance(3_600_001);
    await assert.rejects(journal.reserve({ event_id: events[4].event_id }), code('page_expired'));
    const expired = await journal.status();
    assert.ok(expired.entries.every(entry => entry.body_retained === false));
    assert.equal(expired.entries.length, 5);
    await assert.rejects(journal.enqueue(canonical(events[0])), code('page_expired'));
    checks.push('expired_body_cleanup_keeps_identity_without_restaging_or_retiming');
    const next = page(base, 6, NOW + 3_600_000, clock.now());
    await journal.enqueue(canonical(next));
    const interrupted = await journal.reserve({ event_id: next.event_id });
    journal.dispose(); await store.close();
    store = new JsonStore(filename, createOfflineGrokJournalState());
    journal = await openOfflineGrokDeliveryJournal({ store, clock, fixtureBinding });
    await assert.rejects(journal.recordOutcome({ attempt_id: interrupted.attempt_id,
      observation: { connectionFailed: false, requestBodyWritten: true, responseStatus: 200 } }), code('reservation_unavailable'));
    await assert.rejects(journal.reserve({ event_id: next.event_id }), code('attempt_blocked'));
    const unfinished = await journal.status();
    assert.equal(unfinished.entries.find(entry => entry.event_id === next.event_id).outcome_unfinished, true);
    assert.equal(unfinished.entries.find(entry => entry.event_id === next.event_id).remote_side_effect_possible, true);
    checks.push('restart_loses_ephemeral_handle_and_keeps_unfinished_attempt_uncertain');
    await journal.setLocalControl({ state: 'revoked' });
    const revoked = await journal.status();
    assert.ok(revoked.entries.every(entry => entry.body_retained === false));
    await assert.rejects(journal.setLocalControl({ state: 'active' }), code('consent_inactive'));
    checks.push('revocation_clears_bodies_and_cannot_be_reversed_by_reopening_or_resuming');
    const report = { target: 'grok-bot', evidence_kind: 'offline_grok_delivery_journal_exercise',
      generated_at: iso(Date.now()), simulated_at: iso(NOW), node: process.version,
      checks_passed: checks.length, checks, outcomes, views: { restarted, expired, unfinished, revoked },
      synthetic_fixture: true, network_accessed: false, actual_host_observed: false,
      account_accessed: false, real_credential_used: false, personal_activity_used: false,
      native_profile_enabled: false, frozen_probe_integrated: false,
      valid_consumption_proven: false, model_invoked: false, skill_invoked: false,
      intermediary_created: false, m2_gate_satisfied: false,
      single_owner_store_only: true, power_loss_survival_proven: false };
    await writeFile(path.join(directory, 'exercise.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return { target: report.target, evidence_kind: report.evidence_kind, checks_passed: report.checks_passed,
      run_directory: directory, network_accessed: false, native_profile_enabled: false, m2_gate_satisfied: false };
  } finally { journal.dispose(); await store.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('node scripts/exercise-grok-delivery-journal.mjs\nExercises fixed synthetic local delivery accounting and writes a new evidence folder. No configuration, credentials, destination, network, account or dispatch. Not connected to the existing probe or a native publisher.');
  } else if (args.length) {
    console.error('Offline Grok journal exercise accepts no configuration.'); process.exitCode = 2;
  } else {
    try { console.log(JSON.stringify(await exerciseGrokDeliveryJournal())); }
    catch { console.error('The offline Grok journal exercise could not complete.'); process.exitCode = 1; }
  }
}
