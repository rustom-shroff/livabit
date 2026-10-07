// Offline owned-fixture timing evidence only. No Android, network, or native execution.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const FIXTURE = 'org.liveabit.fixture', INSPECT = 'org.liveabit.inspect';
const MAX_WALL = 253402300799999, MAX_OFFSET = 3600000, MAX_WINDOW = 600000;
const SHA = /^[a-f0-9]{64}$/, ZONE = /^[A-Za-z0-9_+./:-]{1,80}$/;
const EMULATOR_PROFILES = { 35: { serial: 'emulator-5580', avd: 'liveabit-api35-test' },
  36: { serial: 'emulator-5582', avd: 'liveabit-api36-test' } };
const CONTEXT_KEYS = ['format', 'package_id', 'session_start_wall_millis', 'session_start_elapsed_millis',
  'query_cursor_wall_millis_exclusive', 'report_clock_wall_millis', 'report_clock_elapsed_millis',
  'display_time_zone', 'report_clock_utc_offset_millis', 'events', 'closed_intervals',
  'complete_displayed_fixture_records', 'owned_fixture_only', 'source_coverage_unknown',
  'original_os_query_batch_clocks_attested', 'query_cursor_elapsed_clock_available',
  'display_time_zone_at_report_only', 'synthetic_clock_envelope', 'physical_android_verified',
  'production_accuracy_pass', 'ui'].sort();
const CORE_SOURCES = [
  'android/collector-core/src/main/java/org/liveabit/collector/core/LocalInspectionCore.java',
  'android/collector-core/src/main/java/org/liveabit/collector/core/FixtureComparison.java'
];
const REASONS = [
  'Several transitions share one time; earlier estimates were discarded.',
  'A pause has no known matching resume; earlier estimates were discarded.'
];
const CASES = [
  'fresh_launch_and_permission_denial', 'usage_settings_grant_is_not_session_consent',
  'manual_scope_validation_and_system_picker', 'no_preconsent_backfill_and_empty_is_unknown',
  'controlled_idle_timing_and_scope', 'controlled_screen_handoffs_timing_and_scope',
  'comparison_validation_and_input_erasure', 'stop_fresh_horizon_and_restart',
  'permission_revocation_and_rapid_regrant', 'clear_selection_persists_and_fixture_clear'
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const parseJson = bytes => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
const check = (ok, message) => { if (!ok) throw new Error(message); };
const integer = (value, name, max = MAX_WALL, min = 0) => {
  check(Number.isSafeInteger(value) && value >= min && value <= max, `Invalid ${name}.`);
  return value;
};
const array = (value, name, max = 64) => {
  check(Array.isArray(value) && value.length <= max, `Invalid or excessive ${name}.`);
  return value;
};
const same = (left, right, message) => check(JSON.stringify(left) === JSON.stringify(right), message);
const relative = target => path.relative(ROOT, target).split(path.sep).join('/');
const canonical = target => path.resolve(target).toLowerCase();

function safeRelative(value) {
  check(typeof value === 'string' && value.length <= 220 && /^[A-Za-z0-9_.\/-]+$/.test(value)
    && !value.startsWith('/') && !value.split('/').some(part => part === '.' || part === '..' || part === ''),
  'Only bounded project-relative evidence paths are supported.');
  const target = path.resolve(ROOT, value);
  check(canonical(target).startsWith(canonical(ROOT) + path.sep), 'Evidence path escapes the project.');
  return target;
}

function evidenceFields(context) {
  return Object.fromEntries(['format', 'package_id', 'session_start_wall_millis', 'session_start_elapsed_millis',
    'query_cursor_wall_millis_exclusive', 'report_clock_wall_millis', 'report_clock_elapsed_millis',
    'display_time_zone', 'report_clock_utc_offset_millis', 'events', 'closed_intervals'].map(key => [key, context[key]]));
}

function validateContext(context, environment, expectedCount) {
  check(context && context.format === 'fixture_timing_details_v1' && context.package_id === FIXTURE,
    'Exact owned-fixture numeric timing context is required; older displayed dates cannot be used.');
  same(Object.keys(context).sort(), CONTEXT_KEYS, 'Unexpected or missing owned-fixture context fields.');
  for (const field of ['session_start_wall_millis', 'session_start_elapsed_millis', 'query_cursor_wall_millis_exclusive',
    'report_clock_wall_millis', 'report_clock_elapsed_millis']) integer(context[field], field);
  check(context.session_start_wall_millis <= context.query_cursor_wall_millis_exclusive
    && context.query_cursor_wall_millis_exclusive <= context.report_clock_wall_millis
    && context.session_start_elapsed_millis <= context.report_clock_elapsed_millis, 'Unordered session/query/report anchors.');
  check(Math.abs(context.report_clock_wall_millis - context.session_start_wall_millis
    - (context.report_clock_elapsed_millis - context.session_start_elapsed_millis)) <= 2000,
  'Paired report/session clocks disagree beyond the existing core tolerance.');
  check(ZONE.test(context.display_time_zone) && context.display_time_zone === environment.guest_time_zone_property,
    'Captured app formatting zone differs from the recorded guest property.');
  integer(context.report_clock_utc_offset_millis, 'report UTC offset', 86400000, -86400000);
  check(context.complete_displayed_fixture_records === true && context.owned_fixture_only === true
    && context.source_coverage_unknown === true && context.original_os_query_batch_clocks_attested === false
    && context.query_cursor_elapsed_clock_available === false && context.display_time_zone_at_report_only === true
    && context.synthetic_clock_envelope === false && context.physical_android_verified === false
    && context.production_accuracy_pass === false, 'Unsupported source context claim or incomplete displayed records.');
  const events = array(context.events, 'projected fixture events');
  check(events.length === expectedCount, 'Exact projected event count differs from retained count.');
  for (const event of events) {
    check(event && Object.keys(event).sort().join(',') === 'timestamp_millis,type'
      && ['RESUME', 'PAUSE'].includes(event.type), 'Only exact projected epoch/type fields for the fixed fixture are allowed.');
    integer(event.timestamp_millis, 'event timestamp');
    check(event.timestamp_millis >= context.session_start_wall_millis
      && event.timestamp_millis < context.query_cursor_wall_millis_exclusive, 'Event escapes its source session/query horizon.');
  }
  for (let index = 1; index < events.length; index++)
    check(events[index].timestamp_millis <= events[index - 1].timestamp_millis, 'Source event display order is not latest first.');
  const intervals = array(context.closed_intervals, 'displayed retained intervals', 8);
  for (const interval of intervals) {
    check(interval && Object.keys(interval).sort().join(',') === 'end_exclusive,start_inclusive', 'Unexpected interval fields.');
    integer(interval.start_inclusive, 'interval start'); integer(interval.end_exclusive, 'interval end');
    check(interval.start_inclusive >= context.session_start_wall_millis && interval.end_exclusive > interval.start_inclusive
      && interval.end_exclusive < context.query_cursor_wall_millis_exclusive, 'Interval escapes its source session/query horizon.');
  }
  const ordered = [...intervals].sort((a, b) => a.start_inclusive - b.start_inclusive);
  for (let index = 1; index < ordered.length; index++)
    check(ordered[index].start_inclusive >= ordered[index - 1].end_exclusive, 'Retained native intervals overlap or repeat.');
  const ui = array(context.ui, 'timing-context UI references', 32);
  check(ui.length > 0 && new Set(ui).size === ui.length, 'Missing or repeated timing-context UI references.');
  ui.forEach(reference => {
    safeRelative(reference);
    check(/^artifacts\/android-emulator-[a-z0-9.-]+\/\d{4}-[a-z0-9-]+\.xml$/.test(reference), 'UI reference is outside owned emulator evidence.');
  });
  return context;
}

function clippedUnion(intervals, start, end) {
  const clipped = intervals.map(interval => [Math.max(start, interval.start_inclusive), Math.min(end, interval.end_exclusive)])
    .filter(([a, b]) => a < b).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (!clipped.length) return null;
  let total = 0, [a, b] = clipped[0];
  for (const [nextA, nextB] of clipped.slice(1)) {
    if (nextA <= b) b = Math.max(b, nextB);
    else { total += b - a; a = nextA; b = nextB; }
  }
  return total + b - a;
}

export function validateOwnedTimingReport(report) {
  check(report && report.result === 'pass_with_emulator_limits' && report.scope === 'dedicated_owned_emulator_runtime_ui',
    'A completed passing owned-emulator runtime report is required.');
  const environment = report.environment;
  const profile = EMULATOR_PROFILES[environment?.api];
  check(profile && environment.serial === profile.serial && environment.expected_avd === profile.avd && environment.actual_avd === profile.avd
    && environment.qemu_verified === true && environment.account_free_verified === true && environment.abi === 'x86_64'
    && typeof environment.build_fingerprint === 'string' && environment.build_fingerprint.length > 0
    && ZONE.test(environment.guest_time_zone_property)
    && environment.guest_time_zone_property_source === 'read_only_getprop_persist.sys.timezone', 'Owned account-free emulator identity or timezone provenance is incomplete.');
  check(SHA.test(report.harness_sha256) && report.summary?.passed === 10 && report.summary.failed === 0
    && report.physical_android_verified === false && report.measured_production_accuracy_verified === false
    && report.m2_verified === false && report.m3_verified === false, 'Unsupported verification claim or incomplete workflow suite.');
  const start = Date.parse(report.generated_at), end = Date.parse(report.finished_at);
  check(Number.isFinite(start) && Number.isFinite(end) && end > start, 'Runtime report timestamps are incomplete.');
  const provenance = report.run_provenance;
  check(provenance && SHA.test(provenance.sha256) && provenance.source === 'artifacts/android-emulator/run.json'
    && provenance.api === environment.api && provenance.image === `system-images;android-${environment.api};default;x86_64`
    && provenance.freshness_verified === true && provenance.installed_tool_properties_match === true
    && provenance.avd_path === `artifacts/android-emulator/avd/${environment.actual_avd}.avd`, 'Owned startup source provenance is incomplete.');
  const created = Date.parse(provenance.created_at);
  check(Number.isFinite(created) && start - created >= -30000 && start - created <= 21600000,
    'Recorded startup is outside the original harness freshness bound.');
  const cases = array(report.cases, 'runtime cases', 10);
  same(cases.map(value => value.name), CASES, 'Expected all ten original runtime cases in order.');
  check(cases.every(value => value.result === 'pass'), 'A runtime case did not pass.');
  const installed = array(report.installed_apks, 'installed APK identities', 2);
  check(installed.length === 2 && new Set(installed.map(apk => apk.package_id)).size === 2
    && installed.every(apk => [INSPECT, FIXTURE].includes(apk.package_id) && SHA.test(apk.sha256)
      && apk.exact_audited_bytes_verified === true && typeof apk.version_name === 'string'
      && /^[0-9]+\.[0-9]+\.[0-9]+-(?:local|fixture)$/.test(apk.version_name)), 'Exact audited installed APK identities are required.');
  const measurements = array(report.measurements, 'controlled trials', 32);
  check(measurements.length > 0, 'No exact controlled trials were recorded.');
  for (const measurement of measurements) {
    check(['idle', 'screen_handoffs'].includes(measurement.scenario), 'Unsupported controlled fixture scenario.');
    integer(measurement.start, 'fixture start'); integer(measurement.end, 'fixture end');
    const span = measurement.end - measurement.start;
    check(span > 0 && span <= MAX_WINDOW, 'Fixture comparison window is unsupported.');
    integer(measurement.duration, 'entered fixture duration', span + 2000);
    integer(measurement.callbacks, 'retained fixture callback count', 128);
    integer(measurement.retained_transitions, 'retained transition count', 64);
    validateContext(measurement.timing_context, environment, measurement.retained_transitions);
    check(measurement.start >= measurement.timing_context.session_start_wall_millis
      && measurement.end <= measurement.timing_context.query_cursor_wall_millis_exclusive, 'Entered fixture window escapes its source horizon.');
    check(measurement.production_accuracy_pass === false && measurement.exact_context_clipped_comparison_matches === true,
      'Exact-context comparator agreement or unverified status is missing.');
    const reasons = array(measurement.discarded_estimate_reasons, 'discard reasons', REASONS.length);
    check(reasons.every(reason => REASONS.includes(reason)) && new Set(reasons).size === reasons.length,
      'Unknown or duplicate discarded-estimate reason.');
    check(measurement.estimates_discarded === (reasons.length > 0)
      && measurement.partial_estimate_warning_verified === measurement.estimates_discarded, 'Discarded-estimate flags disagree with recorded reasons.');
    const candidate = measurement.candidate_duration_millis;
    if (candidate === null) check(measurement.signed_difference_millis === null && measurement.comparison_status === 'unknown', 'Unknown estimate was replaced with a numeric duration or difference.');
    else {
      integer(candidate, 'retained candidate duration', span);
      check(measurement.signed_difference_millis === candidate - measurement.duration
        && measurement.comparison_status === (measurement.estimates_discarded ? 'known_partial_unverified_estimate' : 'known_unverified_estimate'),
      'Signed difference or unverified comparison label disagrees.');
    }
    check(clippedUnion(measurement.timing_context.closed_intervals, measurement.start, measurement.end) === candidate,
      'Exact interval clipping disagrees with the recorded comparison.');
  }
  check(report.summary.known_comparisons === measurements.filter(value => value.candidate_duration_millis !== null).length
    && report.summary.partial_comparisons === measurements.filter(value => value.estimates_discarded).length,
  'Runtime measurement summary counts disagree.');
  let visited = 0;
  const validateNestedContexts = (value, depth = 0) => {
    check(++visited <= 50000 && depth <= 32, 'Runtime report nesting or size exceeds the supported bound.');
    if (!value || typeof value !== 'object') return;
    if (value.format === 'fixture_timing_details_v1') validateContext(value, environment, array(value.events, 'nested fixture events').length);
    for (const item of Object.values(value)) validateNestedContexts(item, depth + 1);
  };
  validateNestedContexts(report);
  return report;
}

function decode(value) {
  return value.replace(/&([^;\s]+);/g, (_, entity) => {
    const named = { quot: '"', apos: "'", amp: '&', lt: '<', gt: '>' };
    if (Object.hasOwn(named, entity)) return named[entity];
    check(/^#(?:[0-9]+|x[0-9a-f]+)$/i.test(entity), 'Unsupported XML entity.');
    const number = entity.startsWith('#x') ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    check(Number.isSafeInteger(number) && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
      && (number >= 32 || [9, 10, 13].includes(number)), 'Invalid XML character.');
    return String.fromCodePoint(number);
  });
}

function parseContextText(text) {
  const lines = text.split('\n'); let index = 0;
  const exact = line => check(lines[index++] === line, 'Unexpected exact timing-detail grammar.');
  const number = (label, signed = false) => {
    const value = lines[index++]; const prefix = `${label}: `;
    check(value?.startsWith(prefix) && new RegExp(signed ? '^-?[0-9]+$' : '^[0-9]+$').test(value.slice(prefix.length)), 'Missing exact numeric timing field.');
    return integer(Number(value.slice(prefix.length)), label, MAX_WALL, signed ? -86400000 : 0);
  };
  const count = label => {
    const match = new RegExp(`^${label}: all ([0-9]+) of ([0-9]+)$`).exec(lines[index++]);
    check(match && match[1] === match[2], 'Exact timing-detail display is truncated.');
    return integer(Number(match[1]), 'complete displayed count', 64);
  };
  exact('Fixture timing details v1'); exact(`Package: ${FIXTURE}`);
  const context = { format: 'fixture_timing_details_v1', package_id: FIXTURE,
    session_start_wall_millis: number('Session start wall code'), session_start_elapsed_millis: number('Session start elapsed code'),
    query_cursor_wall_millis_exclusive: number('Query cursor wall code (exclusive)'), report_clock_wall_millis: number('Report clock wall code'),
    report_clock_elapsed_millis: number('Report clock elapsed code') };
  const zone = /^Displayed time zone: ([A-Za-z0-9_+./:-]{1,80})$/.exec(lines[index++]); check(zone, 'Missing displayed zone ID.');
  context.display_time_zone = zone[1]; context.report_clock_utc_offset_millis = number('Report clock UTC offset millis', true);
  context.events = Array.from({ length: count('Fixture transitions shown') }, () => {
    const match = /^Event: ([0-9]+) (RESUME|PAUSE)$/.exec(lines[index++]); check(match, 'Invalid exact event row.');
    return { timestamp_millis: integer(Number(match[1]), 'event timestamp'), type: match[2] };
  });
  context.closed_intervals = Array.from({ length: count('Fixture inferred intervals shown') }, () => {
    const match = /^Interval: ([0-9]+) ([0-9]+)$/.exec(lines[index++]); check(match, 'Invalid exact interval row.');
    return { start_inclusive: integer(Number(match[1]), 'interval start'), end_exclusive: integer(Number(match[2]), 'interval end') };
  });
  exact('Displayed time zone describes current formatting, not the source zone at event time.');
  exact('Coverage remains unknown; timing is unverified.'); check(index === lines.length, 'Unexpected extra timing-detail fields.');
  return context;
}

export function exactContextBlocks(xml) {
  check(typeof xml === 'string' && Buffer.byteLength(xml) <= 1048576 && !/<!/.test(xml)
    && !/<\?(?!xml\b)/.test(xml) && /<hierarchy\b/.test(xml) && /<\/hierarchy>\s*$/.test(xml), 'Unsupported or oversized owned UI XML.');
  const body = xml.replace(/^\s*<\?xml\s[^?]*\?>/, '').trim();
  const blocks = [], stack = []; let previous = 0, roots = 0, nodes = 0;
  for (const tag of body.matchAll(/<[^<>]+>/g)) {
    check(body.slice(previous, tag.index).trim() === '', 'Unexpected text outside UI XML attributes.');
    previous = tag.index + tag[0].length;
    if (['</node>', '</hierarchy>'].includes(tag[0])) {
      check(stack.pop() === tag[0].slice(2, -1), 'Unbalanced UI XML hierarchy.'); continue;
    }
    const match = /^<(node|hierarchy)\b([\s\S]*?)(\/?)>$/.exec(tag[0]);
    check(match, 'Unsupported UI XML element.');
    const attrs = {}; let cursor = 0;
    for (const attr of match[2].matchAll(/\s+([\w-]+)="([^"<>]*)"/g)) {
      check(match[2].slice(cursor, attr.index).trim() === '' && !Object.hasOwn(attrs, attr[1]), 'Malformed or duplicate UI XML attribute.');
      attrs[attr[1]] = decode(attr[2]); cursor = attr.index + attr[0].length;
    }
    check(match[2].slice(cursor).trim() === '', 'Malformed UI XML attribute tail.');
    if (match[1] === 'hierarchy') check(++roots === 1 && stack.length === 0 && match[3] === '', 'Invalid UI hierarchy root.');
    else {
      check(stack[0] === 'hierarchy' && ++nodes <= 2048, 'Excessive UI nodes or node outside hierarchy.');
      if (attrs.text?.startsWith('Fixture timing details v1')) {
        check(attrs.package === INSPECT && attrs.class === 'android.widget.TextView', 'Timing detail block is not an owned inspector text view.');
        blocks.push(parseContextText(attrs.text));
      }
    }
    if (match[3] === '') stack.push(match[1]);
  }
  check(previous === body.length && stack.length === 0 && roots === 1, 'Incomplete owned UI XML hierarchy.');
  return blocks;
}

export function deriveOwnedTiming(measurement) {
  const context = measurement.timing_context;
  const events = [...context.events].sort((a, b) => a.timestamp_millis - b.timestamp_millis);
  const origin = Math.min(measurement.start, ...events.map(event => event.timestamp_millis));
  const normalized = events.map(event => ({ offset_millis: event.timestamp_millis - origin, type: event.type }));
  const start = measurement.start - origin, end = measurement.end - origin;
  check(end <= MAX_OFFSET && normalized.every(event => event.offset_millis <= MAX_OFFSET), 'Trace exceeds the one-hour native replay offset bound.');
  const tsv = ['OAP_OWNED_REPLAY_V1', [normalized.length, start, end, measurement.duration].join('\t'),
    ...normalized.map(event => `${event.offset_millis}\t${event.type}`)].join('\n') + '\n';
  const groups = [];
  for (const event of events) {
    if (groups.at(-1)?.timestamp_millis === event.timestamp_millis) groups.at(-1).types.push(event.type);
    else groups.push({ timestamp_millis: event.timestamp_millis, types: [event.type] });
  }
  const separations = [];
  for (let index = 1; index < groups.length; index++) {
    const before = groups[index - 1], after = groups[index];
    if (before.types.length === 1 && after.types.length === 1 && before.types[0] === 'PAUSE' && after.types[0] === 'RESUME')
      separations.push({ pause_epoch_millis: before.timestamp_millis, resume_epoch_millis: after.timestamp_millis,
        duration_millis: after.timestamp_millis - before.timestamp_millis, attested_inactivity: false });
  }
  const intervals = [...context.closed_intervals].sort((a, b) => a.start_inclusive - b.start_inclusive);
  const intervalGaps = intervals.slice(1).map((interval, index) => ({ start_epoch_millis: intervals[index].end_exclusive,
    end_epoch_millis: interval.start_inclusive, duration_millis: interval.start_inclusive - intervals[index].end_exclusive,
    attested_inactivity: false })).filter(gap => gap.duration_millis > 0);
  return { tsv, summary: {
    scenario: measurement.scenario, entered_fixture_duration_millis: measurement.duration,
    fixture_window_start_epoch_millis: measurement.start, fixture_window_end_epoch_millis: measurement.end,
    fixture_wall_window_span_millis: measurement.end - measurement.start, retained_callback_count: measurement.callbacks,
    retained_candidate_duration_millis: measurement.candidate_duration_millis,
    signed_difference_millis: measurement.signed_difference_millis, comparison_status: measurement.comparison_status,
    estimates_discarded: measurement.estimates_discarded, discarded_estimate_reasons: measurement.discarded_estimate_reasons,
    exact_projected_event_count: events.length, exact_epoch_events: events,
    same_timestamp_groups: groups.filter(group => group.types.length > 1),
    unique_pause_resume_separations: separations, retained_inferred_interval_gaps: intervalGaps,
    exact_context_clipped_comparison_matches: true, source_context: context,
    replay_derivation: { format: 'OAP_OWNED_REPLAY_V1', origin_epoch_millis: origin,
      comparison_start_offset_millis: start, comparison_end_offset_millis: end,
      offsets_derived_from_exact_epoch_codes: true, timezone_mapping_assumed: false,
      host_replay_authorization_and_clock_synthetic: true, original_android_queries_replayed: false,
      original_os_query_batch_clocks_attested: false, query_cursor_elapsed_clock_available: false,
      native_replay_executed_by_this_tool: false },
    fixture_value_verified: false, source_coverage: 'unknown', production_accuracy_pass: false, oap_summary_eligible: false
  } };
}

async function analyze(reportName) {
  const sources = [], loaded = new Map();
  const load = async (name, expected = null, maxBytes = 2097152) => {
    const target = safeRelative(name); const resolved = await realpath(target);
    check(canonical(resolved) === canonical(target), 'Redirected evidence paths are unsupported.');
    const info = await stat(target); check(info.isFile() && info.size > 0 && info.size <= maxBytes, `Unsupported evidence file size: ${name}`);
    const bytes = await readFile(target); const digest = hash(bytes);
    check(bytes.length === info.size && (!expected || digest === expected), `Evidence changed or its bound hash differs: ${name}`);
    if (loaded.has(name)) check(hash(loaded.get(name)) === digest, 'Source changed between reads.');
    else { loaded.set(name, bytes); sources.push({ path: name, size_bytes: bytes.length, sha256: digest,
      existing_archive_hash_verified: Boolean(expected) }); }
    return bytes;
  };
  const reportBytes = await load(reportName); let report = validateOwnedTimingReport(parseJson(reportBytes));
  const preserved = report.evidence_preservation;
  const archive = preserved?.archive_path ?? (preserved?.raw_report ? path.posix.dirname(preserved.raw_report)
    : reportName.startsWith('artifacts/') ? path.posix.dirname(reportName) : null);
  let index = null;
  if (archive) {
    check(/^artifacts\/android-emulator-[a-z0-9.-]+$/.test(archive), 'Unsupported emulator archive path.');
    index = parseJson(await load(`${archive}/archive-index.json`));
    check(SHA.test(index.raw_report_sha256) && SHA.test(index.harness_sha256)
      && index.file_sha256 && typeof index.file_sha256 === 'object', 'Archive hash index is incomplete.');
    const rawBytes = await load(`${archive}/raw-validation.json`, index.raw_report_sha256);
    const raw = validateOwnedTimingReport(parseJson(rawBytes));
    if (preserved?.raw_report_sha256) check(preserved.raw_report_sha256 === hash(rawBytes), 'Frozen report differs from bound raw run.');
    check(raw.harness_sha256 === report.harness_sha256 && index.harness_sha256 === report.harness_sha256
      && raw.generated_at === report.generated_at && raw.finished_at === report.finished_at, 'Archive runtime identity differs.');
    const relocate = value => {
      if (Array.isArray(value)) return value.map(relocate);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, relocate(item)]));
      return typeof value === 'string' && value.startsWith('artifacts/android-emulator-test/')
        ? `${archive}/${value.slice('artifacts/android-emulator-test/'.length)}` : value;
    };
    same(relocate(raw.measurements), relocate(report.measurements), 'Frozen exact trial values differ from raw evidence beyond UI-path relocation.');
    report = { ...report, measurements: relocate(report.measurements) };
    const reportIndexHash = index.file_sha256?.[path.posix.basename(reportName)];
    if (reportName.startsWith(`${archive}/`) && reportIndexHash) check(reportIndexHash === hash(reportBytes), 'Archive report bytes differ from its index.');
  }
  const indexed = async name => {
    const expected = index && name.startsWith(`${archive}/`) ? index.file_sha256?.[path.posix.basename(name)] : null;
    if (index && name.startsWith(`${archive}/`)) check(SHA.test(expected), 'Referenced archive evidence has no index hash.');
    return load(name, expected);
  };
  const harnessName = archive ? `${archive}/harness-source.mjs` : 'scripts/test-android-emulator.mjs';
  await load(harnessName, report.harness_sha256);
  const startupName = archive ? `${archive}/run.json` : report.run_provenance.source;
  const startup = parseJson(await load(startupName, report.run_provenance.sha256));
  check(startup.serial === report.environment.serial && startup.name === report.environment.actual_avd
    && startup.api === report.environment.api && startup.image === report.run_provenance.image
    && startup.created_at === report.run_provenance.created_at, 'Actual startup record differs from runtime provenance.');
  const nativeName = archive ? `${archive}/native-validation.json` : 'docs/review/android-local-inspector-validation.json';
  const nativeBytes = await indexed(nativeName); const native = parseJson(nativeBytes);
  check(native.result === 'pass_with_device_limits' && native.scope === 'native_local_only_build_and_jvm_fixtures'
    && native.physical_device_tested_by_this_run === false && native.m2_proven === false && native.m3_proven === false,
  'Native audit scope or result is unsupported.');
  check(native.apk?.package_id === INSPECT && native.fixture_apk?.package_id === FIXTURE,
    'The native audit must bind both distinct owned application packages.');
  const apkBindings = [];
  for (const audited of [native.apk, native.fixture_apk]) {
    check(audited && [INSPECT, FIXTURE].includes(audited.package_id) && SHA.test(audited.sha256)
      && audited.internet_permission === false && audited.signature_verified === true, 'Missing local-only audited APK identity.');
    same(audited.permissions, audited.package_id === INSPECT ? ['android.permission.PACKAGE_USAGE_STATS'] : [], 'Unexpected audited app permissions.');
    const installed = report.installed_apks.find(apk => apk.package_id === audited.package_id);
    check(installed?.sha256 === audited.sha256 && installed.version_name === audited.version_name, 'Installed runtime APK differs from native audit.');
    check(/^artifacts\/android-local-inspector\/liveabit-[a-z0-9.-]+\.apk$/.test(audited.path), 'Unexpected audited APK path.');
    const name = archive ? `${archive}/${path.posix.basename(audited.path)}` : audited.path;
    const bytes = await load(name, audited.sha256, 10485760);
    check(bytes.length === audited.size_bytes, 'Audited APK size differs.');
    apkBindings.push({ package_id: audited.package_id, version_name: audited.version_name, path: name,
      sha256: hash(bytes), actual_bytes_hash_matches_installed_audited_claim: true,
      cryptographic_authentication_of_runtime_report: false });
  }
  const nativeBindings = [];
  for (const name of CORE_SOURCES) {
    const auditedHash = native.source_sha256?.[name]; check(SHA.test(auditedHash), 'Native audit lacks a core source identity.');
    const bytes = await load(name);
    nativeBindings.push({ path: name, current_source_sha256: hash(bytes), audited_source_sha256: auditedHash,
      current_source_bytes_match_audited_hash: hash(bytes) === auditedHash, native_replay_executed: false });
  }
  const trials = [];
  for (const measurement of report.measurements) {
    let completeBlocks = 0;
    for (const name of measurement.timing_context.ui) {
      const bytes = await indexed(name);
      for (const block of exactContextBlocks(bytes.toString('utf8'))) {
        same(block, evidenceFields(measurement.timing_context), 'Displayed exact context differs from structured runtime evidence.'); completeBlocks++;
      }
    }
    check(completeBlocks > 0, 'No complete exact numeric context appears in bound UI evidence.');
    const derived = deriveOwnedTiming(measurement); trials.push({ ...derived, complete_bound_ui_blocks: completeBlocks });
  }
  const checks = runTimingAnalysisSelfTests();
  await load('scripts/analyze-android-timing.mjs'); await load('tools/android-inspection-replay/InspectionReplay.java');
  for (const source of sources) check(hash(await readFile(safeRelative(source.path))) === source.sha256, 'Bound source changed during analysis.');
  const artifactBase = safeRelative('artifacts/android-timing-analysis');
  const artifacts = safeRelative('artifacts'); check(canonical(await realpath(artifacts)) === canonical(artifacts), 'Redirected artifact directory is unsupported.');
  await mkdir(artifactBase, { recursive: true });
  check(canonical(await realpath(artifactBase)) === canonical(artifactBase), 'Redirected analysis output is unsupported.');
  const runDir = path.join(artifactBase, `run-${randomUUID()}`); await mkdir(runDir);
  await writeFile(path.join(runDir, 'source-report.json'), reportBytes, { flag: 'wx' });
  await writeFile(path.join(runDir, 'native-audit.json'), nativeBytes, { flag: 'wx' });
  const summaries = [];
  for (let index = 0; index < trials.length; index++) {
    const trial = trials[index]; const filename = `${String(index + 1).padStart(2, '0')}-${trial.summary.scenario}.tsv`;
    await writeFile(path.join(runDir, filename), trial.tsv, { flag: 'wx' });
    summaries.push({ ...trial.summary, complete_bound_ui_blocks: trial.complete_bound_ui_blocks,
      replay_input_path: relative(path.join(runDir, filename)), replay_input_sha256: hash(Buffer.from(trial.tsv)) });
  }
  const summary = {
    result: 'completed_owned_fixture_timing_analysis', generated_at: new Date().toISOString(),
    scope: 'offline_exact_numeric_owned_fixture_evidence', device_accessed: false, network_accessed: false,
    apk_rebuilt: false, native_replay_executed: false, inference_policy_changed: false,
    source_report: { path: reportName, sha256: hash(reportBytes), exact_copy_path: relative(path.join(runDir, 'source-report.json')),
      local_hash_binding_only: true, cryptographically_authenticated: false },
    runtime_environment: report.environment, sources, apk_bindings: apkBindings, native_source_bindings: nativeBindings,
    sample_counts: { trials: summaries.length, numerical_unverified: summaries.filter(trial => trial.comparison_status === 'known_unverified_estimate').length,
      partial_unverified: summaries.filter(trial => trial.comparison_status === 'known_partial_unverified_estimate').length,
      unknown: summaries.filter(trial => trial.comparison_status === 'unknown').length },
    by_scenario: Object.fromEntries(['idle', 'screen_handoffs'].map(scenario => [scenario, {
      sample_count: summaries.filter(trial => trial.scenario === scenario).length,
      observed_signed_differences_millis: summaries.filter(trial => trial.scenario === scenario).map(trial => trial.signed_difference_millis),
      observed_discarded_reason_counts: Object.fromEntries(REASONS.map(reason => [reason,
        summaries.filter(trial => trial.scenario === scenario && trial.discarded_estimate_reasons.includes(reason)).length])) }])),
    trials: summaries, validation_self_tests: checks, source_coverage: 'unknown', fixture_value_verified: false,
    physical_android_verified: false, production_accuracy_pass: false, quality_threshold_defined: false,
    m2_verified: false, m3_verified: false, oap_summary_eligible: false,
    limitations: [
      'These samples describe the owned synthetic fixture and do not establish other-app, phone/OEM, or production timing accuracy.',
      'Fixture codes are manually entered values; local file hashes bind evidence bytes without authenticating an Android runtime report.',
      'Exact source session/report anchors are recorded; the elapsed clock at the query cursor and original OS-query batch clocks remain unavailable.',
      'Replay offsets use exact epoch codes. The native replay runner supplies synthetic consent/query boundaries and paired host clock values.',
      'Current formatting zone/offset describe the report clock and do not attest the source zone at event time.',
      'Pause/resume separations and gaps between retained intervals do not attest inactivity or complete usage; no gap is filled.',
      'Unknown durations stay unknown. Small observed samples have no quality threshold, accuracy pass, lower-bound interpretation, or OAP eligibility.'
    ]
  };
  await writeFile(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ result: summary.result, trials: summaries.length, sample_counts: summary.sample_counts,
    summary_path: relative(path.join(runDir, 'summary.json')) }));
  return summary;
}

function sampleReport() {
  const context = { format: 'fixture_timing_details_v1', package_id: FIXTURE,
    session_start_wall_millis: 1000000, session_start_elapsed_millis: 1000,
    query_cursor_wall_millis_exclusive: 1020000, report_clock_wall_millis: 1021000, report_clock_elapsed_millis: 22000,
    display_time_zone: 'Etc/UTC', report_clock_utc_offset_millis: 0,
    events: [{ timestamp_millis: 1018000, type: 'PAUSE' }, { timestamp_millis: 1010000, type: 'RESUME' },
      { timestamp_millis: 1008000, type: 'PAUSE' }, { timestamp_millis: 1002000, type: 'RESUME' }],
    closed_intervals: [{ start_inclusive: 1010000, end_exclusive: 1018000 }, { start_inclusive: 1002000, end_exclusive: 1008000 }],
    complete_displayed_fixture_records: true, owned_fixture_only: true, source_coverage_unknown: true,
    original_os_query_batch_clocks_attested: false, query_cursor_elapsed_clock_available: false,
    display_time_zone_at_report_only: true, synthetic_clock_envelope: false, physical_android_verified: false,
    production_accuracy_pass: false, ui: ['artifacts/android-emulator-self-test/0001-fixture-comparison.xml'] };
  return { result: 'pass_with_emulator_limits', scope: 'dedicated_owned_emulator_runtime_ui',
    generated_at: '2026-10-07T07:00:00.000Z', finished_at: '2026-10-07T08:00:00.000Z',
    environment: { serial: 'emulator-5580', api: 35, expected_avd: 'liveabit-api35-test', actual_avd: 'liveabit-api35-test',
      qemu_verified: true, account_free_verified: true, abi: 'x86_64', build_fingerprint: 'owned-synthetic-test',
      guest_time_zone_property: 'Etc/UTC', guest_time_zone_property_source: 'read_only_getprop_persist.sys.timezone' },
    harness_sha256: 'a'.repeat(64), summary: { passed: 10, failed: 0, known_comparisons: 1, partial_comparisons: 0 }, cases: CASES.map(name => ({ name, result: 'pass' })),
    run_provenance: { source: 'artifacts/android-emulator/run.json', sha256: 'd'.repeat(64), api: 35,
      image: 'system-images;android-35;default;x86_64', freshness_verified: true, installed_tool_properties_match: true,
      avd_path: 'artifacts/android-emulator/avd/liveabit-api35-test.avd', created_at: '2026-10-07T06:58:00.000Z' },
    physical_android_verified: false, measured_production_accuracy_verified: false, m2_verified: false, m3_verified: false,
    installed_apks: [{ package_id: INSPECT, version_name: '0.2.3-local', sha256: 'b'.repeat(64), exact_audited_bytes_verified: true },
      { package_id: FIXTURE, version_name: '0.1.0-fixture', sha256: 'c'.repeat(64), exact_audited_bytes_verified: true }],
    measurements: [{ scenario: 'screen_handoffs', start: 1003000, end: 1017000, duration: 12000, callbacks: 12,
      retained_transitions: 4, comparison_status: 'known_unverified_estimate', estimates_discarded: false,
      partial_estimate_warning_verified: false, discarded_estimate_reasons: [], candidate_duration_millis: 12000,
      signed_difference_millis: 0, production_accuracy_pass: false, exact_context_clipped_comparison_matches: true,
      timing_context: context }] };
}

export function runTimingAnalysisSelfTests() {
  const report = sampleReport(); validateOwnedTimingReport(report);
  const derived = deriveOwnedTiming(report.measurements[0]);
  check(derived.tsv === 'OAP_OWNED_REPLAY_V1\n4\t1000\t15000\t12000\n0\tRESUME\n6000\tPAUSE\n8000\tRESUME\n16000\tPAUSE\n', 'Exact epoch normalization changed.');
  check(derived.summary.unique_pause_resume_separations[0].duration_millis === 2000
    && derived.summary.retained_inferred_interval_gaps[0].duration_millis === 2000
    && clippedUnion(report.measurements[0].timing_context.closed_intervals, 1003000, 1017000) === 12000,
  'A returned separation or retained interval gap was filled.');
  const mutations = [
    ['physical_target', value => { value.environment.serial = 'phone'; }],
    ['api36_wrong_serial', value => { value.environment.api = 36; value.environment.expected_avd = 'liveabit-api36-test'; value.environment.actual_avd = 'liveabit-api36-test'; }],
    ['unconfigured_api37_profile', value => { value.environment.api = 37; value.environment.expected_avd = 'liveabit-api37-test'; value.environment.actual_avd = 'liveabit-api37-test'; }],
    ['accounts_present', value => { value.environment.account_free_verified = false; }],
    ['running_report', value => { value.result = 'running'; }],
    ['failed_case', value => { value.cases[0].result = 'fail'; }],
    ['stale_startup', value => { value.run_provenance.created_at = '2026-10-06T06:58:00.000Z'; }],
    ['missing_numeric_context', value => { delete value.measurements[0].timing_context; }],
    ['truncated_context', value => { value.measurements[0].timing_context.complete_displayed_fixture_records = false; }],
    ['foreign_package', value => { value.measurements[0].timing_context.package_id = 'com.private.other'; }],
    ['event_private_fields', value => { value.measurements[0].timing_context.events[0].package_name = 'private'; }],
    ['context_activity_class', value => { value.measurements[0].timing_context.activity_class = 'private'; }],
    ['context_invented_query_elapsed', value => { value.measurements[0].timing_context.query_cursor_elapsed_millis = 12345; }],
    ['nested_context_private_fields', value => { value.cases[4].details = { repeated_timing_context: structuredClone(value.measurements[0].timing_context) };
      value.cases[4].details.repeated_timing_context.activity_class = 'private'; }],
    ['event_outside_cursor', value => { value.measurements[0].timing_context.events[0].timestamp_millis = 1020000; }],
    ['unpaired_clock', value => { value.measurements[0].timing_context.report_clock_elapsed_millis = 50000; }],
    ['zone_mismatch', value => { value.measurements[0].timing_context.display_time_zone = 'America/Los_Angeles'; }],
    ['wrong_difference', value => { value.measurements[0].signed_difference_millis = 1; }],
    ['unjustified_partial', value => { value.measurements[0].estimates_discarded = true; }],
    ['false_accuracy_pass', value => { value.measurements[0].production_accuracy_pass = true; }],
    ['unsupported_event_type', value => { value.measurements[0].timing_context.events[0].type = 'CLICK'; }],
    ['escaping_ui_path', value => { value.measurements[0].timing_context.ui[0] = '../private.xml'; }],
    ['interval_window_mismatch', value => { value.measurements[0].timing_context.closed_intervals[0].start_inclusive = 1011000; }]
  ];
  const rejections = mutations.map(([name, mutate]) => {
    const changed = structuredClone(report); mutate(changed); let rejected = false;
    try { validateOwnedTimingReport(changed); } catch { rejected = true; }
    check(rejected, `Invalid self-test evidence accepted: ${name}`); return { name, rejected: true };
  });
  const unknown = structuredClone(report); const trial = unknown.measurements[0];
  trial.timing_context.closed_intervals = []; trial.candidate_duration_millis = null;
  trial.signed_difference_millis = null; trial.comparison_status = 'unknown'; unknown.summary.known_comparisons = 0; validateOwnedTimingReport(unknown);
  check(deriveOwnedTiming(trial).summary.retained_candidate_duration_millis === null, 'Unknown estimate became zero.');
  const repeated = structuredClone(report); const repeatedTrial = repeated.measurements[0];
  repeatedTrial.timing_context.events.push({ timestamp_millis: 1002000, type: 'RESUME' });
  repeatedTrial.timing_context.closed_intervals = [{ start_inclusive: 1010000, end_exclusive: 1018000 }];
  repeatedTrial.retained_transitions = 5; repeatedTrial.candidate_duration_millis = 7000;
  repeatedTrial.signed_difference_millis = -5000; repeatedTrial.estimates_discarded = true;
  repeatedTrial.partial_estimate_warning_verified = true; repeatedTrial.discarded_estimate_reasons = [...REASONS];
  repeatedTrial.comparison_status = 'known_partial_unverified_estimate'; repeated.summary.partial_comparisons = 1;
  validateOwnedTimingReport(repeated); const repeatedDerived = deriveOwnedTiming(repeatedTrial);
  check(repeatedDerived.summary.exact_projected_event_count === 5
    && repeatedDerived.summary.same_timestamp_groups.length === 1
    && repeatedDerived.summary.same_timestamp_groups[0].types.join(',') === 'RESUME,RESUME'
    && repeatedDerived.tsv.split('\n').filter(line => line === '0\tRESUME').length === 2
    && repeatedDerived.summary.retained_candidate_duration_millis === 7000,
  'Repeated epoch/type source multiplicity was dropped or reinterpreted as a closed estimate.');
  const api36 = structuredClone(report); api36.environment.api = 36; api36.environment.serial = 'emulator-5582';
  api36.environment.expected_avd = api36.environment.actual_avd = 'liveabit-api36-test';
  api36.run_provenance.api = 36; api36.run_provenance.image = 'system-images;android-36;default;x86_64';
  api36.run_provenance.avd_path = 'artifacts/android-emulator/avd/liveabit-api36-test.avd'; validateOwnedTimingReport(api36);
  const context = report.measurements[0].timing_context;
  const text = ['Fixture timing details v1', `Package: ${FIXTURE}`,
    `Session start wall code: ${context.session_start_wall_millis}`, `Session start elapsed code: ${context.session_start_elapsed_millis}`,
    `Query cursor wall code (exclusive): ${context.query_cursor_wall_millis_exclusive}`, `Report clock wall code: ${context.report_clock_wall_millis}`,
    `Report clock elapsed code: ${context.report_clock_elapsed_millis}`, `Displayed time zone: ${context.display_time_zone}`,
    `Report clock UTC offset millis: ${context.report_clock_utc_offset_millis}`, `Fixture transitions shown: all ${context.events.length} of ${context.events.length}`,
    ...context.events.map(event => `Event: ${event.timestamp_millis} ${event.type}`),
    `Fixture inferred intervals shown: all ${context.closed_intervals.length} of ${context.closed_intervals.length}`,
    ...context.closed_intervals.map(interval => `Interval: ${interval.start_inclusive} ${interval.end_exclusive}`),
    'Displayed time zone describes current formatting, not the source zone at event time.', 'Coverage remains unknown; timing is unverified.'].join('\n');
  const xml = `<hierarchy rotation="0"><node package="${INSPECT}" class="android.widget.TextView" text="${text.replaceAll('\n', '&#10;')}" /></hierarchy>`;
  same(exactContextBlocks(xml), [evidenceFields(context)], 'Exact structured context did not match owned UI XML.');
  const invalidXml = [xml.replace(INSPECT, 'com.private.other'), xml.replace('all 4 of 4', 'latest 4 of 7'),
    xml.replace('</hierarchy>', '</node></hierarchy>'), xml.replace('text="', 'text="" text="'),
    xml.replace('&#10;', '&private;'), `<!DOCTYPE hierarchy>${xml}`];
  invalidXml.forEach(value => {
    let rejected = false; try { exactContextBlocks(value); } catch { rejected = true; }
    check(rejected, 'Malformed or foreign owned UI XML accepted.');
  });
  return { result: 'pass_input_validation_self_tests_only', invalid_reports_rejected: rejections,
    malformed_or_foreign_ui_rejected: invalidXml.length, exact_numeric_ui_matches_structured_context: true,
    exact_epoch_normalization_verified: true, pause_gap_preserved: true, unknown_preserved: true,
    repeated_epoch_type_multiplicity_preserved: true, no_new_estimates_attested_from_multiplicity: true,
    configured_api36_profile_validation_only: true, api37_availability_claimed: false,
    device_accessed: false, production_accuracy_pass: false };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('node scripts/analyze-android-timing.mjs --report docs/review/android-emulator-0.2.3-validation.json\nnode scripts/analyze-android-timing.mjs --self-test\nRequires completed owned-emulator evidence with exact numeric fixture context. Outputs a new immutable folder under artifacts/android-timing-analysis. No Android or network access.'); return;
  }
  if (args.length === 1 && args[0] === '--self-test') { console.log(JSON.stringify(runTimingAnalysisSelfTests(), null, 2)); return; }
  check(args.length === 2 && args[0] === '--report' && (/^docs\/review\/android-emulator-[a-z0-9.-]+-validation\.json$/.test(args[1])
    || /^artifacts\/android-emulator-[a-z0-9.-]+\/(?:raw-)?validation\.json$/.test(args[1])),
  'Use --report with an owned emulator review/archive JSON path, or --self-test.');
  await analyze(args[1]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
