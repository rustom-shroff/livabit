// Synthetic foreground observations only. No OS queries or raw persistence.
import { appKey, OapError } from './protocol.mjs';

const iso = n => new Date(n).toISOString();
const stamp = s => { const n = Date.parse(s); if (!Number.isFinite(n)) throw new OapError('invalid_event'); return n; };
export function unionIntervals(intervals) {
  const sorted = intervals.filter(([a, b]) => a < b).sort((a, b) => a[0] - b[0]);
  const result = [];
  for (const [a, b] of sorted) {
    if (result.length && a <= result.at(-1)[1]) result.at(-1)[1] = Math.max(result.at(-1)[1], b);
    else result.push([a, b]);
  }
  return result;
}
export function intersectIntervals(left, right) {
  return unionIntervals(left.flatMap(([a, b]) => right.map(([c, d]) => [Math.max(a, c), Math.min(b, d)])));
}
export const intervalDuration = intervals => intervals.reduce((n, [a, b]) => n + b - a, 0);

/**
 * Redacts at the source boundary and clips separable synthetic sessions. Unknown
 * content/extras, disallowed identities and labels never enter the result.
 * An inseparable OS bucket crossing a boundary is discarded, never prorated.
 */
export function aggregateSegments({ start, end, observations = [], observed_intervals = [], reasons = [] }, scope, authorizedIntervals) {
  const a = stamp(start), b = stamp(end);
  const requested = [[a, b]];
  const source = unionIntervals(observed_intervals.map(x => [stamp(x.start), stamp(x.end)]));
  const permitted = intersectIntervals(requested, authorizedIntervals);
  let observed = intersectIntervals(source, permitted);
  const missing = new Set(reasons);
  if (intervalDuration(permitted) < b - a) missing.add('consent_boundary');
  const allowed = new Map(scope.applications.map(x => [appKey(x), x]));
  const records = new Map();
  for (const input of observations) {
    const identity = input.application;
    if (!identity || !allowed.has(appKey(identity))) continue;
    const from = stamp(input.start), to = stamp(input.end);
    if (from >= to) throw new OapError('invalid_event');
    if (input.inseparable) {
      // Conservative loss of the bucket's observability; no estimated duration.
      const blocked = intersectIntervals([[from, to]], requested);
      const next = [];
      for (const [x, y] of observed) {
        let fragments = [[x, y]];
        for (const [c, d] of blocked) fragments = fragments.flatMap(([l, r]) => [[l, Math.min(r, c)], [Math.max(l, d), r]].filter(([l, r]) => l < r));
        next.push(...fragments);
      }
      observed = unionIntervals(next);
      missing.add('source_unavailable');
      continue;
    }
    const key = appKey(identity);
    const record = records.get(key) ?? { application: { ...allowed.get(key) }, intervals: [] };
    if (scope.allowed_fields.includes('label') && typeof identity.label === 'string') record.application.label = identity.label;
    record.intervals.push([from, to]);
    records.set(key, record);
  }
  if (!observed.length || observed.length > 64) return null;
  const apps = [...records.values()].map(x => ({
    application: x.application,
    foreground_duration_ms: intervalDuration(intersectIntervals(x.intervals, observed))
  })).filter(x => x.foreground_duration_ms > 0).sort((x, y) => appKey(x.application) < appKey(y.application) ? -1 : 1);
  const complete = observed.length === 1 && observed[0][0] === a && observed[0][1] === b;
  if (!complete && !missing.size) missing.add('source_unavailable');
  return {
    start, end,
    coverage: {
      status: complete ? 'complete' : 'partial',
      observed_intervals: observed.map(([start, end]) => ({ start: iso(start), end: iso(end) })),
      reasons: complete ? [] : [...missing].sort()
    },
    apps
  };
}
