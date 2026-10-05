// Safe synthetic evidence recorder; never publishes or operates delivery infrastructure.
import { spawn } from 'node:child_process';
import { readdir, readFile, writeFile, stat, statfs } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { runDemo } from '../src/demo.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const review = path.join(root, 'docs', 'review');
const artifactPath = path.join(review, 'phase-4-contract.json');
const nodeMajor = Number(process.versions.node.split('.')[0]);
const evidencePaths = kind => [...new Set([
  path.join(review, `phase-4-${kind}.json`),
  path.join(review, `phase-4-${kind}-${process.platform}.json`),
  path.join(review, `phase-4-${kind}-${process.platform}-node${nodeMajor}.json`)
])];
async function saveEvidence(kind, value) {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  for (const target of evidencePaths(kind)) await writeFile(target, bytes);
}
const hash = input => createHash('sha256').update(input).digest('hex');
let activeStage = 'starting';

async function bootstrapHistoricalLinks() {
  // A source-only handoff omits old generated reports. Preserve that omission
  // explicitly rather than copying a Windows success into a Linux source tree.
  const docs = ['README.md', 'CONTRIBUTING.md', ...(await filesUnder(path.join(root, 'docs')))
    .filter(file => file.endsWith('.md'))];
  for (const file of docs) {
    const absolute = path.isAbsolute(file) ? file : path.join(root, file);
    const raw = await readFile(absolute, 'utf8');
    for (const match of raw.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const relative = match[1].replace(/^<|>$/g, '').split('#')[0];
      if (/^[a-z][a-z0-9+.-]*:/i.test(relative)) continue;
      const target = path.resolve(path.dirname(absolute), relative);
      if (path.dirname(target) !== path.resolve(review) || !/^phase-[34]-[A-Za-z0-9.-]+\.json$/.test(path.basename(target))) continue;
      try { await stat(target); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await writeFile(target, `${JSON.stringify({ result: 'not_run', evidence_kind: 'historical_report_omitted_from_source_handoff',
          message: 'This historical report was not transferred. Consult current platform/runtime evidence for executed checks.' })}\n`, { flag: 'wx' });
      }
    }
  }
}

async function executionEnvironment() {
  const environment = { platform: process.platform, release: os.release(), architecture: process.arch,
    node: process.version, kernel_type: os.type(), dependency_versions: await dependencyVersions() };
  for (const [name, directory] of [['source', root], ['temporary_state', os.tmpdir()]]) {
    try { const details = await statfs(directory); environment[`${name}_filesystem_type`] = details.type; }
    catch { environment[`${name}_filesystem_type`] = 'unavailable'; }
  }
  if (process.platform === 'linux') {
    const kernelType = (await readFile('/proc/sys/kernel/ostype', 'utf8')).trim();
    const kernelRelease = (await readFile('/proc/sys/kernel/osrelease', 'utf8')).trim();
    if (kernelType !== 'Linux' || kernelRelease !== os.release() || /-Microsoft$/iu.test(kernelRelease)) throw new Error('A real Linux kernel is required.');
    environment.linux_kernel_verified = true;
    try {
      const release = await readFile('/etc/os-release', 'utf8');
      if (Buffer.byteLength(release) <= 4096) environment.linux_distribution = Object.fromEntries(['ID', 'VERSION_ID'].flatMap(key => {
        const value = release.match(new RegExp(`^${key}=(?:"([A-Za-z0-9._-]{1,80})"|([A-Za-z0-9._-]{1,80}))$`, 'm'));
        return value ? [[key.toLowerCase(), value[1] ?? value[2]]] : [];
      }));
    } catch { environment.linux_distribution = 'unavailable'; }
  }
  return environment;
}

async function command(args, timeout = 180_000) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', failure;
    const accumulate = (original, chunk) => {
      const next = original + chunk.toString('utf8');
      if (Buffer.byteLength(next) > 2 * 1024 * 1024) { failure = new Error('Verification output exceeded its bound.'); child.kill(); }
      return next;
    };
    child.stdout.on('data', chunk => { stdout = accumulate(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = accumulate(stderr, chunk); });
    const timer = setTimeout(() => { failure = new Error('Verification exceeded its time bound.'); child.kill(); }, timeout);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', exitCode => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else resolve({ exit_code: exitCode, duration_ms: performance.now() - started, stdout, stderr });
    });
  });
}

async function filesUnder(directory) {
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory() && !['build', '.gradle'].includes(entry.name)) results.push(...await filesUnder(absolute));
    else if (entry.isFile()) results.push(absolute);
  }
  return results;
}

async function inputHashes() {
  const files = ['README.md', 'CONTRIBUTING.md', '.gitignore', 'package.json', 'pnpm-lock.yaml'].map(file => path.join(root, file));
  for (const folder of ['src', 'test', 'scripts', 'specs', 'schemas', 'examples', 'skills']) files.push(...await filesUnder(path.join(root, folder)));
  files.push(...(await filesUnder(path.join(root, 'android'))).filter(file => /\.(?:java|xml|gradle|properties|md)$/.test(file)));
  files.push(...(await filesUnder(path.join(root, 'docs'))).filter(file => file.endsWith('.md')));
  files.push(path.join(root, 'docs', 'agent-compatibility.json'));
  const result = {};
  for (const file of files.sort()) result[path.relative(root, file).split(path.sep).join('/')] = hash(await readFile(file));
  return result;
}

async function dependencyVersions() {
  const result = {};
  for (const dependency of ['ajv', 'ajv-formats', 'ipaddr.js']) {
    result[dependency] = JSON.parse(await readFile(path.join(root, 'node_modules', dependency, 'package.json'), 'utf8')).version;
  }
  return result;
}

async function verify() {
  // A failed repeat must not leave an older success looking like the latest run.
  const pending = { evidence_version: 1, protocol_version: '0.1.0', platform: process.platform,
    node: process.version, result: 'pending', generated_at: new Date().toISOString() };
  for (const kind of ['validation', 'contract', 'demo']) await saveEvidence(kind, pending);
  await bootstrapHistoricalLinks();
  const before = await inputHashes();
  const environment = await executionEnvironment();
  const testFiles = (await readdir(path.join(root, 'test'))).filter(file => file.endsWith('.test.mjs')).sort().map(file => `test/${file}`);
  activeStage = 'runtime';
  const runtime = await command(['--test', '--test-reporter=tap', ...testFiles]);
  const number = key => Number(runtime.stdout.match(new RegExp(`^# ${key} (\\d+(?:\\.\\d+)?)$`, 'm'))?.[1] ?? NaN);
  const cases = [...runtime.stdout.matchAll(/^(ok|not ok) (\d+) - (.+)$/gm)].map(match => {
    const [name, skip] = match[3].split(' # SKIP ');
    return { name, result: skip ? 'skipped' : match[1] === 'ok' ? 'pass' : 'fail', ...(skip ? { reason: skip } : {}) };
  });
  const summary = { tests: number('tests'), pass: number('pass'), fail: number('fail'), skipped: number('skipped'), cancelled: number('cancelled') };
  const runtimePassed = runtime.exit_code === 0 && summary.fail === 0 && summary.cancelled === 0 && Number.isFinite(summary.tests);
  console.log(`Runtime: ${summary.pass} passed, ${summary.skipped} explicitly skipped, ${summary.fail} failed.`);
  let demo;
  if (runtimePassed) {
    activeStage = 'demo';
    demo = await runDemo();
    await saveEvidence('demo', demo);
    console.log(`Direct demo passed; ${demo.latency.accepted_summaries} accepted summaries, p95 ${demo.latency.p95_ms.toFixed(1)} ms.`);
  }
  activeStage = 'contract_artifacts';
  const artifacts = await command(['scripts/validate-spec.mjs', '--report', artifactPath], 30_000);
  const artifactReport = JSON.parse(await readFile(artifactPath, 'utf8'));
  await saveEvidence('contract', artifactReport);
  activeStage = 'input_hashes';
  const after = await inputHashes();
  const changed = Object.keys({ ...before, ...after }).filter(file => before[file] !== after[file]);
  const passed = runtimePassed && Boolean(demo) && artifacts.exit_code === 0 && artifactReport.passed && changed.length === 0;
  const result = {
    evidence_version: 1, evidence_kind: 'phase_4_synthetic_windows_or_linux_reference', generated_at: new Date().toISOString(),
    protocol_version: '0.1.0', approval: { g1: 'agreed', date: '2026-10-04', statement: 'ok keep going if there is no further input required from my side' },
    progression_authorization: { date: '2026-10-05', m1_scope: 'accepted_windows_reference',
      linux_portability: 'deferred_by_user', priorities: ['android_local_collector_and_inspection_first'],
      real_agent_selection: 'deferred_until_local_findings',
      decision: 'docs/decisions/0009-android-local-inspection-first.md',
      accepted_evidence: 'docs/review/priority-change-2026-10-04.md', changes_wire_semantics: false },
    profile_id: 'direct-loopback-test-v1', result: passed ? 'pass_with_gate_limits' : 'fail',
    environment,
    synthetic_configuration: { clock_start: '2026-10-04T00:00:00.000Z', clock: 'ManualClock', retry_random: 0.5,
      no_ai_model: true, no_real_credentials: true, embedded_state_single_owner: true, no_forwarding_process: true },
    applicability: {
      association_is_not_full_case_pass: true,
      static_ct: ['CT-01', 'CT-02', 'CT-03', 'CT-04', 'CT-05', 'CT-06', 'CT-07', 'CT-08', 'CT-37'],
      runtime_ct: Array.from({ length: 28 }, (_, i) => `CT-${String(i + 3).padStart(2, '0')}`),
      acceptance: [...Array.from({ length: 21 }, (_, i) => `AC-${String(i + 1).padStart(2, '0')}`), 'AC-27', 'AC-29'],
      conditional: { 'CT-31': 'not_applicable; MCP Events unselected' },
      deferred: ['CT-32', 'CT-33', 'CT-34', 'CT-35', 'CT-36'],
      preparation: { skill_and_reviewer_scenarios: ['AC-23', 'AC-24'], direct_readiness: ['AC-22', 'AC-29'],
        android_observation_experiment: ['AC-25', 'AC-26'], actual_m2_or_m3_proven: false,
        evidence: 'docs/review/phase-5-preparation.md' },
      concrete_associations_and_limits: 'docs/review/phase-4.md'
    },
    dependency_setup: { required_package_manager: 'pnpm@11.25.0',
      documented_command: 'pnpm install --frozen-lockfile --ignore-scripts', performed_by_this_recorder: false,
      actual_loaded_versions: 'environment.dependency_versions' },
    commands: { runtime: { executable: 'node', arguments: ['--test', '--test-reporter=tap', ...testFiles], exit_code: runtime.exit_code, duration_ms: runtime.duration_ms },
      demo: { entry: 'src/demo.mjs:runDemo', result: demo ? 'pass' : 'not_run' },
      artifacts: { executable: 'node', arguments: ['scripts/validate-spec.mjs', '--report', 'docs/review/phase-4-contract.json'], exit_code: artifacts.exit_code } },
    runtime: { ...summary, cases, stdout_sha256: hash(runtime.stdout), stderr_sha256: hash(runtime.stderr), raw_private_output_saved: false },
    contract_artifacts: { passed: artifactReport.passed, schemas: artifactReport.schema_count, fixtures: artifactReport.fixture_count,
      groups: artifactReport.group_count, local_links: artifactReport.local_link_count, requirements: artifactReport.requirement_count, acceptance_mappings: artifactReport.acceptance_mapping_count,
      evidence: `docs/review/phase-4-contract-${process.platform}-node${nodeMajor}.json` },
    direct_demo: demo ? { lifecycle: demo.lifecycle, latency: { ...demo.latency, samples_ms: undefined },
      evidence: `docs/review/phase-4-demo-${process.platform}-node${nodeMajor}.json` } : null,
    gates: { g1: 'agreed', m1: passed ? process.platform === 'win32' ? 'accepted_windows_reference' : 'this_platform_reference_pass; windows_baseline_accepted_separately' : 'current_reference_failed',
      m2: 'not_run', m3: 'not_run', linux_portability: 'deferred_by_user',
      ct28_linux: process.platform === 'linux' ? 'this_run_linux; portability_review_separate_from_accepted_windows_progression' : 'not_run; deferred_by_user_not_a_progression_blocker',
      minimum_node_22: Number(process.versions.node.split('.')[0]) === 22 ? 'this_run_recorded_node_22' : 'not_run; recorded_version_identified_above',
      ct31_mcp_events: 'not_applicable; unselected_conditional_profile' },
    limits: ['Synthetic reference only; no existing-agent or Android compatibility claim.',
      'Windows reference evidence is accepted for progression; Linux extensibility is deferred and untested.',
      'Skill/scenario and compatibility preparation do not establish actual existing-agent or physical Android behavior.',
      'Production credential keystore, Windows ACL protection and deployed receiver onboarding are unverified.',
      'Each JSON state file has one owner; concurrent writers and all-filesystem power-loss durability are unverified.',
      'No delivery reliability guarantee or production performance SLA.'],
    inputs_changed_during_run: changed, sha256: after
  };
  await saveEvidence('validation', result);
  console.log(`${passed ? 'PASS' : 'FAIL'}: recorded reference evidence; Windows baseline accepted for progression, Linux deferred.`);
  if (!passed) {
    // Fixture-only synthetic diagnostic output; never save private activities or bearer tokens in the evidence manifest.
    if (!runtimePassed) console.error(runtime.stdout.slice(-8192));
    if (artifacts.exit_code !== 0) console.error(artifacts.stdout, artifacts.stderr);
    if (changed.length) console.error('Input files changed during verification; repeat after edits finish.');
    process.exitCode = 1;
  }
}

verify().catch(async () => {
  const failure = { evidence_version: 1, protocol_version: '0.1.0', result: 'fail', generated_at: new Date().toISOString(),
    failed_stage: activeStage, gates: { m1: 'current_reference_failed', m2: 'not_run', m3: 'not_run', linux_portability: 'deferred_by_user' },
    message: 'Reference verification could not complete. No private error detail was saved.' };
  try { await saveEvidence('validation', failure); }
  catch { console.error('The evidence file could not be updated; any existing report is historical.'); }
  console.error('FAIL: reference verification could not complete; no complete milestone claim was recorded.');
  process.exitCode = 1;
});
