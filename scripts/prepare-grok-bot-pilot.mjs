// Creates fixed local synthetic materials, never a host connection or submission.
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJson } from '../src/protocol.mjs';
import { buildGrokBotHandoff } from '../src/grok-bot-handoff.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const SOURCES = ['skills/liveabit/SKILL.md', 'skills/liveabit/references/scenarios.json',
  'skills/liveabit/references/evaluation.md', 'skills/liveabit/scripts/score-review.mjs',
  'src/skill-review-packet.mjs', 'src/grok-bot-handoff.mjs',
  'scripts/prepare-grok-bot-pilot.mjs', 'docs/review/grok-bot-pilot-packets.md'];
const MAX_BYTES = 8388608;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (ok, message) => { if (!ok) throw new Error(message); };
const relative = target => path.relative(ROOT, target).split(path.sep).join('/');
const permittedFile = value => value === 'SETUP.md' || value === 'agent/liveabit-skill.md'
  || /^(?:agent|reviewer)\/case-\d{3}\.json$/u.test(value);

async function ownedDirectory(parent, name, { exclusive = false } = {}) {
  const directory = path.join(parent, name);
  try { await mkdir(directory); }
  catch (error) { if (error.code !== 'EEXIST' || exclusive) throw error; }
  const entry = await lstat(directory);
  check(entry.isDirectory() && !entry.isSymbolicLink(), 'Pilot output must be a local project directory.');
  check(await realpath(directory) === directory, 'Pilot output directory cannot redirect.');
  return directory;
}

export async function prepareGrokBotPilot(...args) {
  check(args.length === 0, 'Offline pilot preparation accepts no configuration.');
  check(await realpath(ROOT) === ROOT, 'Pilot preparation requires the original project directory.');
  // Validate fixed local inputs and every output before creating the run directory.
  const sources = await Promise.all(SOURCES.map(async name => {
    const sourcePath = path.join(ROOT, name);
    const entry = await lstat(sourcePath);
    check(entry.isFile() && !entry.isSymbolicLink() && await realpath(sourcePath) === sourcePath,
      'Pilot source must be the fixed local project file.');
    check(entry.size <= 131072, 'Pilot source exceeds its preparation limit.');
    const bytes = await readFile(sourcePath);
    check(bytes.length <= 131072, 'Pilot source exceeds its preparation limit.');
    return { name, bytes };
  }));
  const suite = parseJson(sources[1].bytes, 131072);
  const skillMarkdown = new TextDecoder('utf-8', { fatal: true }).decode(sources[0].bytes);
  const prepared = buildGrokBotHandoff({ suite, skillMarkdown });
  const { files, cases, ...status } = prepared;
  check(files.every(file => permittedFile(file.path)), 'Unexpected pilot packet path.');
  const runId = randomUUID();
  const manifest = {
    format_version: 1, run_id: runId, generated_at: new Date().toISOString(),
    evidence_kind: 'offline_grok_bot_synthetic_skill_handoff', ...status,
    actual_host_selected_by_generator: false,
    reviewer_instructions: [
      'SETUP.md is for the human reviewer. Never upload the complete folder or this manifest to the Bot.',
      'For an authorized handoff, share only agent/liveabit-skill.md to save the operational Skill, or one opaque agent/case-NNN.json for a synthetic interpretation exercise.',
      'Keep reviewer/ files, scenario identities, criteria, answer sources and rubric separate from agent input.',
      'Preparing these inputs submits nothing and establishes no authentication, delivery, consent, account eligibility or observed evaluation.',
      'Record actual observations before changing observed to true; unanswered checks remain null. Missing output alone is not evaluated silence.',
      'Production Grok webhook delivery is not enabled; MCP Events remains unverified research. This preparation creates no routine, listener, bridge, tunnel, purchase or plan upgrade.'
    ],
    sources: sources.map(source => ({ path: source.name, bytes: source.bytes.length, sha256: hash(source.bytes) })),
    cases,
    files: files.map(file => ({ path: file.path, role: file.role,
      bytes: Buffer.byteLength(file.content, 'utf8'), sha256: hash(file.content) }))
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  check(files.reduce((total, file) => total + Buffer.byteLength(file.content, 'utf8'),
    Buffer.byteLength(manifestContent, 'utf8')) <= MAX_BYTES, 'Pilot output exceeds its preparation limit.');
  const artifacts = await ownedDirectory(ROOT, 'artifacts');
  const base = await ownedDirectory(artifacts, 'grok-bot-pilot');
  const directory = await ownedDirectory(base, `run-${runId}`, { exclusive: true });
  await ownedDirectory(directory, 'agent', { exclusive: true });
  await ownedDirectory(directory, 'reviewer', { exclusive: true });
  for (const file of files) {
    await writeFile(path.join(directory, file.path), file.content, { flag: 'wx' });
  }
  await writeFile(path.join(directory, 'manifest.json'), manifestContent, { flag: 'wx' });
  return {
    result: 'prepared_offline_synthetic_handoff_only', output_directory: relative(directory),
    manifest: `${relative(directory)}/manifest.json`, scenarios: cases.length, ...status
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('node scripts/prepare-grok-bot-pilot.mjs\nCreates a new artifacts/grok-bot-pilot/run-UUID folder from fixed synthetic inputs. No output, network, credentials, device, account, model or activation options. Nothing is submitted to Grok Bot.');
    return;
  }
  check(args.length === 0, 'No arguments are accepted. Use --help for usage.');
  console.log(JSON.stringify(await prepareGrokBotPilot()));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    // Never echo supplied arguments, input contents or account-like values.
    console.error('Offline Grok Bot pilot preparation failed; no host action was performed. Check fixed local inputs and output-directory access.');
    process.exitCode = 1;
  });
}
