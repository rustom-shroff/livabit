import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { ActivityStore } from '../integrations/openclaw/personal-agent/store.mjs';
import { resolveConversationAccess, recordConversationFeedback } from '../integrations/openclaw/personal-agent/conversation.mjs';

const settings = {
  agentId: 'main', sessionKey: 'agent:main:liveabit-activity', mainSessionKey: 'agent:main:main'
};
const activity = { agentId: 'main', sessionKey: settings.sessionKey, sandboxed: false };
const main = { agentId: 'main', sessionKey: settings.mainSessionKey, sandboxed: false };

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'liveabit-conversation-'));
  const store = new ActivityStore(join(directory, 'activity.sqlite'));
  t.after(() => {
    store.close();
    const absolute = resolve(directory);
    assert(absolute.startsWith(resolve(tmpdir()) + sep));
    rmSync(absolute, { recursive: true, force: true });
  });
  const decision = store.recordDecision({ agentId: settings.agentId, sessionKey: settings.sessionKey,
    topic: 'A chosen work break', action: 'question', approach: 'ask about intention',
    rationale: 'Usage duration alone does not establish intent.', prompt: 'Is this the break you intended?' });
  return { store, decision };
}

test('main chat shares episode reading and reply recording without background decision authority', () => {
  for (const name of ['liveabit_context', 'liveabit_record_feedback']) {
    assert.deepEqual(resolveConversationAccess(settings, main, name), {
      agentId: 'main', sessionKey: settings.sessionKey, origin: 'main'
    });
  }
  for (const name of ['liveabit_record_decision', 'liveabit_notify', 'liveabit_schedule_review', 'unknown']) {
    assert.equal(resolveConversationAccess(settings, main, name), null);
  }
  for (const name of ['liveabit_context', 'liveabit_record_decision', 'liveabit_record_feedback', 'liveabit_notify', 'liveabit_schedule_review']) {
    assert.equal(resolveConversationAccess(settings, activity, name).origin, 'activity');
  }
});

test('foreign agents, foreign conversations and sandboxed copies cannot cross the bridge', () => {
  for (const invocation of [
    { ...main, agentId: 'liveabit' }, { ...activity, agentId: 'other' },
    { ...main, sessionKey: 'agent:main:foreign' },
    { ...main, sessionKey: settings.mainSessionKey + ':child' },
    { ...main, sandboxed: true }, { ...activity, sandboxed: true }, null
  ]) {
    assert.equal(resolveConversationAccess(settings, invocation, 'liveabit_context'), null);
    assert.throws(() => recordConversationFeedback({ store: {}, settings, invocation }), /invocation_unavailable/);
  }
});

test('a main-chat report links to the activity episode and caller ownership fields are ignored', t => {
  const { store, decision } = fixture(t);
  const recorded = recordConversationFeedback({ store, settings, invocation: main, args: {
    episodeId: decision.episode_id, decisionId: decision.decision_id,
    kind: 'user_report', outcome: 'intentional_use', report: 'I chose a short break.',
    agentId: 'other', sessionKey: 'agent:other:main', requestReview: false
  } });
  assert.equal(recorded.recorded, true);
  const episode = store.episodes(settings.agentId, settings.sessionKey)[0];
  assert.equal(episode.feedback.length, 1);
  assert.equal(episode.feedback[0].outcome, 'intentional_use');
  assert.equal(episode.feedback[0].decision_id, decision.decision_id);
  assert.equal(store.episodes(settings.agentId, settings.mainSessionKey).length, 0);
  assert.equal(store.episodes('other', 'agent:other:main').length, 0);
});

test('reply linkage rejects another episode owner or a decision from another episode', t => {
  const { store, decision } = fixture(t);
  const foreign = store.recordDecision({ agentId: 'other', sessionKey: 'agent:other:main', topic: 'Foreign',
    action: 'reflect', approach: 'reflection', rationale: 'Separate owner.' });
  const send = args => recordConversationFeedback({ store, settings, invocation: main, args: {
    kind: 'user_report', outcome: 'helpful', ...args
  } });
  assert.throws(() => send({ episodeId: foreign.episode_id }), /episode_unavailable/);
  assert.throws(() => send({ episodeId: decision.episode_id, decisionId: foreign.decision_id }), /decision_unavailable/);
  assert.equal(store.episodes(settings.agentId, settings.sessionKey)[0].feedback.length, 0);
});

test('legacy single-session settings remain usable during an atomic host migration', () => {
  const legacy = { agentId: 'main', sessionKey: 'agent:main:main' };
  assert.deepEqual(resolveConversationAccess(legacy, main, 'liveabit_notify'), {
    agentId: 'main', sessionKey: legacy.sessionKey, origin: 'activity'
  });
});

test('only a linked main-chat user report requests fresh background consideration', () => {
  const records = [];
  const store = { recordFeedback(value) { records.push(value); return { recorded: true }; } };
  const common = { episodeId: 'episode', outcome: 'feeling_report', report: 'I feel stuck.' };
  recordConversationFeedback({ store, settings, invocation: main, args: { ...common, kind: 'user_report' } });
  recordConversationFeedback({ store, settings, invocation: activity, args: { ...common, kind: 'user_report', requestReview: true } });
  recordConversationFeedback({ store, settings, invocation: main, args: { ...common, kind: 'delivery_result', requestReview: true } });
  assert.deepEqual(records.map(record => record.requestReview), [true, false, false]);
});
