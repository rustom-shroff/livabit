// Host-only native regression replay of completed, exact owned-fixture timing evidence.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { deriveOwnedTiming, validateOwnedTimingReport } from './analyze-android-timing.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const FIXTURE = 'org.liveabit.fixture', INSPECT = 'org.liveabit.inspect';
const SHA = /^[a-f0-9]{64}$/;
const RUN_PATH = /^artifacts\/android-timing-analysis\/run-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/summary\.json$/;
const CORE = ['android/collector-core/src/main/java/org/liveabit/collector/core/LocalInspectionCore.java',
  'android/collector-core/src/main/java/org/liveabit/collector/core/FixtureComparison.java'];
const RUNNER = 'tools/android-inspection-replay/InspectionReplay.java';
const ANALYZER = 'scripts/analyze-android-timing.mjs';
const TOOL = 'scripts/replay-android-timing-analysis.mjs';
const REASON_MAP = {
  ambiguous_same_timestamp_transitions: 'Several transitions share one time; earlier estimates were discarded.',
  unmatched_pause_invalidates_prior_estimates: 'A pause has no known matching resume; earlier estimates were discarded.'
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (ok, message) => { if (!ok) throw new Error(message); };
const same = (left, right, message) => check(JSON.stringify(left) === JSON.stringify(right), message);
const json = bytes => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
const canonical = value => path.resolve(value).toLowerCase();
const relative = value => path.relative(ROOT, value).split(path.sep).join('/');

function safePath(name) {
  check(typeof name === 'string' && name.length <= 260 && /^[A-Za-z0-9_.+\/-]+$/.test(name)
    && !name.startsWith('/') && !name.split('/').some(part => ['', '.', '..'].includes(part)), 'Only bounded project-relative paths are allowed.');
  const resolved = path.resolve(ROOT, name);
  check(canonical(resolved).startsWith(canonical(ROOT) + path.sep), 'Replay path escapes the project.');
  return resolved;
}

function execute(executable, args, input) {
  const result = spawnSync(executable, args, { cwd: ROOT, input, encoding: 'utf8', shell: false,
    timeout: 60000, maxBuffer: 2097152, windowsHide: true });
  if (result.error) throw result.error;
  return result;
}

export function validateCapturedReplay(replay, trial) {
  check(replay?.schema === 'OAP_OWNED_REPLAY_RESULT_V1' && replay.package_name === FIXTURE
    && replay.replay_kind === 'host_only_actual_native_core_with_synthetic_authority_and_clock'
    && replay.synthetic_clock?.actual_android_query_replayed === false
    && replay.synthetic_clock.clock_deltas_paired === true, 'Native runner scope or synthetic-clock limitation differs.');
  const result = replay.result, comparison = result?.comparison;
  check(result && comparison && result.coverage_unknown === true && result.physical_android_verified === false
    && result.oap_summary_eligible === false && result.duration_verified === false && comparison.coverage_unknown === true
    && comparison.physical_android_verified === false && comparison.physical_device_tested === false
    && comparison.oap_summary_eligible === false && comparison.fixture_value_verified === false
    && comparison.duration_verified === false, 'Native replay lost an unverified-evidence flag.');
  check(result.retained_event_count === trial.exact_projected_event_count
    && comparison.candidate_duration_millis === trial.retained_candidate_duration_millis
    && comparison.signed_difference_millis === trial.signed_difference_millis
    && comparison.fixture_duration_millis === trial.entered_fixture_duration_millis
    && comparison.status === (trial.retained_candidate_duration_millis === null ? 'UNKNOWN' : 'KNOWN_ESTIMATE'),
  'Native retained count, comparison duration, difference or unknown status differs from captured evidence.');
  const origin = trial.replay_derivation.origin_epoch_millis;
  const expectedIntervals = trial.source_context.closed_intervals.map(interval => ({
    start_offset_millis: interval.start_inclusive - origin, end_offset_millis: interval.end_exclusive - origin,
    duration_millis: interval.end_exclusive - interval.start_inclusive
  })).sort((left, right) => left.start_offset_millis - right.start_offset_millis);
  same(result.intervals, expectedIntervals, 'Native retained intervals differ from the exact captured interval codes.');
  const expectedDuration = expectedIntervals.length ? expectedIntervals.reduce((total, interval) => total + interval.duration_millis, 0) : null;
  check(result.estimated_duration_millis === expectedDuration, 'Native full retained sum differs from captured closed intervals.');
  check(Array.isArray(result.reasons), 'Native diagnostic reasons are absent.');
  const discardReasons = result.reasons.filter(reason => Object.hasOwn(REASON_MAP, reason)).map(reason => REASON_MAP[reason]);
  same([...discardReasons].sort(), [...trial.discarded_estimate_reasons].sort(), 'Native discarded-estimate reasons differ.');
  check((discardReasons.length > 0) === trial.estimates_discarded, 'Native partial/unknown interpretation differs.');
  const checks = replay.checks;
  for (const name of ['same_time_permutations', 'complete_group_query_partition', 'genuine_pause_gap_no_fill'])
    check(checks?.[name]?.passed === true, `Missing native metamorphic check: ${name}`);
  check(checks.same_time_permutations.ordering_is_not_trusted === true
    && checks.same_time_permutations.multi_record_groups === trial.same_timestamp_groups.length,
  'Native timestamp-group multiplicity or ordering limitation differs.');
  check(checks.complete_group_query_partition.actual_android_query_partition_verified === false
    && checks.complete_group_query_partition.same_timestamp_group_never_split === true
    && checks.complete_group_query_partition.strategies?.length === 3
    && checks.complete_group_query_partition.strategies.every(strategy => strategy.passed === true),
  'Native complete-group partition checks are incomplete or overclaim Android query verification.');
  check(checks.genuine_pause_gap_no_fill.synthetic_check_only === true, 'Synthetic pause-gap check was represented as device evidence.');
  return { captured_clipped_comparison_reproduced: true, captured_exact_intervals_reproduced: true,
    captured_event_multiplicity_reproduced: true, native_metamorphic_checks_passed: true,
    retained_trace_status: expectedDuration === null ? 'unknown' : trial.estimates_discarded ? 'partial_unverified' : 'numerical_unverified',
    comparison_status: trial.comparison_status, production_accuracy_pass: false, source_coverage: 'unknown',
    original_android_queries_replayed: false, host_replay_authorization_and_clock_synthetic: true };
}

async function run(analysisName) {
  const bound = new Map();
  const load = async (name, expected = null, max = 2097152) => {
    const target = safePath(name);
    check(canonical(await realpath(target)) === canonical(target), 'Redirected replay inputs are unsupported.');
    const info = await stat(target); check(info.isFile() && info.size > 0 && info.size <= max, `Unsupported replay input size: ${name}`);
    const bytes = await readFile(target); const digest = hash(bytes);
    check(info.size === bytes.length && (!expected || digest === expected), `Bound replay input differs: ${name}`);
    if (bound.has(name)) check(bound.get(name).sha256 === digest, 'Replay input changed between reads.');
    else bound.set(name, { path: name, size_bytes: bytes.length, sha256: digest, bytes });
    return bytes;
  };
  const analysisBytes = await load(analysisName); const analysis = json(analysisBytes);
  check(analysis.result === 'completed_owned_fixture_timing_analysis' && analysis.scope === 'offline_exact_numeric_owned_fixture_evidence'
    && analysis.device_accessed === false && analysis.network_accessed === false && analysis.apk_rebuilt === false
    && analysis.native_replay_executed === false && analysis.inference_policy_changed === false
    && analysis.production_accuracy_pass === false && analysis.fixture_value_verified === false
    && analysis.source_coverage === 'unknown' && analysis.physical_android_verified === false
    && analysis.m2_verified === false && analysis.m3_verified === false && analysis.oap_summary_eligible === false,
  'A completed unverified owned-fixture analysis is required.');
  check(analysis.source_report?.local_hash_binding_only === true && analysis.source_report.cryptographically_authenticated === false
    && SHA.test(analysis.source_report.sha256), 'Analysis source-report hash binding is missing or overclaimed.');
  const directory = path.posix.dirname(analysisName);
  check(analysis.source_report.exact_copy_path === `${directory}/source-report.json`, 'Source report copy is outside this immutable analysis run.');
  const sourceReport = validateOwnedTimingReport(json(await load(analysis.source_report.exact_copy_path, analysis.source_report.sha256)));
  same(analysis.runtime_environment, sourceReport.environment, 'Analysis runtime environment differs from its bound source report.');
  check(Array.isArray(analysis.sources) && analysis.sources.length > 0 && analysis.sources.length <= 128, 'Analysis source manifest is missing or excessive.');
  const sourceMap = new Map();
  for (const source of analysis.sources) {
    check(source && Object.keys(source).sort().join(',') === 'existing_archive_hash_verified,path,sha256,size_bytes'
      && SHA.test(source.sha256) && Number.isSafeInteger(source.size_bytes) && source.size_bytes > 0
      && typeof source.existing_archive_hash_verified === 'boolean' && !sourceMap.has(source.path), 'Malformed or repeated analysis source binding.');
    const bytes = await load(source.path, source.sha256, source.path.endsWith('.apk') ? 10485760 : 2097152);
    check(bytes.length === source.size_bytes, 'Analysis source size differs.'); sourceMap.set(source.path, source);
  }
  check(sourceMap.get(analysis.source_report.path)?.sha256 === analysis.source_report.sha256,
    'Source report is not bound in the analysis manifest.');
  for (const name of [ANALYZER, RUNNER]) check(sourceMap.has(name), 'Analysis lacks its analyzer/native runner source identity.');
  check(Array.isArray(analysis.native_source_bindings) && analysis.native_source_bindings.length === 2, 'Native source bindings are incomplete.');
  for (const name of CORE) {
    const binding = analysis.native_source_bindings.find(value => value.path === name);
    check(binding && binding.current_source_bytes_match_audited_hash === true && binding.native_replay_executed === false
      && SHA.test(binding.audited_source_sha256) && binding.current_source_sha256 === binding.audited_source_sha256
      && sourceMap.get(name)?.sha256 === binding.audited_source_sha256,
    'Current native source must equal the analysis audit; reanalyze a changed core before replay.');
    await load(name, binding.audited_source_sha256);
  }
  const nativeAuditSources = analysis.sources.filter(source => /(?:native-validation|android-local-inspector-validation)\.json$/.test(source.path));
  check(nativeAuditSources.length === 1, 'Native audit source identity is ambiguous.');
  const native = json(await load(`${directory}/native-audit.json`, nativeAuditSources[0].sha256));
  check(native.result === 'pass_with_device_limits' && native.scope === 'native_local_only_build_and_jvm_fixtures'
    && native.apk?.package_id === INSPECT && native.fixture_apk?.package_id === FIXTURE
    && native.apk.internet_permission === false && native.fixture_apk.internet_permission === false,
  'Bound native audit is not the two local-only owned APKs.');
  same(native.apk.permissions, ['android.permission.PACKAGE_USAGE_STATS'], 'Inspector manifest permission scope differs.');
  same(native.fixture_apk.permissions, [], 'Fixture manifest permission scope differs.');
  for (const name of CORE) check(native.source_sha256?.[name] === sourceMap.get(name).sha256, 'Bound native audit source identity differs.');
  check(Array.isArray(analysis.apk_bindings) && analysis.apk_bindings.length === 2, 'APK byte bindings are incomplete.');
  for (const audited of [native.apk, native.fixture_apk]) {
    const binding = analysis.apk_bindings.find(value => value.package_id === audited.package_id);
    check(binding && binding.sha256 === audited.sha256 && binding.version_name === audited.version_name
      && binding.actual_bytes_hash_matches_installed_audited_claim === true
      && binding.cryptographic_authentication_of_runtime_report === false
      && sourceMap.get(binding.path)?.sha256 === audited.sha256, 'Exact audited APK byte binding differs.');
  }
  check(Array.isArray(analysis.trials) && analysis.trials.length === sourceReport.measurements.length
    && analysis.trials.length > 0 && analysis.trials.length <= 32, 'Analysis trial count differs from source evidence.');
  const inputs = [];
  for (let index = 0; index < analysis.trials.length; index++) {
    const trial = analysis.trials[index]; const expected = deriveOwnedTiming(sourceReport.measurements[index]);
    same(Object.keys(trial).sort(), [...Object.keys(expected.summary), 'complete_bound_ui_blocks', 'replay_input_path', 'replay_input_sha256'].sort(),
      'Unexpected or missing timing-analysis trial fields.');
    same(trial.source_context.ui.map(value => path.posix.basename(value)), expected.summary.source_context.ui.map(value => path.posix.basename(value)),
      'Analysis UI identity differs beyond archive-path relocation.');
    expected.summary.source_context = { ...expected.summary.source_context, ui: trial.source_context.ui };
    for (const [name, value] of Object.entries(expected.summary)) same(trial[name], value, `Analysis trial derivation differs: ${name}`);
    check(trial.source_context.ui.every(name => sourceMap.has(name)) && Number.isInteger(trial.complete_bound_ui_blocks)
      && trial.complete_bound_ui_blocks > 0 && trial.complete_bound_ui_blocks <= 2048, 'Bound complete numeric UI evidence is missing.');
    const inputName = `${directory}/${String(index + 1).padStart(2, '0')}-${trial.scenario}.tsv`;
    check(trial.replay_input_path === inputName && SHA.test(trial.replay_input_sha256), 'Replay TSV path or hash differs.');
    const input = await load(inputName, trial.replay_input_sha256, 16384);
    check(input.toString('ascii') === expected.tsv && input.length === Buffer.byteLength(expected.tsv, 'ascii'),
      'Replay TSV does not preserve the exact bound epoch/type multiplicity and comparison codes.');
    inputs.push({ trial, input, sha256: hash(input) });
  }
  const jdkRoot = 'artifacts/android-tools/jdk/jdk-17.0.20.1+1';
  const javaName = `${jdkRoot}/bin/${process.platform === 'win32' ? 'java.exe' : 'java'}`;
  const javacName = `${jdkRoot}/bin/${process.platform === 'win32' ? 'javac.exe' : 'javac'}`;
  const releaseName = `${jdkRoot}/release`;
  const javaBytes = await load(javaName, null, 10485760), javacBytes = await load(javacName, null, 10485760);
  const releaseBytes = await load(releaseName);
  check(/^JAVA_VERSION="17\.0\.20\.1"\s*$/m.test(releaseBytes.toString('utf8')), 'Installed JDK differs from the pinned version.');
  const compilerVersion = execute(safePath(javacName), ['-version']);
  const runtimeVersion = execute(safePath(javaName), ['-version']);
  check(compilerVersion.status === 0 && runtimeVersion.status === 0
    && /17\.0\.20\.1/.test(compilerVersion.stdout + compilerVersion.stderr)
    && /17\.0\.20\.1/.test(runtimeVersion.stdout + runtimeVersion.stderr), 'Pinned JDK executable versions were not verified.');
  await load(TOOL);
  const runDir = path.join(safePath(directory), `native-replay-${randomUUID()}`); await mkdir(runDir);
  const sourceDir = path.join(runDir, 'source'), classes = path.join(runDir, 'classes');
  await mkdir(sourceDir); await mkdir(classes);
  const compileSources = [];
  for (const name of [...CORE, RUNNER]) {
    const target = path.join(sourceDir, path.posix.basename(name));
    await writeFile(target, bound.get(name).bytes, { flag: 'wx' }); compileSources.push(target);
  }
  const compiled = execute(safePath(javacName), ['-encoding', 'UTF-8', '--release', '17', '-d', classes, ...compileSources]);
  check(compiled.status === 0, `Current native replay compilation failed: ${compiled.stderr}`);
  const results = [];
  for (let index = 0; index < inputs.length; index++) {
    const { trial, input, sha256 } = inputs[index];
    const execution = execute(safePath(javaName), ['-ea', '-cp', classes, 'InspectionReplay'], input);
    check(execution.status === 0 && execution.stderr.trim() === '', `Current native replay failed for ${trial.scenario}: ${execution.stderr}`);
    const replay = JSON.parse(execution.stdout); const interpretation = validateCapturedReplay(replay, trial);
    const normalized = trial.exact_epoch_events.map(event => ({ offset: event.timestamp_millis - trial.replay_derivation.origin_epoch_millis, type: event.type }));
    same(replay.input?.events, normalized, 'Native runner input multiplicity differs from the exact captured trace.');
    const filename = `${String(index + 1).padStart(2, '0')}-${trial.scenario}-result.json`;
    const serialized = JSON.stringify(replay, null, 2) + '\n'; await writeFile(path.join(runDir, filename), serialized, { flag: 'wx' });
    results.push({ scenario: trial.scenario, input_path: trial.replay_input_path, input_sha256: sha256,
      result_path: relative(path.join(runDir, filename)), result_sha256: hash(Buffer.from(serialized)), interpretation, replay });
  }
  const invalidInputs = [
    ['foreign_format', 'OAP_OTHER_REPLAY_V1\n0\t0\t10\t0\n'],
    ['fractional_time', 'OAP_OWNED_REPLAY_V1\n1\t0\t10\t0\n0.5\tRESUME\n'],
    ['foreign_event_type', 'OAP_OWNED_REPLAY_V1\n1\t0\t10\t0\n0\tcom.private.other\n'],
    ['excessive_event_count', 'OAP_OWNED_REPLAY_V1\n65\t0\t10\t0\n']
  ];
  const rejections = invalidInputs.map(([name, input]) => {
    const execution = execute(safePath(javaName), ['-ea', '-cp', classes, 'InspectionReplay'], input);
    check(execution.status !== 0 && execution.stdout.trim() === '', `Malformed native replay input accepted: ${name}`);
    return { name, rejected: true };
  });
  for (const source of bound.values()) check(hash(await readFile(safePath(source.path))) === source.sha256, 'Source changed while replay ran; this run is incomplete.');
  const summary = {
    result: 'pass_owned_exact_trace_native_regression', generated_at: new Date().toISOString(),
    scope: 'current_native_core_replay_with_synthetic_authorization_and_clock', device_accessed: false, network_accessed: false,
    apk_rebuilt: false, inference_policy_changed: false, current_native_source_equals_analysis_audit: true,
    analysis_source: { path: analysisName, sha256: hash(analysisBytes), local_hash_binding_only: true, cryptographically_authenticated: false },
    current_native_source_sha256: Object.fromEntries([...CORE, RUNNER].map(name => [name, bound.get(name).sha256])),
    bound_source_sha256: Object.fromEntries([...bound].map(([name, source]) => [name, source.sha256])),
    jdk: { version: '17.0.20.1', compiler_executable_path: javacName, compiler_executable_sha256: hash(javacBytes),
      runtime_executable_path: javaName, runtime_executable_sha256: hash(javaBytes), release_sha256: hash(releaseBytes),
      compiler_version: (compilerVersion.stdout + compilerVersion.stderr).trim(), runtime_version: (runtimeVersion.stdout + runtimeVersion.stderr).trim(),
      compilation_passed: true, native_runs_passed: results.length },
    trials: results, invalid_native_inputs_rejected: rejections, fixture_value_verified: false,
    source_coverage: 'unknown', physical_android_verified: false, production_accuracy_pass: false,
    quality_threshold_defined: false, m2_verified: false, m3_verified: false, oap_summary_eligible: false,
    limitations: [
      'Exact epoch/type and interval codes are source evidence; the native runner supplies synthetic consent, query boundaries and paired host clocks.',
      'Current source session/report clocks are recorded, while original OS-query batch clocks and the query-cursor elapsed clock remain unavailable.',
      'Hash equality binds local files without authenticating the Android runtime report or the manually entered fixture values.',
      'Native ordering, complete-group partition and synthetic pause-gap checks reproduce diagnostic behavior without establishing device source completeness.',
      'Unknown and partial estimates remain unverified. These regressions establish no accuracy threshold, attention, lower bound, phone/OEM behavior, or OAP eligibility.'
    ]
  };
  await writeFile(path.join(runDir, 'validation.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ result: summary.result, trials: results.length, invalid_native_inputs_rejected: rejections.length,
    validation_path: relative(path.join(runDir, 'validation.json')) }));
}

export function runReplayValidationSelfTests() {
  const trial = { exact_projected_event_count: 2, retained_candidate_duration_millis: 10, signed_difference_millis: 0,
    entered_fixture_duration_millis: 10, discarded_estimate_reasons: [], estimates_discarded: false,
    comparison_status: 'known_unverified_estimate', same_timestamp_groups: [], replay_derivation: { origin_epoch_millis: 1000 },
    source_context: { closed_intervals: [{ start_inclusive: 1000, end_exclusive: 1010 }] } };
  const replay = { schema: 'OAP_OWNED_REPLAY_RESULT_V1', package_name: FIXTURE,
    replay_kind: 'host_only_actual_native_core_with_synthetic_authority_and_clock',
    synthetic_clock: { actual_android_query_replayed: false, clock_deltas_paired: true },
    result: { retained_event_count: 2, intervals: [{ start_offset_millis: 0, end_offset_millis: 10, duration_millis: 10 }],
      estimated_duration_millis: 10, reasons: ['unknown_initial_state', 'unverified_source_continuity'], coverage_unknown: true,
      physical_android_verified: false, oap_summary_eligible: false, duration_verified: false,
      comparison: { status: 'KNOWN_ESTIMATE', candidate_duration_millis: 10, signed_difference_millis: 0, fixture_duration_millis: 10,
        coverage_unknown: true, physical_android_verified: false, physical_device_tested: false, oap_summary_eligible: false,
        fixture_value_verified: false, duration_verified: false } },
    checks: { same_time_permutations: { passed: true, ordering_is_not_trusted: true, multi_record_groups: 0 },
      complete_group_query_partition: { passed: true, actual_android_query_partition_verified: false, same_timestamp_group_never_split: true,
        strategies: [{ passed: true }, { passed: true }, { passed: true }] }, genuine_pause_gap_no_fill: { passed: true, synthetic_check_only: true } } };
  validateCapturedReplay(replay, trial);
  const changes = [
    ['foreign_package', value => { value.package_name = 'com.private.other'; }],
    ['wrong_candidate', value => { value.result.comparison.candidate_duration_millis = 11; }],
    ['changed_event_multiplicity', value => { value.result.retained_event_count = 1; }],
    ['invented_interval', value => { value.result.intervals[0].end_offset_millis = 11; }],
    ['filled_gap_sum', value => { value.result.estimated_duration_millis = 12; }],
    ['source_completeness_claim', value => { value.result.coverage_unknown = false; }],
    ['missing_partition_check', value => { value.checks.complete_group_query_partition.strategies.pop(); }],
    ['android_query_claim', value => { value.synthetic_clock.actual_android_query_replayed = true; }]
  ];
  const rejections = changes.map(([name, change]) => {
    const altered = structuredClone(replay); change(altered); let rejected = false;
    try { validateCapturedReplay(altered, trial); } catch { rejected = true; }
    check(rejected, `Invalid replay result accepted: ${name}`); return { name, rejected: true };
  });
  const unknownTrial = structuredClone(trial), unknownReplay = structuredClone(replay);
  unknownTrial.retained_candidate_duration_millis = null; unknownTrial.signed_difference_millis = null;
  unknownTrial.comparison_status = 'unknown'; unknownTrial.source_context.closed_intervals = [];
  unknownReplay.result.intervals = []; unknownReplay.result.estimated_duration_millis = null;
  unknownReplay.result.comparison.status = 'UNKNOWN'; unknownReplay.result.comparison.candidate_duration_millis = null;
  unknownReplay.result.comparison.signed_difference_millis = null; validateCapturedReplay(unknownReplay, unknownTrial);
  return { result: 'pass_result_validation_self_tests_only', invalid_results_rejected: rejections,
    unknown_preserved: true, native_execution_performed: false, device_accessed: false, production_accuracy_pass: false };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('node scripts/replay-android-timing-analysis.mjs --analysis artifacts/android-timing-analysis/run-<UUID>/summary.json\nnode scripts/replay-android-timing-analysis.mjs --self-test\nUses the pinned installed JDK and current native core. Requires a complete exact owned-fixture analysis; writes a new immutable replay folder. No Android or network access.'); return;
  }
  if (args.length === 1 && args[0] === '--self-test') { console.log(JSON.stringify(runReplayValidationSelfTests(), null, 2)); return; }
  check(args.length === 2 && args[0] === '--analysis' && RUN_PATH.test(args[1]), 'Use --analysis with an immutable owned timing-analysis summary path, or --self-test.');
  await run(args[1]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
