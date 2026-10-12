// Preparation tests only. No real Grok Bot, device, account or model access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, symlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical } from '../src/protocol.mjs';
import { buildGrokBotHandoff } from '../src/grok-bot-handoff.mjs';
import { buildSkillReviewPackets, extractSkillGuidance, blankReviewerObservation } from '../src/skill-review-packet.mjs';
import { scoreReview } from '../skills/liveabit/scripts/score-review.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const skillMarkdown = await readFile(new URL('../skills/liveabit/SKILL.md', import.meta.url), 'utf8');
const suite = JSON.parse(await readFile(new URL('../skills/liveabit/references/scenarios.json', import.meta.url), 'utf8'));
const build = input => buildGrokBotHandoff(input ?? { suite, skillMarkdown });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const gateFields = ['actual_host_accessed', 'network_accessed', 'device_accessed',
  'account_actions_performed', 'model_invoked', 'activity_delivered', 'agent_evaluation_observed',
  'authentication_verified', 'plan_eligibility_verified', 'skill_installed', 'routine_created',
  'listener_created', 'real_host_gate_satisfied', 'm2_gate_satisfied', 'native_profile_enabled'];
const runCli = (args, root = ROOT) => spawnSync(process.execPath,
  [path.join(root, 'scripts/prepare-grok-bot-pilot.mjs'), ...args],
  { cwd: root, encoding: 'utf8', shell: false, windowsHide: true, timeout: 15000, maxBuffer: 1048576 });
const directories = async base => {
  try { return (await readdir(base)).sort(); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
};
const pilotDirectories = () => directories(path.join(ROOT, 'artifacts/grok-bot-pilot'));

test('Grok handoff reuses eighteen opaque cases and keeps answer sources out of agent material', () => {
  const altered = structuredClone(suite);
  for (const item of altered.scenarios) {
    item.note = `PRIVATE_REVIEW_NOTE_${item.id}`;
    item.criteria = [`PRIVATE_REVIEW_CRITERIA_${item.id}`];
    item.expected.approved_channel = `PRIVATE_EXPECTED_ANSWER_${item.id}`;
  }
  const prepared = build({ suite: altered, skillMarkdown });
  const oldPackets = buildSkillReviewPackets({ suite: altered, skillMarkdown });
  assert.equal(prepared.cases.length, 18);
  assert.equal(prepared.files.length, 38);
  assert.deepEqual(prepared.cases, oldPackets.cases);
  assert.deepEqual(prepared.files.slice(2), oldPackets.files);
  const guidance = prepared.files.find(file => file.role === 'operational_skill_guidance');
  assert.equal(guidance.path, 'agent/liveabit-skill.md');
  assert.equal(guidance.content, extractSkillGuidance(skillMarkdown));
  for (const file of prepared.files.filter(file => ['operational_skill_guidance', 'agent_input'].includes(file.role))) {
    assert.doesNotMatch(file.content, /PRIVATE_REVIEW_NOTE|PRIVATE_REVIEW_CRITERIA|PRIVATE_EXPECTED_ANSWER/u);
    assert.doesNotMatch(file.content, /references\/evaluation\.md|references\/scenarios\.json|score-review\.mjs|For package review/u);
    if (file.role === 'agent_input') {
      const agent = JSON.parse(file.content);
      for (const key of ['expected', 'criteria', 'note', 'id', 'scenario_id', 'target', 'manifest']) {
        assert.equal(Object.hasOwn(agent, key), false, key);
      }
    }
  }
});

test('Grok preparation preserves every event occurrence, missing page, partial interval and expiry', () => {
  const prepared = build();
  for (const item of prepared.cases) {
    const original = suite.scenarios.find(scenario => scenario.id === item.scenario_id);
    const packet = JSON.parse(prepared.files.find(file => file.path === item.agent_packet).content);
    assert.deepEqual(packet.events.map(canonical), original.events.map(key => canonical(suite.events[key])));
    assert.deepEqual(packet.host, original.host);
    assert.equal(packet.evaluation_time, original.evaluation_time);
    assert.equal(item.event_occurrences.length, original.events.length);
    assert.deepEqual(item.event_occurrences.map(occurrence => occurrence.occurrence), original.events.map((_, index) => index));
    for (let index = 0; index < packet.events.length; index++) {
      assert.equal(item.event_occurrences[index].canonical_sha256, hash(canonical(packet.events[index])));
      assert.equal(packet.events[index].expires_at, suite.events[original.events[index]].expires_at);
    }
  }
  const get = id => JSON.parse(prepared.files.find(file => file.path === prepared.cases.find(item => item.scenario_id === id).agent_packet).content);
  const duplicate = get('duplicate');
  assert.equal(duplicate.prior_evaluation_recorded, true);
  assert.equal(canonical(duplicate.events[0]), canonical(duplicate.events[1]));
  const missing = get('incomplete_pages');
  assert.equal(missing.events.length, 1);
  assert.equal(missing.events[0].summary.page_index, 0);
  assert.equal(missing.events[0].summary.page_count, 2);
  assert.equal(get('partial_coverage').events[0].summary.coverage.status, 'partial');
  const expired = get('expired');
  assert(Date.parse(expired.events[0].expires_at) < Date.parse(expired.evaluation_time));
});

test('blank observations stay unobserved and target selection does not activate an integration', () => {
  const prepared = build();
  assert.equal(prepared.target, 'grok-bot');
  assert.equal(prepared.transport_status, 'unverified');
  assert.equal(prepared.synthetic, true);
  for (const key of gateFields) assert.equal(prepared[key], false, key);
  for (const item of prepared.cases) {
    const observation = JSON.parse(prepared.files.find(file => file.path === item.reviewer_observation).content);
    assert.deepEqual(observation, blankReviewerObservation());
    assert(Object.values(observation.critical_checks).every(value => value === null));
    assert.equal(scoreReview(suite.scenarios.find(scenario => scenario.id === item.scenario_id), observation).result, 'unobserved');
  }
  for (const extra of [
    { native_profile_enabled: true }, { transport_status: 'verified' },
    { m2_gate_satisfied: true }, { plan_eligibility_verified: true },
    { account: 'account-like-value' }, { output: 'elsewhere' }, { files: [] }
  ]) assert.throws(() => build({ suite, skillMarkdown, ...extra }), /Invalid offline Grok Bot/u);
  const activated = structuredClone(suite);
  activated.real_host_gate_satisfied = true;
  assert.throws(() => build({ suite: activated, skillMarkdown }));
  assert.throws(() => build({ suite, skillMarkdown: skillMarkdown.replace('For package review or a real-host pilot, read ', 'Missing boundary ') }));
});

test('human instructions keep the synthetic exercise and shared account boundaries explicit', () => {
  const note = build().files.find(file => file.role === 'human_setup_instructions').content;
  assert.match(note, /private Skill named `liveabit`/u);
  assert.match(note, /private Skill called liveabit/u);
  assert.match(note, /Private Skills are shared across the account's Bots/u);
  assert.match(note, /files, browser sessions and command-line credentials are also shared/u);
  assert.match(note, /explicit synthetic interpretation exercise/u);
  assert.match(note, /supplied evaluation time without rewriting/u);
  assert.match(note, /do not give it to the Bot or upload this entire folder/u);
  assert.match(note, /no required batch of eighteen user trials/u);
  assert.match(note, /base-plan account remain unverified/u);
  assert.match(note, /Create no routine, listener, tunnel, forwarding service or credential store/u);
  assert.match(note, /Do not purchase, upgrade or change account settings/u);
  assert.match(note, /No Grok Bot installation path, upload format or package compatibility is assumed/u);
});

test('CLI rejects arguments without output or reflection, then creates two bound exclusive runs', async () => {
  const before = await pilotDirectories();
  const help = runCli(['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.deepEqual(await pilotDirectories(), before);
  for (const args of [
    ['--output', 'PRIVATE_ARGUMENT_MARKER'], ['--profile-enabled', 'PRIVATE_ARGUMENT_MARKER'],
    ['--help', 'PRIVATE_ARGUMENT_MARKER'], ['--credentials', 'PRIVATE_ARGUMENT_MARKER']
  ]) {
    const denied = runCli(args);
    assert.equal(denied.status, 1);
    assert.doesNotMatch(`${denied.stdout}${denied.stderr}`, /PRIVATE_ARGUMENT_MARKER/u);
    assert.deepEqual(await pilotDirectories(), before);
  }
  const first = runCli([]);
  assert.equal(first.status, 0, first.stderr);
  const result = JSON.parse(first.stdout);
  assert.match(result.output_directory, /^artifacts\/grok-bot-pilot\/run-[a-f0-9-]{36}$/u);
  assert.equal(result.scenarios, 18);
  for (const key of gateFields) assert.equal(result[key], false, key);
  const manifestPath = path.join(ROOT, result.manifest);
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.target, 'grok-bot');
  assert.equal(manifest.transport_status, 'unverified');
  assert.equal(manifest.actual_host_selected_by_generator, false);
  for (const key of gateFields) assert.equal(manifest[key], false, key);
  assert.equal(manifest.files.length, 38);
  assert.equal(manifest.sources.length, 8);
  let total = manifestBytes.length;
  const firstHashes = new Map();
  for (const file of manifest.files) {
    assert.match(file.path, /^(?:SETUP\.md|agent\/liveabit-skill\.md|(?:agent|reviewer)\/case-\d{3}\.json)$/u);
    const bytes = await readFile(path.join(ROOT, result.output_directory, file.path));
    assert.equal(bytes.length, file.bytes);
    assert.equal(hash(bytes), file.sha256);
    total += bytes.length;
    firstHashes.set(file.path, hash(bytes));
  }
  assert(total <= 8388608);
  for (const source of manifest.sources) {
    const bytes = await readFile(path.join(ROOT, source.path));
    assert.equal(bytes.length, source.bytes);
    assert.equal(hash(bytes), source.sha256);
  }
  const second = runCli([]);
  assert.equal(second.status, 0, second.stderr);
  const secondResult = JSON.parse(second.stdout);
  assert.notEqual(secondResult.output_directory, result.output_directory);
  assert.equal(hash(await readFile(manifestPath)), hash(manifestBytes));
  for (const [file, originalHash] of firstHashes) {
    assert.equal(hash(await readFile(path.join(ROOT, result.output_directory, file))), originalHash);
  }
  assert.deepEqual((await pilotDirectories()).filter(name => !before.includes(name)),
    [path.basename(result.output_directory), path.basename(secondResult.output_directory)].sort());
});

// Exercise redirection against disposable copies, never the shared source or output tree.
async function copiedPreparationRoot() {
  const root = path.join(ROOT, 'artifacts', 'grok-bot-pilot-path-tests', `run-${randomUUID()}`);
  const fixed = ['skills/liveabit/SKILL.md', 'skills/liveabit/references/scenarios.json',
    'skills/liveabit/references/evaluation.md', 'skills/liveabit/scripts/score-review.mjs',
    'src/protocol.mjs', 'src/skill-review-packet.mjs', 'src/grok-bot-handoff.mjs',
    'scripts/prepare-grok-bot-pilot.mjs', 'docs/review/grok-bot-pilot-packets.md'];
  const schemaNames = await readdir(path.join(ROOT, 'schemas/oap/0.1.0'));
  fixed.push(...schemaNames.filter(name => name.endsWith('.schema.json')).map(name => `schemas/oap/0.1.0/${name}`));
  for (const name of fixed) {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(ROOT, name), target);
  }
  return root;
}

test('actual source and output junction redirection are rejected without writing their targets', async () => {
  const outputRoot = await copiedPreparationRoot();
  const outputTarget = path.join(outputRoot, 'redirect-target');
  await mkdir(outputTarget);
  await mkdir(path.join(outputRoot, 'artifacts'));
  await symlink(outputTarget, path.join(outputRoot, 'artifacts/grok-bot-pilot'), 'junction');
  const rejectedOutput = runCli([], outputRoot);
  assert.equal(rejectedOutput.status, 1);
  assert.match(rejectedOutput.stderr, /no host action was performed/u);
  assert.deepEqual(await directories(outputTarget), []);

  const sourceRoot = await copiedPreparationRoot();
  const skillTarget = path.join(sourceRoot, 'redirected-skill');
  await rename(path.join(sourceRoot, 'skills/liveabit'), skillTarget);
  await symlink(skillTarget, path.join(sourceRoot, 'skills/liveabit'), 'junction');
  const rejectedSource = runCli([], sourceRoot);
  assert.equal(rejectedSource.status, 1);
  assert.match(rejectedSource.stderr, /no host action was performed/u);
  assert.deepEqual(await directories(path.join(sourceRoot, 'artifacts')), []);
  assert.deepEqual((await readdir(skillTarget)).sort(), ['SKILL.md', 'references', 'scripts']);
});
