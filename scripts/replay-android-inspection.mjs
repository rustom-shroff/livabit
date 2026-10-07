import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractOwnedReplay, runExtractionSelfTests } from './extract-android-inspection-replay.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactDir = join(root, 'artifacts', 'android-inspection-replay');
const nativeSources = [
  'android/collector-core/src/main/java/org/liveabit/collector/core/LocalInspectionCore.java',
  'android/collector-core/src/main/java/org/liveabit/collector/core/FixtureComparison.java',
];
const baselineSources = nativeSources.map(path => `artifacts/android-inspection-replay/baseline-core/${path.split('/').at(-1)}`);
const toolSources = [
  'scripts/extract-android-inspection-replay.mjs',
  'scripts/replay-android-inspection.mjs',
  'tools/android-inspection-replay/InspectionReplay.java',
];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function sourceHashes() {
  return Object.fromEntries(await Promise.all([...nativeSources, ...baselineSources, ...toolSources].map(async path =>
    [path, sha256(await readFile(join(root, path)))])));
}

function execute(executable, args, input) {
  const result = spawnSync(executable, args, {
    cwd: root, input, encoding: 'utf8', timeout: 60_000,
    maxBuffer: 2 * 1024 * 1024, windowsHide: true, shell: false,
  });
  if (result.error) throw result.error;
  return result;
}

async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--help')) throw new Error('Use no arguments, or --help. Inputs are the fixed owned-fixture archive.');
  if (process.argv.includes('--help')) {
    console.log('Offline owned-fixture replay: node scripts/replay-android-inspection.mjs\nUses the existing project JDK, unchanged native core and preserved Android 15 fixture evidence. No device or network access.');
    return;
  }
  const before = await sourceHashes();
  const extractionChecks = runExtractionSelfTests();
  const runDir = join(artifactDir, 'runs', randomUUID());
  const derivationDir = join(runDir, 'derived');
  const evidence = await extractOwnedReplay({ root, outputDir: derivationDir });
  const classes = join(runDir, 'baseline-classes');
  const candidateClasses = join(runDir, 'candidate-classes');
  await mkdir(classes, { recursive: true });
  await mkdir(candidateClasses, { recursive: true });
  const jdk = join(root, 'artifacts', 'android-tools', 'jdk', 'jdk-17.0.20.1+1', 'bin');
  const java = join(jdk, process.platform === 'win32' ? 'java.exe' : 'java');
  const javac = join(jdk, process.platform === 'win32' ? 'javac.exe' : 'javac');
  const compiler = execute(javac, ['-version']);
  assert(compiler.status === 0, `JDK unavailable: ${compiler.stderr}`);
  const compiled = execute(javac, ['-encoding', 'UTF-8', '--release', '17', '-d', classes,
    ...baselineSources.map(path => join(root, path)), join(root, toolSources[2])]);
  assert(compiled.status === 0, `Replay compilation failed: ${compiled.stderr}`);
  const candidateCompiled = execute(javac, ['-encoding', 'UTF-8', '--release', '17', '-d', candidateClasses,
    ...nativeSources.map(path => join(root, path)), join(root, toolSources[2])]);
  assert(candidateCompiled.status === 0, `Candidate replay compilation failed: ${candidateCompiled.stderr}`);
  const invoke = input => execute(java, ['-ea', '-cp', classes, 'InspectionReplay'], input);
  const invokeCandidate = input => execute(java, ['-ea', '-cp', candidateClasses, 'InspectionReplay'], input);
  const scenarios = [];
  for (const scenario of evidence.scenarios) {
    const input = await readFile(resolve(root, scenario.input_path));
    const execution = invoke(input);
    assert(execution.status === 0, `${scenario.id} native replay failed: ${execution.stderr}`);
    const candidateExecution = invokeCandidate(input);
    assert(candidateExecution.status === 0 && candidateExecution.stdout === execution.stdout,
      `${scenario.id}: current candidate changed the archived timing replay; review its inference semantics`);
    const replay = JSON.parse(execution.stdout);
    const result = replay.result;
    const estimatesDiscarded = result.reasons.some(reason => ['ambiguous_same_timestamp_transitions',
      'unmatched_pause_invalidates_prior_estimates'].includes(reason));
    assert(estimatesDiscarded === scenario.expected_estimates_discarded, `${scenario.id}: discarded-estimate evidence differs`);
    const interpretation = {
      retained_trace_status: result.estimated_duration_millis === null ? 'unknown'
        : estimatesDiscarded ? 'partial_unverified' : 'numerical_unverified',
      comparison_status: result.comparison.candidate_duration_millis === null ? 'unknown'
        : estimatesDiscarded ? 'known_partial_unverified_estimate' : 'known_unverified_estimate',
      estimates_discarded: estimatesDiscarded, accuracy_verified: false, source_completeness: 'unknown',
    };
    assert(interpretation.comparison_status === scenario.expected_comparison_status, `${scenario.id}: archived uncertainty label differs`);
    assert(result.estimated_duration_millis === (scenario.id === 'idle' ? 88201 : 32896), `${scenario.id}: unexpected retained full-trace sum`);
    assert(result.comparison.candidate_duration_millis === scenario.expected_candidate_duration_millis, `${scenario.id}: archived comparison was not reproduced`);
    assert(result.comparison.signed_difference_millis === scenario.expected_signed_difference_millis, `${scenario.id}: archived signed difference was not reproduced`);
    assert(result.comparison.coverage_unknown === true && result.comparison.fixture_value_verified === false
      && result.comparison.physical_device_tested === false && result.comparison.oap_summary_eligible === false, `${scenario.id}: unverified evidence flags were lost`);
    for (const name of ['same_time_permutations', 'complete_group_query_partition', 'genuine_pause_gap_no_fill'])
      assert(replay.checks?.[name]?.passed === true, `${scenario.id}: native check missing or failed: ${name}`);
    assert(replay.checks.complete_group_query_partition.strategies.length === 3, `${scenario.id}: query-partition strategies missing`);
    if (scenario.id === 'handoff') assert(replay.checks.same_time_permutations.pair_group_combinations_checked === 4
      && replay.checks.same_time_permutations.all_mixed_pair_combinations_checked === true, 'Handoff pair ordering checks are incomplete');
    const outputPath = relative(root, join(runDir, `${scenario.id}-result.json`)).split('\\').join('/');
    const serialized = JSON.stringify(replay, null, 2) + '\n';
    scenarios.push({ id: scenario.id, input_path: scenario.input_path, input_sha256: sha256(input),
      output_path: outputPath, output_sha256: sha256(Buffer.from(serialized)),
      archived_comparison_reproduced: true, candidate_native_replay_equal_to_baseline: true, interpretation, replay });
    await writeFile(join(root, outputPath), serialized);
  }

  // These inputs exercise the strict boundary between owned normalized evidence and arbitrary activity.
  const invalidInputs = [
    ['wrong_format', 'OAP_OTHER_REPLAY_V1\n2\t0\t30\t20\n0\tRESUME\n30\tPAUSE\n'],
    ['unbounded_count', 'OAP_OWNED_REPLAY_V1\n65\t0\t30\t20\n'],
    ['negative_time', 'OAP_OWNED_REPLAY_V1\n2\t0\t30\t20\n-1\tRESUME\n30\tPAUSE\n'],
    ['unordered_time', 'OAP_OWNED_REPLAY_V1\n2\t0\t30\t20\n30\tRESUME\n0\tPAUSE\n'],
    ['unrecognized_type', 'OAP_OWNED_REPLAY_V1\n2\t0\t30\t20\n0\torg.private.app\n30\tPAUSE\n'],
    ['fractional_time', 'OAP_OWNED_REPLAY_V1\n2\t0\t30\t20\n0.5\tRESUME\n30\tPAUSE\n'],
    ['extra_record', 'OAP_OWNED_REPLAY_V1\n2\t0\t30\t20\n0\tRESUME\n30\tPAUSE\n31\tPAUSE\n'],
    ['oversized_window', 'OAP_OWNED_REPLAY_V1\n2\t0\t600001\t20\n0\tRESUME\n30\tPAUSE\n'],
    ['oversized_trace', 'OAP_OWNED_REPLAY_V1\n2\t0\t30\t20\n0\tRESUME\n3600001\tPAUSE\n'],
    ['missing_record', 'OAP_OWNED_REPLAY_V1\n2\t0\t30\t20\n0\tRESUME\n'],
  ];
  const inputRejections = invalidInputs.map(([name, input]) => {
    const execution = invokeCandidate(input);
    assert(execution.status !== 0 && execution.stdout.trim() === '', `Unsafe replay input accepted: ${name}`);
    return { name, rejected: true };
  });
  const after = await sourceHashes();
  assert(JSON.stringify(before) === JSON.stringify(after), 'Replay source changed during execution; discard this run.');
  for (const source of evidence.sources)
    assert(sha256(await readFile(join(root, source.path))) === source.sha256, `Bound source changed during replay: ${source.path}`);
  const report = {
    result: 'pass_owned_offline_replay', generated_at: new Date().toISOString(),
    scope: 'normalized_owned_fixture_trace_with_synthetic_authorization_and_clock',
    device_accessed: false, network_accessed: false, apk_rebuilt: false,
    inference_policy_changed: false, production_accuracy_pass: false,
    recorded_native_baseline: '0.2.2', current_native_candidate_checked_separately: true,
    source_sha256: after, compiler: (compiler.stdout + compiler.stderr).trim(),
    compiler_executable_sha256: sha256(await readFile(javac)),
    runtime_executable_sha256: sha256(await readFile(java)),
    derivation_path: relative(root, join(derivationDir, 'evidence.json')).split('\\').join('/'),
    derivation_sha256: sha256(await readFile(join(derivationDir, 'evidence.json'))),
    display_mapping_assumption: evidence.display_mapping_assumption,
    limitations: evidence.limitations, scenarios, extraction_checks: extractionChecks, input_rejections: inputRejections,
  };
  const serialized = JSON.stringify(report, null, 2) + '\n';
  await writeFile(join(runDir, 'validation.json'), serialized, { flag: 'wx' });
  await writeFile(join(artifactDir, 'validation.json'), serialized);
  await writeFile(join(root, 'docs/review/android-inspection-replay-2026-10-06-validation.json'), serialized);
  console.log(`Owned offline replay passed: ${scenarios.length} archived traces, ${inputRejections.length} rejected malformed inputs. APKs unchanged.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
