// Generates local synthetic review packets; no host, account, device or model access.
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJson } from '../src/protocol.mjs';
import { buildSkillReviewPackets } from '../src/skill-review-packet.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const SOURCES = ['skills/liveabit/SKILL.md', 'skills/liveabit/references/scenarios.json',
  'skills/liveabit/references/evaluation.md', 'skills/liveabit/scripts/score-review.mjs',
  'src/skill-review-packet.mjs', 'scripts/prepare-skill-review.mjs'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (ok, message) => { if (!ok) throw new Error(message); };
const relative = target => path.relative(ROOT, target).split(path.sep).join('/');

async function ownedDirectory(parent, name, { exclusive = false } = {}) {
  const directory = path.join(parent, name);
  try { await mkdir(directory); }
  catch (error) { if (error.code !== 'EEXIST' || exclusive) throw error; }
  const entry = await lstat(directory);
  check(entry.isDirectory() && !entry.isSymbolicLink(), 'Review output directory must be a local project directory.');
  check(await realpath(directory) === directory, 'Review output directory cannot redirect outside the project.');
  return directory;
}

export async function prepareSkillReview() {
  check(await realpath(ROOT) === ROOT, 'Review preparation requires the original project directory.');
  // Read only fixed repository inputs, before creating any output.
  const sources = await Promise.all(SOURCES.map(async name => {
    const bytes = await readFile(path.join(ROOT, name));
    check(bytes.length <= 131072, 'Skill review source exceeds its preparation limit.');
    return { name, bytes };
  }));
  const suite = parseJson(sources[1].bytes, 131072);
  const skillMarkdown = new TextDecoder('utf-8', { fatal: true }).decode(sources[0].bytes);
  const prepared = buildSkillReviewPackets({ suite, skillMarkdown });
  const artifacts = await ownedDirectory(ROOT, 'artifacts');
  const base = await ownedDirectory(artifacts, 'liveabit-skill-review');
  const runId = randomUUID();
  const directory = await ownedDirectory(base, `run-${runId}`, { exclusive: true });
  await ownedDirectory(directory, 'agent', { exclusive: true });
  await ownedDirectory(directory, 'reviewer', { exclusive: true });
  const manifest = {
    format_version: 1, run_id: runId, generated_at: new Date().toISOString(),
    evidence_kind: 'offline_synthetic_skill_review_packets', synthetic: true,
    actual_host_selected_by_generator: false, actual_host_accessed: false,
    network_accessed: false, device_accessed: false, account_actions_performed: false,
    model_invoked: false, activity_delivered: false, agent_evaluation_observed: false,
    real_host_gate_satisfied: false, m2_gate_satisfied: false, native_profile_enabled: false,
    reviewer_instructions: [
      'Use only one agent/ packet as the agent input. Keep this manifest, reviewer/ files and reviewer resources separate.',
      'These are synthetic interpretation inputs, not authenticated receiver delivery or evidence that the Skill ran.',
      'Record an actual observation before changing observed to true. Fill every outcome, count and critical check; null checks are unanswered.',
      'Use the original scenario and the corresponding observation with scoreReview. Do not infer evaluated silence from missing output.',
      'Preparing this package authorizes no submission, account setup, monitoring or host activation.'
    ],
    sources: sources.map(source => ({ path: source.name, bytes: source.bytes.length, sha256: hash(source.bytes) })),
    cases: prepared.cases,
    files: prepared.files.map(file => ({ path: file.path, role: file.role,
      bytes: Buffer.byteLength(file.content, 'utf8'), sha256: hash(file.content) }))
  };
  for (const file of prepared.files) {
    // Builder-owned opaque paths only; wx never replaces an existing artifact.
    check(/^(?:agent|reviewer)\/case-\d{3}\.json$/u.test(file.path), 'Unexpected review packet path.');
    await writeFile(path.join(directory, file.path), file.content, { flag: 'wx' });
  }
  await writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return { result: 'prepared_synthetic_inputs_only', output_directory: relative(directory),
    manifest: `${relative(directory)}/manifest.json`, scenarios: prepared.cases.length,
    actual_host_accessed: false, activity_delivered: false, real_host_gate_satisfied: false, m2_gate_satisfied: false };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('node scripts/prepare-skill-review.mjs\nCreates a new artifacts/liveabit-skill-review/run-UUID folder from fixed synthetic inputs. No output-path option, network, device, account or model access.');
    return;
  }
  check(args.length === 0, 'No output path or other arguments are accepted. Use --help for usage.');
  console.log(JSON.stringify(await prepareSkillReview()));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    // Never reflect source text, synthetic labels or supplied arguments in diagnostics.
    console.error('Skill review preparation failed; no host action was performed. Check fixed local inputs and output-directory access.');
    process.exitCode = 1;
  });
}
