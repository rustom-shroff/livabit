// The installed SDK tool factory omits runId. Its documented before/after
// tool-call hooks carry authoritative run and call identities instead.
import { withStore } from './runtime.mjs';

const names = new Set(['liveabit_context', 'liveabit_record_decision', 'liveabit_record_feedback', 'liveabit_notify', 'liveabit_schedule_review']);
const key = (context, name, callId) => JSON.stringify([context.agentId, context.sessionKey, context.sessionId ?? null, name, callId]);
export function createInvocationBindings({ getSettings, now = Date.now }) {
  const entries = new Map();
  const prune = () => { for (const [id, value] of entries) if (value.expires <= now()) entries.delete(id); };
  return {
    before(event, context) {
      if (!names.has(event.toolName)) return;
      let settings;
      try { settings = getSettings(); } catch { return { block: true, blockReason: 'Livabit settings unavailable.' }; }
      if (context.agentId !== settings.agentId || context.sessionKey !== settings.sessionKey) return;
      const callId = context.toolCallId, runId = context.runId;
      if (typeof callId !== 'string' || !callId || callId.length > 256 || typeof runId !== 'string' || !runId || runId.length > 256)
        return { block: true, blockReason: 'Livabit invocation identity unavailable.' };
      if (context.abortSignal?.aborted) return { block: true, blockReason: 'Livabit tool call was cancelled.' };
      try { withStore(settings, store => { store.now = now;
        return store.reviewIdentity({ agentId: context.agentId, sessionKey: context.sessionKey, runId }); }); }
      catch { return { block: true, blockReason: 'This Livabit scheduled review has expired or been replaced.' }; }
      prune();
      const id = key(context, event.toolName, callId), prior = entries.get(id);
      if ((prior && prior.runId !== runId) || entries.size >= 256)
        return { block: true, blockReason: 'Livabit invocation binding unavailable.' };
      entries.set(id, { runId, signal: context.abortSignal, expires: now() + 900000 });
    },
    after(event, context) {
      const id = key(context, event.toolName, context.toolCallId);
      if (entries.get(id)?.runId === context.runId) entries.delete(id);
    },
    resolve(context, name, callId) {
      prune();
      const id = key(context, name, callId), binding = entries.get(id);
      if (!binding || binding.signal?.aborted) throw new Error('invocation_unavailable');
      return { runId: binding.runId, assertCurrent() {
        if (entries.get(id) !== binding || binding.expires <= now() || binding.signal?.aborted) throw new Error('invocation_unavailable');
      } };
    }
  };
}
