import test from 'node:test';
import assert from 'node:assert/strict';
import { reconstructPackageEvents, SYNTHETIC_OBSERVATION_LIMITS } from '../src/android-observation-model.mjs';
import { aggregateSegments } from '../src/aggregation.mjs';
import { OapError } from '../src/protocol.mjs';

const A = 'org.example.alpha', B = 'org.example.beta';
const interval = (start, end) => ({ start, end });
const edge = (pkg, timestamp, type) => ({ package: pkg, timestamp, type });
const state = (pkg, timestamp, resumed_count) => ({ package: pkg, timestamp, resumed_count });
const approval = (pkg, intervals = [interval(0, 100)]) => ({ package: pkg, intervals });
const input = overrides => ({
  synthetic: true, window: interval(0, 100), approvals: [approval(A)],
  events: [], trustedStates: [state(A, 0, 0)], trustedContinuity: [interval(0, 100)], ...overrides
});
const segment = (pkg, start, end) => ({ package: pkg, start, end });
const duration = (result, pkg) => result.segments.filter(value => value.package === pkg).reduce((sum, value) => sum + value.end - value.start, 0);
const safeFailure = error => error instanceof OapError && ['invalid_request', 'payload_too_large'].includes(error.code) && !error.message.includes('secret');

test('synthetic package union counts overlapping same-package activities once and permits cross-app overlap', () => {
  const result = reconstructPackageEvents(input({
    approvals: [approval(A), approval(B)], trustedStates: [state(A, 0, 0), state(B, 0, 0)],
    events: [edge(A, 10, 'resume'), edge(A, 20, 'resume'), edge(B, 25, 'resume'), edge(A, 40, 'pause'), edge(A, 60, 'pause'), edge(B, 70, 'pause')]
  }));
  assert.deepEqual(result.segments, [segment(A, 10, 60), segment(B, 25, 70)]);
  assert.equal(duration(result, A), 50); assert.equal(duration(result, B), 45);
  assert.equal(result.coverage.status, 'complete'); assert.equal(result.physical_android_verified, false);
  assert.deepEqual(result.uncertainty, []);
});

test('trusted closed source segments clip exactly to adjacent half-open summary windows', () => {
  const source = input({ events: [edge(A, 10, 'resume'), edge(A, 90, 'pause')] });
  const first = reconstructPackageEvents({ ...source, window: interval(0, 50) });
  const second = reconstructPackageEvents({ ...source, window: interval(50, 100) });
  assert.deepEqual(first.segments, [segment(A, 10, 50)]);
  assert.deepEqual(second.segments, [segment(A, 50, 90)]);
  assert.equal(duration(first, A) + duration(second, A), 80);
  const exactlyEnd = reconstructPackageEvents(input({ events: [edge(A, 10, 'resume'), edge(A, 100, 'pause')] }));
  assert.deepEqual(exactlyEnd.segments, []); // A source/consent boundary is not a fabricated closing event.
  assert.equal(exactlyEnd.coverage.observed_duration_ms, 10);
});

test('mid-consent trusted initial state permits clipping without using pre-consent records', () => {
  const old = { package: A, timestamp: 10, get type() { throw new Error('secret pre-consent field'); } };
  const result = reconstructPackageEvents(input({
    approvals: [approval(A, [interval(30, 100)])], trustedStates: [state(A, 30, 1)],
    events: [old, edge(A, 80, 'pause')]
  }));
  assert.deepEqual(result.segments, [segment(A, 30, 80)]);
  assert.deepEqual(result.coverage.observed_intervals, [interval(30, 100)]);
  assert.deepEqual(result.aggregation_input.reasons, ['consent_boundary']);
  const noAttestation = reconstructPackageEvents(input({
    approvals: [approval(A, [interval(30, 100)])], trustedStates: [state(A, 0, 0)], events: [edge(A, 80, 'pause')]
  }));
  assert.equal(noAttestation.coverage.status, 'unknown'); assert.deepEqual(noAttestation.segments, []);
});

test('pause and narrow discard open segments and require a fresh state after resumed authorization', () => {
  const result = reconstructPackageEvents(input({
    approvals: [approval(A, [interval(0, 50), interval(70, 100)]), approval(B, [interval(0, 50)])],
    trustedStates: [state(A, 0, 0), state(B, 0, 0)],
    events: [edge(A, 10, 'resume'), edge(A, 30, 'pause'), edge(A, 40, 'resume'), edge(A, 60, 'pause'), edge(A, 75, 'resume'), edge(A, 90, 'pause'), edge(B, 15, 'resume'), edge(B, 25, 'pause')]
  }));
  assert.deepEqual(result.coverage.observed_intervals, [interval(0, 40)]);
  assert.deepEqual(result.segments, [segment(A, 10, 30), segment(B, 15, 25)]);
  assert.ok(result.uncertainty.some(value => value.package === A && value.start === 70 && value.reason === 'unknown_initial_state'));
  assert.ok(result.uncertainty.some(value => value.package === A && value.start === 40 && value.reason === 'open_segment'));
});

test('unknown initial state is never made idle by unmatched resume or pause and only an attestation restores it', () => {
  const result = reconstructPackageEvents(input({
    trustedStates: [state(A, 50, 0)],
    events: [edge(A, 10, 'resume'), edge(A, 20, 'pause'), edge(A, 30, 'pause'), edge(A, 60, 'resume'), edge(A, 80, 'pause')]
  }));
  assert.deepEqual(result.coverage.observed_intervals, [interval(50, 100)]);
  assert.deepEqual(result.segments, [segment(A, 60, 80)]);
  assert.deepEqual(result.uncertainty, [{ package: A, start: 0, end: 50, reason: 'unknown_initial_state' }]);
});

test('duplicate-looking transitions are ambiguous rather than deduplicated or counted as identified activities', () => {
  const result = reconstructPackageEvents(input({
    trustedStates: [state(A, 0, 0), state(A, 60, 0)],
    events: [edge(A, 10, 'resume'), edge(A, 10, 'resume'), edge(A, 20, 'pause'), edge(A, 30, 'pause'), edge(A, 70, 'resume'), edge(A, 80, 'pause')]
  }));
  assert.deepEqual(result.coverage.observed_intervals, [interval(60, 100)]);
  assert.deepEqual(result.segments, [segment(A, 70, 80)]);
  assert.ok(result.uncertainty.some(value => value.start === 0 && value.end === 60 && value.reason === 'pause_while_unknown'));
  const ambiguityAlone = reconstructPackageEvents(input({
    trustedStates: [state(A, 0, 0), state(A, 60, 0)],
    events: [edge(A, 10, 'resume'), edge(A, 10, 'resume'), edge(A, 70, 'resume'), edge(A, 80, 'pause')]
  }));
  assert.deepEqual(ambiguityAlone.coverage.observed_intervals, [interval(0, 10), interval(60, 100)]);
  assert.ok(ambiguityAlone.uncertainty.some(value => value.start === 10 && value.end === 60 && value.reason === 'ambiguous_transition'));
  for (const pair of [[edge(A, 10, 'resume'), edge(A, 10, 'pause')], [edge(A, 10, 'pause'), edge(A, 10, 'resume')]]) {
    const unordered = reconstructPackageEvents(input({ events: pair }));
    assert.deepEqual(unordered.segments, []);
    assert.deepEqual(unordered.coverage.observed_intervals, [interval(0, 10)]);
    assert.ok(unordered.uncertainty.some(value => value.reason === 'ambiguous_transition'));
  }
});

test('missing starts and stops lose observability without fabricating zero or a window-end close', () => {
  const missingStart = reconstructPackageEvents(input({ events: [edge(A, 30, 'pause')] }));
  assert.equal(missingStart.coverage.status, 'unknown'); assert.deepEqual(missingStart.segments, []);
  assert.deepEqual(missingStart.uncertainty, [{ package: A, start: 0, end: 100, reason: 'unmatched_pause' }]);
  const missingStop = reconstructPackageEvents(input({ events: [edge(A, 10, 'resume')] }));
  assert.deepEqual(missingStop.coverage.observed_intervals, [interval(0, 10)]); assert.deepEqual(missingStop.segments, []);
  assert.ok(missingStop.uncertainty.some(value => value.reason === 'open_segment' && value.start === 10));
  const conflict = reconstructPackageEvents(input({ trustedStates: [state(A, 0, 0), state(A, 50, 1)], events: [edge(A, 80, 'pause')] }));
  assert.deepEqual(conflict.coverage.observed_intervals, [interval(50, 100)]);
  assert.deepEqual(conflict.segments, [segment(A, 50, 80)]);
  assert.ok(conflict.uncertainty.some(value => value.reason === 'attestation_conflict' && value.start === 0));
});

test('later missing-start evidence invalidates earlier inferred phases back to the last independent checkpoint', () => {
  const closed = [edge(A, 10, 'resume'), edge(A, 20, 'pause')];
  const contradictory = reconstructPackageEvents(input({
    trustedStates: [state(A, 0, 0), state(A, 50, 1)], events: [...closed, edge(A, 80, 'pause')]
  }));
  assert.deepEqual(contradictory.coverage.observed_intervals, [interval(50, 100)]);
  assert.deepEqual(contradictory.segments, [segment(A, 50, 80)]);
  assert.ok(contradictory.uncertainty.some(value => value.start === 0 && value.end === 50 && value.reason === 'attestation_conflict'));
  const unmatched = reconstructPackageEvents(input({
    trustedStates: [state(A, 0, 0), state(A, 60, 0)],
    events: [...closed, edge(A, 50, 'pause'), edge(A, 70, 'resume'), edge(A, 80, 'pause')]
  }));
  assert.deepEqual(unmatched.coverage.observed_intervals, [interval(60, 100)]);
  assert.deepEqual(unmatched.segments, [segment(A, 70, 80)]);
  assert.ok(unmatched.uncertainty.some(value => value.start === 0 && value.end === 60 && value.reason === 'unmatched_pause'));
  const laterIndependent = reconstructPackageEvents(input({
    trustedStates: [state(A, 0, 0), state(A, 30, 0), state(A, 60, 0)],
    events: [...closed, edge(A, 50, 'pause')]
  }));
  assert.deepEqual(laterIndependent.coverage.observed_intervals, [interval(0, 30), interval(60, 100)]);
  assert.deepEqual(laterIndependent.segments, [segment(A, 10, 20)]);
  for (const uncertainBatch of [
    [edge(A, 30, 'pause'), edge(A, 30, 'pause')],
    [edge(A, 25, 'resume'), edge(A, 30, 'pause'), edge(A, 30, 'pause')]
  ]) {
    const pauseSurplus = reconstructPackageEvents(input({
      trustedStates: [state(A, 0, 0), state(A, 60, 0)],
      events: [...closed, ...uncertainBatch, edge(A, 70, 'resume'), edge(A, 80, 'pause')]
    }));
    assert.deepEqual(pauseSurplus.coverage.observed_intervals, [interval(60, 100)]);
    assert.deepEqual(pauseSurplus.segments, [segment(A, 70, 80)]);
    assert.ok(pauseSurplus.uncertainty.some(value => value.start === 0 && value.end === 60 && value.reason === 'unmatched_pause'));
  }
  // Once ambiguity loses the count, even a plausible pause is conservatively
  // unknown. Same-time duplicate-looking pauses are not a claimed full deficit.
  for (const laterPauses of [
    [edge(A, 40, 'pause')],
    [edge(A, 40, 'pause'), edge(A, 40, 'pause')],
    [edge(A, 40, 'pause'), edge(A, 50, 'pause'), edge(A, 60, 'pause')]
  ]) {
    const afterAmbiguity = reconstructPackageEvents(input({
      trustedStates: [state(A, 0, 0), state(A, 80, 0)],
      events: [...closed, edge(A, 30, 'resume'), edge(A, 30, 'resume'), ...laterPauses, edge(A, 85, 'resume'), edge(A, 95, 'pause')]
    }));
    assert.deepEqual(afterAmbiguity.coverage.observed_intervals, [interval(80, 100)]);
    assert.deepEqual(afterAmbiguity.segments, [segment(A, 85, 95)]);
    assert.ok(afterAmbiguity.uncertainty.some(value => value.start === 0 && value.end === 80 && value.reason === 'pause_while_unknown'));
  }
});

test('source gaps break counter continuity; an empty untrusted query never proves zero', () => {
  const gap = reconstructPackageEvents(input({
    trustedContinuity: [interval(0, 40), interval(60, 100)],
    events: [edge(A, 10, 'resume'), edge(A, 30, 'pause'), edge(A, 35, 'resume'), edge(A, 70, 'pause')]
  }));
  assert.deepEqual(gap.coverage.observed_intervals, [interval(0, 35)]);
  assert.deepEqual(gap.segments, [segment(A, 10, 30)]);
  assert.ok(gap.uncertainty.some(value => value.reason === 'source_gap' && value.start === 40 && value.end === 60));
  assert.ok(gap.uncertainty.some(value => value.reason === 'unknown_initial_state' && value.start === 60));
  for (const overrides of [{ trustedContinuity: [] }, { trustedStates: [] }]) {
    const empty = reconstructPackageEvents(input(overrides));
    assert.equal(empty.coverage.status, 'unknown'); assert.deepEqual(empty.segments, []);
    assert.equal(aggregateSegments(empty.aggregation_input, { applications: [{ namespace: 'android', id: A }], allowed_fields: ['foreground_duration_ms'] }, [[0, 100]]), null);
  }
});

test('unknown state of one approved package reduces common coverage and every app duration for reference aggregation', () => {
  const result = reconstructPackageEvents(input({
    approvals: [approval(A), approval(B)], trustedStates: [state(A, 0, 0), state(B, 50, 0)],
    events: [edge(A, 10, 'resume'), edge(A, 90, 'pause'), edge(B, 60, 'resume'), edge(B, 80, 'pause')]
  }));
  assert.deepEqual(result.coverage.observed_intervals, [interval(50, 100)]);
  assert.deepEqual(result.segments, [segment(A, 50, 90), segment(B, 60, 80)]);
  const summary = aggregateSegments(result.aggregation_input, {
    applications: [{ namespace: 'android', id: A }, { namespace: 'android', id: B }], allowed_fields: ['foreground_duration_ms']
  }, [[0, 100]]);
  assert.equal(summary.coverage.status, 'partial');
  assert.deepEqual(summary.apps.map(value => value.foreground_duration_ms), [40, 20]);
  assert.deepEqual(summary.coverage.reasons, ['source_unavailable']);
});

test('denied app data and class/extras/labels hostile getters are never read or returned', () => {
  const forbidden = () => { throw new Error('secret forbidden field'); };
  const approved = edge(A, 10, 'resume');
  Object.defineProperties(approved, { class: { get: forbidden }, className: { get: forbidden }, extras: { get: forbidden }, label: { get: forbidden } });
  const denied = { package: 'org.private.secret', get timestamp() { return forbidden(); }, get type() { return forbidden(); }, get class() { return forbidden(); } };
  const deniedState = { package: 'org.private.secret', get timestamp() { return forbidden(); }, get resumed_count() { return forbidden(); } };
  const result = reconstructPackageEvents(input({ events: [denied, approved, edge(A, 20, 'pause')], trustedStates: [deniedState, state(A, 0, 0)] }));
  assert.deepEqual(result.segments, [segment(A, 10, 20)]);
  assert.ok(!JSON.stringify(result).includes('secret'));
  const emptyScope = reconstructPackageEvents(input({ approvals: [], events: [{ get package() { return forbidden(); } }], trustedStates: [{ get package() { return forbidden(); } }] }));
  assert.equal(emptyScope.coverage.status, 'unknown'); assert.deepEqual(emptyScope.package_coverage, []);
});

test('synthetic source caps fail closed without truncating scope or leaking malformed values', () => {
  const sixtyFour = Array.from({ length: 64 }, (_, i) => approval(`org.example.app${i}`));
  assert.equal(reconstructPackageEvents(input({ approvals: sixtyFour, trustedStates: [], events: [] })).package_coverage.length, 64);
  const badInputs = [
    input({ synthetic: false }), input({ window: interval(0, SYNTHETIC_OBSERVATION_LIMITS.span_ms + 1) }),
    input({ approvals: [...sixtyFour, approval('org.example.overflow')] }),
    input({ events: Array.from({ length: SYNTHETIC_OBSERVATION_LIMITS.transitions + 1 }, () => edge(A, 10, 'resume')) }),
    input({ events: [edge(A, 10.5, 'resume')] }), input({ events: [edge(A, 10, 'secret invalid type')] }),
    input({ trustedStates: [state(A, 0, 65)] }), input({ approvals: [approval(A), approval(A)] }),
    input({ trustedStates: [state(A, 0, 0), state(A, 0, 1)] }),
    input({ events: [{ package: A, get timestamp() { throw new Error('secret raw error'); } }] }),
    input({ events: [{ package: A, get timestamp() { throw new OapError('unauthorized', 'secret forged OapError'); } }] })
  ];
  for (const bad of badInputs) assert.throws(() => reconstructPackageEvents(bad), safeFailure);
  const phases = Array.from({ length: 65 }, (_, i) => interval(i * 3, i * 3 + 1));
  assert.throws(() => reconstructPackageEvents(input({ window: interval(0, 195), approvals: [approval(A, phases)] })), safeFailure);
  const fragmented = input({
    window: interval(0, 195), approvals: [approval(A, [interval(0, 195)])], trustedContinuity: [interval(0, 195)],
    trustedStates: Array.from({ length: 65 }, (_, i) => state(A, i * 3, 0)),
    events: Array.from({ length: 65 }, (_, i) => [edge(A, i * 3 + 1, 'resume'), edge(A, i * 3 + 1, 'resume')]).flat()
  });
  assert.throws(() => reconstructPackageEvents(fragmented), error => error instanceof OapError && error.code === 'payload_too_large');
});
