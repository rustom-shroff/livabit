// Instruction/evaluation artifact regressions only. These tests do not execute a
// model, send a notification or demonstrate psychological/behavioral benefit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = relative => readFile(new URL(relative, import.meta.url), 'utf8');
const [skill, workflow, agent, evaluation] = await Promise.all([
  read('../integrations/openclaw/skills/liveabit/SKILL.md'),
  read('../integrations/openclaw/skills/liveabit/references/personal-agent-workflow.md'),
  read('../integrations/openclaw/activity-agent.md'),
  read('../docs/evaluation/personal-agent-conversation.md'),
]);

test('guidance preserves the personal relationship without implying automatic cross-session memory', () => {
  for (const [name, content] of [['skill', skill], ['workflow', workflow], ['agent', agent]]) {
    assert.match(content, /growing (?:activity )?conversation/u, name);
    assert.match(content, /(?:does not automatically|does not imply)[^.\n]*(?:chat|memor)/u, name);
  }
  assert.match(workflow, /Retrieve supported relevant context/u);
});

test('intent and feelings remain optional inquiries rather than telemetry-derived diagnoses', () => {
  assert.match(workflow, /Feelings inquiry is optional/u);
  assert.match(workflow, /user can decline to explain/u);
  assert.match(workflow, /Do not infer a diagnosis or emotional state from app identity/u);
  assert.match(workflow, /Do not force a choice among boredom, stress and inertia/u);
  assert.match(workflow, /current correction or changed goal takes precedence/u);
});

test('contextual alternatives preserve leisure and real shared tasks without granting action authority', () => {
  assert.match(workflow, /rest, connection and intentional entertainment/u);
  assert.match(workflow, /verified meeting in 15 minutes/u);
  assert.match(workflow, /relevant open cards managed by other agents/u);
  assert.match(workflow, /Do not schedule, mutate tasks or act on an email/u);
  assert.match(skill, /Do not filter to cards assigned to the receiving agent/u);
});

test('reconsideration uses actual outcomes and changes approach without automatic pressure', () => {
  for (const approach of ['Understanding', 'Comforting', 'Evoking', 'Scaffolding habits']) {
    assert.ok(workflow.includes(approach), approach);
  }
  assert.match(workflow, /Two packets are not two attempts/u);
  assert.match(workflow, /reconsider_approach[^\n]*advisory cue/u);
  assert.match(workflow, /Reconsider the mechanism, not just the wording/u);
  assert.match(workflow, /does not mean raising severity automatically/u);
  assert.match(workflow, /Do not describe an unconfirmed prompt as ignored/u);
  assert.match(workflow, /Automatic accountability emails[^\n]*remain disabled/u);
});

test('decision replay does not confuse a recorded prompt with a requested or attempted delivery', () => {
  assert.match(workflow, /A duplicate decision does not prove that delivery was requested or attempted/u);
  assert.match(workflow, /Consult its `notification` and `delivery_queue`/u);
  assert.match(workflow, /same ID can be passed to `liveabit_notify`/u);
  assert.match(workflow, /Existing queued, suppressed, settled or uncertain delivery must not be manually retried/u);
  assert.doesNotMatch(workflow, /If `duplicate:true`, do not replace the decision or deliver again/u);
});

test('evaluation cases cover conversation, authority and delivery ambiguity without claiming a model pass', () => {
  const rows = [...evaluation.matchAll(/^\| (CE-\d{2}) \| (.+) \| (.+) \| (PA-AC-[^|]+) \|$/gm)];
  assert.equal(rows.length, 15);
  assert.equal(new Set(rows.map(row => row[1])).size, 15);
  for (const row of rows) {
    assert.ok(row[2].length > 30, `${row[1]} needs a concrete situation`);
    assert.ok(row[3].length > 50, `${row[1]} needs observable review criteria`);
  }
  for (const id of ['CE-02', 'CE-03', 'CE-06', 'CE-07', 'CE-08', 'CE-09', 'CE-10', 'CE-12']) {
    assert.ok(rows.some(row => row[1] === id), id);
  }
  assert.match(evaluation, /not results from the user's phone or a clinical evaluation/u);
  assert.match(evaluation, /They cannot establish empathy, relevance, helpfulness/u);
  assert.match(evaluation, /Passing this rubric on a recorded set of turns establishes only that set's behavior/u);
  assert.match(evaluation, /fake offline node or success callback[^\n]*cannot satisfy these physical checks/u);
});
