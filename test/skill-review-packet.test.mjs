// Offline preparation checks, never observations of agent behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical } from '../src/protocol.mjs';
import { buildSkillReviewPackets, blankReviewerObservation, extractSkillGuidance } from '../src/skill-review-packet.mjs';
import { scoreReview, CRITICAL_CHECKS } from '../skills/liveabit/scripts/score-review.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const skillMarkdown = await readFile(new URL('../skills/liveabit/SKILL.md', import.meta.url), 'utf8');
const suite = JSON.parse(await readFile(new URL('../skills/liveabit/references/scenarios.json', import.meta.url), 'utf8'));
const build = input => buildSkillReviewPackets({ suite: input ?? suite, skillMarkdown });
const packet = (prepared, id) => JSON.parse(prepared.files.find(file => file.path === prepared.cases.find(item => item.scenario_id === id).agent_packet).content);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const runCli = args => spawnSync(process.execPath, [path.join(ROOT, 'scripts/prepare-skill-review.mjs'), ...args],
  { cwd: ROOT, encoding: 'utf8', shell: false, windowsHide: true, timeout: 15000, maxBuffer: 1048576 });
const runDirectories = async () => {
  try { return (await readdir(path.join(ROOT, 'artifacts/liveabit-skill-review'))).sort(); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
};

test('agent inputs strictly exclude answers, reviewer notes and answer-bearing Skill links', () => {
  const input = structuredClone(suite);
  for (const item of input.scenarios) {
    item.note = `REVIEW_NOTE_SECRET_${item.id}`;
    item.criteria = [`REVIEW_CRITERIA_SECRET_${item.id}`];
    item.expected.approved_channel = `ANSWER_SECRET_${item.id}`;
  }
  const prepared = build(input);
  for (const file of prepared.files.filter(item => item.role === 'agent_input')) {
    assert.doesNotMatch(file.content, /REVIEW_NOTE_SECRET|REVIEW_CRITERIA_SECRET|ANSWER_SECRET/u);
    const agent = JSON.parse(file.content);
    assert.deepEqual(Object.keys(agent).filter(key => !['skill_guidance', 'events', 'host', 'evaluation_time',
      'invocation', 'user_request', 'prior_evaluation_recorded'].includes(key)), []);
    assert.doesNotMatch(agent.skill_guidance, /references\/evaluation\.md|references\/scenarios\.json|score-review\.mjs|For package review/u);
    assert.equal(Object.hasOwn(agent, 'expected'), false);
    assert.equal(Object.hasOwn(agent, 'note'), false);
    assert.equal(Object.hasOwn(agent, 'criteria'), false);
    assert.equal(Object.hasOwn(agent, 'id'), false);
    assert.deepEqual(Object.keys(agent.host).sort(), Object.keys(suite.scenarios[0].host).sort());
  }
  assert.throws(() => extractSkillGuidance(skillMarkdown.replace('For package review or a real-host pilot, read ', 'Unmarked review material ')), /Invalid synthetic/u);
});

test('event bytes, repeat occurrences and missing pages survive preparation without inferred coverage', () => {
  const prepared = build();
  for (const item of suite.scenarios) {
    const agent = packet(prepared, item.id);
    assert.equal(agent.events.length, item.events.length);
    assert.deepEqual(agent.events.map(canonical), item.events.map(key => canonical(suite.events[key])));
    assert.deepEqual(agent.host, item.host);
    assert.equal(agent.evaluation_time, item.evaluation_time);
    if (item.user_request) assert.equal(agent.user_request, item.user_request);
  }
  const duplicate = packet(prepared, 'duplicate');
  assert.equal(duplicate.prior_evaluation_recorded, true);
  assert.equal(canonical(duplicate.events[0]), canonical(duplicate.events[1]));
  const identities = prepared.cases.find(item => item.scenario_id === 'duplicate').event_occurrences;
  assert.equal(identities.length, 2);
  assert.deepEqual(identities.map(item => item.occurrence), [0, 1]);
  assert.equal(identities[0].event_id, identities[1].event_id);
  assert.equal(identities[0].canonical_sha256, identities[1].canonical_sha256);
  const incomplete = packet(prepared, 'incomplete_pages');
  assert.equal(incomplete.events.length, 1);
  assert.equal(incomplete.events[0].summary.page_index, 0);
  assert.equal(incomplete.events[0].summary.page_count, 2);
  assert.equal(packet(prepared, 'partial_coverage').events[0].summary.coverage.status, 'partial');
});

test('blank review files score as unobserved and do not prefill passing critical checks', () => {
  const prepared = build();
  for (const item of prepared.cases) {
    const observation = JSON.parse(prepared.files.find(file => file.path === item.reviewer_observation).content);
    assert.deepEqual(observation, blankReviewerObservation());
    assert.equal(observation.observed, false);
    assert.deepEqual(Object.keys(observation.critical_checks), [...CRITICAL_CHECKS]);
    assert(Object.values(observation.critical_checks).every(value => value === null));
    assert.equal(scoreReview(suite.scenarios.find(scenario => scenario.id === item.scenario_id), observation).result, 'unobserved');
    observation.observed = true;
    assert.throws(() => scoreReview(suite.scenarios.find(scenario => scenario.id === item.scenario_id), observation), /incomplete or invalid/u);
  }
});

test('invalid fixtures and hidden host fields are rejected before preparation', () => {
  for (const mutate of [
    copy => { copy.real_host_gate_satisfied = true; },
    copy => { copy.scenarios[0].host.expected = 'hidden rubric answer'; },
    copy => { copy.scenarios[0].events = ['missing']; },
    copy => { copy.scenarios[1].id = copy.scenarios[0].id; },
    copy => { copy.events.complete.summary.apps[0].foreground_duration_ms = -1; }
  ]) {
    const input = structuredClone(suite); mutate(input);
    assert.throws(() => build(input));
  }
});

test('CLI rejects external paths and creates distinct, bound local runs without replacing prior files', async () => {
  const before = await runDirectories();
  const help = runCli(['--help']);
  assert.equal(help.status, 0);
  const denied = runCli(['--output', path.join(ROOT, 'unexpected-review-output')]);
  assert.equal(denied.status, 1);
  assert.doesNotMatch(denied.stderr, /unexpected-review-output/u);
  assert.deepEqual(await runDirectories(), before);
  const first = runCli([]);
  assert.equal(first.status, 0, first.stderr);
  const result = JSON.parse(first.stdout);
  assert.match(result.output_directory, /^artifacts\/liveabit-skill-review\/run-[a-f0-9-]{36}$/u);
  const manifestPath = path.join(ROOT, result.manifest);
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  for (const key of ['actual_host_accessed', 'network_accessed', 'device_accessed', 'account_actions_performed',
    'model_invoked', 'activity_delivered', 'agent_evaluation_observed', 'real_host_gate_satisfied', 'm2_gate_satisfied', 'native_profile_enabled']) {
    assert.equal(manifest[key], false, key);
  }
  assert.equal(manifest.synthetic, true);
  assert.equal(manifest.cases.length, suite.scenarios.length);
  const originalFiles = new Map();
  for (const file of manifest.files) {
    assert.match(file.path, /^(?:agent|reviewer)\/case-\d{3}\.json$/u);
    const bytes = await readFile(path.join(ROOT, result.output_directory, file.path));
    assert.equal(bytes.length, file.bytes);
    assert.equal(hash(bytes), file.sha256);
    originalFiles.set(file.path, hash(bytes));
  }
  for (const source of manifest.sources) {
    const bytes = await readFile(path.join(ROOT, source.path));
    assert.equal(bytes.length, source.bytes);
    assert.equal(hash(bytes), source.sha256);
  }
  const second = runCli([]);
  assert.equal(second.status, 0, second.stderr);
  assert.notEqual(JSON.parse(second.stdout).output_directory, result.output_directory);
  assert.equal(hash(await readFile(manifestPath)), hash(manifestBytes));
  for (const [file, originalHash] of originalFiles) {
    assert.equal(hash(await readFile(path.join(ROOT, result.output_directory, file))), originalHash);
  }
  assert.deepEqual((await runDirectories()).filter(name => !before.includes(name)).sort(),
    [path.basename(result.output_directory), path.basename(JSON.parse(second.stdout).output_directory)].sort());
});
