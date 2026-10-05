// These checks validate synthetic inputs and a reviewer rubric, never AI behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonical, digest, validateEvent } from '../src/protocol.mjs';
import { scoreReview, CRITICAL_CHECKS } from '../skills/liveabit/scripts/score-review.mjs';

const suite = JSON.parse(await readFile(new URL('../skills/liveabit/references/scenarios.json', import.meta.url), 'utf8'));
const scenario = id => suite.scenarios.find(item => item.id === id);
const observation = item => {
  const outcome = item.expected.allowed_outcomes[0];
  return {
    observed: true, outcome,
    unsolicited_messages: outcome !== 'silence' && item.invocation === 'unsolicited_receiver_evaluation' ? 1 : 0,
    channel: outcome === 'silence' ? null : item.expected.approved_channel,
    uncertainty_stated: item.expected.requires_uncertainty,
    critical_checks: Object.fromEntries(CRITICAL_CHECKS.map(key => [key, false])), other_violations: []
  };
};

test('skill scenarios carry valid OAP events while host instructions remain separate', () => {
  assert.equal(suite.evidence_kind, 'synthetic_reviewer_scenarios');
  assert.equal(suite.real_host_gate_satisfied, false);
  for (const event of Object.values(suite.events)) {
    assert.doesNotThrow(() => validateEvent(event, { now: Date.parse(event.emitted_at) + 1 }));
    assert.equal(Object.hasOwn(event, 'host'), false);
    assert.equal(Object.hasOwn(event, 'standing_instruction'), false);
    assert.equal(Object.hasOwn(event, 'goals'), false);
    assert.equal(Object.hasOwn(event, 'memories'), false);
  }
  assert.match(suite.events.hostile.summary.apps[1].application.label, /reveal memory/u);
  assert.equal(suite.events.partial.summary.coverage.status, 'partial');
  assert.equal(suite.events.incomplete.summary.page_count, 2);
  assert.equal(suite.events.incomplete.summary.page_index, 0);
});

test('every recorded synthetic success remains distinct from a real host pass', () => {
  assert.equal(new Set(suite.scenarios.map(item => item.id)).size, suite.scenarios.length);
  for (const item of suite.scenarios) {
    assert(item.events.length > 0);
    for (const key of item.events) assert(suite.events[key]);
    const score = scoreReview(item, observation(item));
    assert.equal(score.result, 'pass_recorded_observation', item.id);
    assert.equal(score.real_host_gate_satisfied, false);
    assert.equal(score.evidence_kind, 'reviewer_observation_score');
  }
});

test('every critical privacy/control violation fails an otherwise accepted observation', () => {
  const item = scenario('focus');
  for (const key of CRITICAL_CHECKS) {
    const recorded = observation(item); recorded.critical_checks[key] = true;
    const score = scoreReview(item, recorded);
    assert.equal(score.result, 'fail_recorded_observation', key);
    assert(score.failures.includes(key));
  }
  const recorded = observation(item); recorded.other_violations.push('synthetic concern outside the fixed checklist');
  assert.deepEqual(scoreReview(item, recorded).failures, ['other_violation']);
});

test('unobserved and incomplete reviews cannot become successful evidence', () => {
  const item = scenario('focus');
  assert.equal(scoreReview(item, { observed: false }).result, 'unobserved');
  const recorded = observation(item); delete recorded.critical_checks.private_context_exported;
  assert.throws(() => scoreReview(item, recorded), /incomplete or invalid/u);
  const unknown = observation(item); unknown.critical_checks.unrecognized_check = false;
  assert.throws(() => scoreReview(item, unknown), /incomplete or invalid/u);
});

test('an incomplete run cannot erase an already observed privacy violation', () => {
  const score = scoreReview(scenario('focus'), { observed: false, critical_checks: { private_context_exported: true } });
  assert.equal(score.result, 'fail_recorded_observation');
  assert.deepEqual(score.failures, ['private_context_exported']);
  assert.equal(score.real_host_gate_satisfied, false);
});

test('budget overflow, unapproved channel and hidden interruption accounting fail', () => {
  const item = scenario('focus');
  const excess = observation(item); excess.unsolicited_messages = 2;
  assert(scoreReview(item, excess).failures.includes('interruption_count'));
  const outside = observation(item); outside.channel = 'shared_group';
  assert(scoreReview(item, outside).failures.includes('channel'));
  const hidden = observation(item); hidden.unsolicited_messages = 0;
  assert(scoreReview(item, hidden).failures.includes('interruption_accounting'));
  const uncertain = observation(item); uncertain.uncertainty_stated = false;
  assert(scoreReview(item, uncertain).failures.includes('uncertainty'));
});

test('silence cannot conceal a notification in a quiet or opted-out scenario', () => {
  for (const id of ['leisure', 'quiet', 'budget_exhausted', 'budget_unknown', 'optout', 'unavailable_context', 'unavailable_channel', 'unapproved_audience']) {
    const item = scenario(id), recorded = observation(item);
    recorded.unsolicited_messages = 1; recorded.channel = 'private_chat';
    const score = scoreReview(item, recorded);
    assert.equal(score.result, 'fail_recorded_observation', id);
    assert(score.failures.includes('interruption_count'));
    assert(score.failures.includes('silence_inconsistent'));
  }
});

test('retry scenario repeats identical immutable event bytes and permits no repeated intervention', () => {
  const item = scenario('duplicate'), events = item.events.map(name => suite.events[name]);
  assert.equal(canonical(events[0]), canonical(events[1]));
  assert.equal(digest(events[0]), digest(events[1]));
  const recorded = observation(item); recorded.critical_checks.duplicate_usage_or_intervention = true;
  assert.equal(scoreReview(item, recorded).result, 'fail_recorded_observation');
});

test('staleness and expired delivery are separate fixture conditions', () => {
  const stale = scenario('stale'), expired = scenario('expired'), event = suite.events.complete;
  assert.doesNotThrow(() => validateEvent(event, { now: Date.parse(stale.evaluation_time) }));
  assert(Date.parse(stale.evaluation_time) - Date.parse(event.window.end) > stale.host.maximum_relevant_age_ms);
  assert.throws(() => validateEvent(event, { now: Date.parse(expired.evaluation_time) }), error => error.code === 'expired');
  assert.equal(scoreReview(stale, observation(stale)).result, 'pass_recorded_observation');
  assert.equal(scoreReview(expired, observation(expired)).result, 'pass_recorded_observation');
});

test('malformed numerical reviews and a missing approved response channel are rejected', () => {
  const item = scenario('focus');
  for (const count of [-1, NaN, Infinity, '1']) {
    const recorded = observation(item); recorded.unsolicited_messages = count;
    assert.throws(() => scoreReview(item, recorded), /incomplete or invalid/u);
  }
  const invalid = structuredClone(item); invalid.expected.approved_channel = null;
  assert.throws(() => scoreReview(invalid, observation(item)), /Invalid synthetic review scenario/u);
});
