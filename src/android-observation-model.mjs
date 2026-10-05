// Pure JavaScript SYNTHETIC experiment. This does not query Android, establish
// OS permission, validate OAP events, or prove physical-device accuracy.
import { OapError } from './protocol.mjs';
import { unionIntervals, intersectIntervals, intervalDuration } from './aggregation.mjs';

export const SYNTHETIC_OBSERVATION_LIMITS = Object.freeze({
  packages: 64, transitions: 4096, states: 512, intervals: 64,
  resumed_count: 64, output_records: 4096, span_ms: 86400000
});
const INVALID_INPUT = Symbol('invalid synthetic observation'), OVERFLOW = Symbol('synthetic observation overflow');
const fail = (code = 'invalid_request') => { throw code === 'payload_too_large' ? OVERFLOW : INVALID_INPUT; };
const record = value => { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(); return value; };
const list = (value, max) => { if (!Array.isArray(value)) fail(); if (value.length > max) fail('payload_too_large'); return value; };
const tick = value => {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < 0 || value > 8640000000000000) fail();
  return value;
};
const packageName = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(value)) fail();
  return value;
};
const intervalRecords = value => list(value, SYNTHETIC_OBSERVATION_LIMITS.intervals).map(item => {
  record(item); const a = tick(item.start), b = tick(item.end); if (a >= b) fail(); return [a, b];
});
const inside = (at, intervals) => intervals.some(([a, b]) => a <= at && at < b);
const objects = intervals => intervals.map(([start, end]) => ({ start, end }));
const iso = value => new Date(value).toISOString();
const subtract = (source, removed) => {
  let result = source;
  for (const [a, b] of removed) result = result.flatMap(([c, d]) =>
    [[c, Math.min(d, a)], [Math.max(c, b), d]].filter(([l, r]) => l < r));
  return unionIntervals(result);
};

/**
 * Callers supply explicit SYNTHETIC authority, complete-transition continuity,
 * and independently trusted per-package resumed counts. None is inferred from
 * a successful/empty query, an isolated pause, or an Android API promise.
 *
 * All times are integer milliseconds. Every interval is half-open. A trusted
 * state is the count immediately BEFORE transitions at that timestamp; it is
 * usable only inside current authorization and trusted continuity. A fresh
 * disconnected interval starts unknown, even after an earlier known idle.
 * Transitions at an authorization/source end are outside that interval. A
 * later authorized close can establish a segment spanning a summary boundary.
 *
 * Only package/timestamp/type are accessed on transitions; only package/time/
 * count on states. Denied packages are discarded before other property reads.
 * Duplicate-looking same-package/time transitions are deliberately ambiguous,
 * rather than guessed to be duplicates or separate activity instances.
 * A later pause while ambiguous discards inferred history since the independent
 * checkpoint: this small experiment has no sound instance/count range proof.
 * It reports uncertainty rather than claiming that every such pause is invalid.
 * The 64-package experiment cap is not a wire page: the reference publisher
 * still performs its separate 32-app partitioning and OAP validation.
 */
export function reconstructPackageEvents(input) {
  try { return reconstruct(input); }
  catch (error) {
    // Never propagate an input getter's message, including a forged OapError.
    throw new OapError(error === OVERFLOW ? 'payload_too_large' : 'invalid_request', 'Synthetic observation input is invalid or exceeds its bounds.');
  }
}

function reconstruct(input) {
  record(input); if (input.synthetic !== true) fail();
  const window = record(input.window), start = tick(window.start), end = tick(window.end);
  if (start >= end || end - start > SYNTHETIC_OBSERVATION_LIMITS.span_ms) fail();
  const events = list(input.events ?? [], SYNTHETIC_OBSERVATION_LIMITS.transitions);
  const states = list(input.trustedStates ?? [], SYNTHETIC_OBSERVATION_LIMITS.states);
  const approvals = list(input.approvals, SYNTHETIC_OBSERVATION_LIMITS.packages);
  const allowed = new Map();
  let earliest = start, latest = end;
  const track = intervals => {
    for (const [a, b] of intervals) { earliest = Math.min(earliest, a); latest = Math.max(latest, b); }
    if (latest - earliest > SYNTHETIC_OBSERVATION_LIMITS.span_ms) fail();
  };
  for (const approval of approvals) {
    record(approval); const name = packageName(approval.package);
    if (allowed.has(name)) fail();
    const authorized = unionIntervals(intervalRecords(approval.intervals));
    track(authorized);
    allowed.set(name, { authorized, events: [], states: [], coverage: [], segments: [] });
  }
  // An empty scope reads no event or state properties, including package.
  const continuity = allowed.size ? unionIntervals(intervalRecords(input.trustedContinuity ?? [])) : [];
  track(continuity);
  for (const target of allowed.values()) target.eligible = intersectIntervals(target.authorized, continuity);
  if (allowed.size) {
    for (const event of events) {
      record(event); const target = allowed.get(event.package);
      if (!target) continue;
      const at = tick(event.timestamp);
      // No pre-consent, paused, narrowed-away, or untrusted-gap fields enter the model.
      if (!inside(at, target.eligible)) continue;
      const type = event.type;
      if (type !== 'resume' && type !== 'pause') fail();
      target.events.push({ at, type });
    }
    for (const state of states) {
      record(state); const target = allowed.get(state.package);
      if (!target) continue;
      const at = tick(state.timestamp);
      if (!inside(at, target.eligible)) continue;
      const count = state.resumed_count;
      if (!Number.isSafeInteger(count) || Object.is(count, -0) || count < 0 || count > SYNTHETIC_OBSERVATION_LIMITS.resumed_count) fail();
      target.states.push({ at, count });
    }
  }
  const uncertainty = [];
  const uncertain = (name, a, b, reason) => {
    a = Math.max(a, start); b = Math.min(b, end);
    if (a < b) uncertainty.push({ package: name, start: a, end: b, reason });
    if (uncertainty.length > SYNTHETIC_OBSERVATION_LIMITS.output_records) fail('payload_too_large');
  };
  const requested = [[start, end]];
  let authorizationBoundary = false;
  for (const [name, target] of allowed) {
    const authorizedWindow = intersectIntervals(target.authorized, requested);
    if (intervalDuration(authorizedWindow) !== end - start) authorizationBoundary = true;
    for (const [a, b] of subtract(requested, authorizedWindow)) uncertain(name, a, b, 'authorization_boundary');
    for (const [a, b] of subtract(authorizedWindow, continuity)) uncertain(name, a, b, 'source_gap');
    for (const [a, b] of target.eligible) {
      const timeline = new Map();
      const point = at => { if (!timeline.has(at)) timeline.set(at, { events: [], states: [] }); return timeline.get(at); };
      for (const event of target.events) if (a <= event.at && event.at < b) point(event.at).events.push(event.type);
      for (const state of target.states) if (a <= state.at && state.at < b) point(state.at).states.push(state.count);
      let count = null, phaseStart = a, independentBoundary = a, unknownReason = 'unknown_initial_state';
      const invalidateSinceBoundary = at => {
        // A missing start may precede earlier inferred idle/closed phases. The
        // last independent state bounds that uncertainty; inferred pauses do not.
        target.coverage = subtract(target.coverage, [[independentBoundary, at]]);
        target.segments = subtract(target.segments, [[independentBoundary, at]]);
      };
      const lose = (at, reason, keepIdlePrefix = false) => {
        if (count !== null && count === 0 && keepIdlePrefix && phaseStart < at) target.coverage.push([phaseStart, at]);
        phaseStart = keepIdlePrefix && count === 0 ? at : phaseStart;
        count = null; unknownReason = reason;
      };
      for (const [at, pointValue] of [...timeline].sort(([x], [y]) => x - y)) {
        if (pointValue.states.length) {
          const next = pointValue.states[0];
          if (pointValue.states.some(value => value !== next)) fail();
          if (count === null) {
            uncertain(name, phaseStart, at, unknownReason); phaseStart = at;
          } else if (count !== next) {
            // A contradictory independent checkpoint cannot locate a missing edge.
            invalidateSinceBoundary(at);
            uncertain(name, independentBoundary, at, 'attestation_conflict'); phaseStart = at;
          } else if (count === 0) {
            target.coverage.push([phaseStart, at]); phaseStart = at;
          }
          count = next; independentBoundary = at;
        }
        if (!pointValue.events.length) continue;
        if (count === null) {
          if (pointValue.events.includes('pause')) {
            // Without a sound count range, a later pause cannot confirm that
            // earlier inferred idle/closed phases survived missing starts.
            invalidateSinceBoundary(at); phaseStart = independentBoundary;
            if (unknownReason === 'ambiguous_transition') unknownReason = 'pause_while_unknown';
          }
          continue;
        }
        if (pointValue.events.length > 1) {
          const resumes = pointValue.events.filter(type => type === 'resume').length;
          const pauses = pointValue.events.length - resumes;
          if (pauses > count + resumes) {
            // No ordering can explain this pause surplus. Ambiguity must not
            // bypass the same retrospective invalidation as a single deficit.
            invalidateSinceBoundary(at); phaseStart = independentBoundary;
            lose(at, 'unmatched_pause');
          } else lose(at, 'ambiguous_transition', true);
          continue;
        }
        const type = pointValue.events[0];
        if (type === 'resume') {
          if (count >= SYNTHETIC_OBSERVATION_LIMITS.resumed_count) fail('payload_too_large');
          if (count === 0) { target.coverage.push([phaseStart, at]); phaseStart = at; }
          count += 1;
        } else if (count === 0) {
          invalidateSinceBoundary(at);
          phaseStart = independentBoundary;
          lose(at, 'unmatched_pause');
        } else {
          count -= 1;
          if (count === 0) {
            if (phaseStart < at) { target.segments.push([phaseStart, at]); target.coverage.push([phaseStart, at]); }
            phaseStart = at;
          }
        }
      }
      if (count === 0) target.coverage.push([phaseStart, b]);
      else uncertain(name, phaseStart, b, count === null ? unknownReason : 'open_segment');
    }
    target.coverage = intersectIntervals(target.coverage, requested);
    target.segments = unionIntervals(target.segments);
  }
  let common = allowed.size ? requested : [];
  for (const target of allowed.values()) common = intersectIntervals(common, target.coverage);
  if (common.length > SYNTHETIC_OBSERVATION_LIMITS.intervals) fail('payload_too_large');
  const segments = [], packageCoverage = [];
  for (const [name, target] of [...allowed].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    if (target.coverage.length > SYNTHETIC_OBSERVATION_LIMITS.intervals) fail('payload_too_large');
    packageCoverage.push({ package: name, intervals: objects(target.coverage) });
    // The reference summary may use only coverage established for its entire scope.
    for (const [a, b] of intersectIntervals(target.segments, common)) segments.push({ package: name, start: a, end: b });
  }
  if (segments.length > SYNTHETIC_OBSERVATION_LIMITS.output_records) fail('payload_too_large');
  uncertainty.sort((a, b) => a.package < b.package ? -1 : a.package > b.package ? 1 : a.start - b.start || a.end - b.end || (a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0));
  const complete = common.length === 1 && common[0][0] === start && common[0][1] === end;
  const reasons = complete ? [] : [...(authorizationBoundary ? ['consent_boundary'] : []), ...(uncertainty.some(value => value.reason !== 'authorization_boundary') || !allowed.size ? ['source_unavailable'] : [])];
  return {
    experiment: 'synthetic-android-package-events-v1', physical_android_verified: false,
    window: { start, end }, segments, package_coverage: packageCoverage,
    coverage: { status: complete ? 'complete' : common.length ? 'partial' : 'unknown', observed_intervals: objects(common), observed_duration_ms: intervalDuration(common) },
    uncertainty,
    aggregation_input: {
      start: iso(start), end: iso(end),
      observations: segments.map(segment => ({ application: { namespace: 'android', id: segment.package }, start: iso(segment.start), end: iso(segment.end) })),
      observed_intervals: common.map(([a, b]) => ({ start: iso(a), end: iso(b) })), reasons
    }
  };
}
