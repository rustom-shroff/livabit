// One personal agent, two exact conversation surfaces. Main chat can read the
// shared episode ledger and record a deliberately linked reply. Background
// activity owns decisions and delivery; no arbitrary transcript is imported.
const ACTIVITY_TOOLS = new Set([
  'liveabit_context', 'liveabit_record_decision', 'liveabit_record_feedback',
  'liveabit_notify', 'liveabit_schedule_review'
]);
const MAIN_TOOLS = new Set(['liveabit_context', 'liveabit_record_feedback']);

export function resolveConversationAccess(settings, invocation, toolName) {
  if (!settings || !invocation || invocation.sandboxed
    || invocation.agentId !== settings.agentId) return null;
  const activity = invocation.sessionKey === settings.sessionKey;
  const main = invocation.sessionKey === settings.mainSessionKey;
  if (!(activity ? ACTIVITY_TOOLS : main ? MAIN_TOOLS : new Set()).has(toolName)) return null;
  return {
    agentId: settings.agentId,
    sessionKey: settings.sessionKey,
    origin: activity ? 'activity' : 'main'
  };
}

export function recordConversationFeedback({ store, settings, invocation, args = {} }) {
  const access = resolveConversationAccess(settings, invocation, 'liveabit_record_feedback');
  if (!access) throw new Error('invocation_unavailable');
  // Deliberately select fields: neither caller-supplied ownership nor a forged
  // scheduler flag may change the trusted session or manufacture a wake-up.
  const { episodeId, decisionId, kind, outcome, report } = args;
  return store.recordFeedback({
    agentId: access.agentId, sessionKey: access.sessionKey,
    episodeId, decisionId, kind, outcome, report,
    requestReview: access.origin === 'main' && kind === 'user_report'
  });
}
