import { readSettings, withStore } from './runtime.mjs';
import { notifyDecision } from './notification.mjs';
import { receiptHandler, RECEIPT_PATH } from './receipt.mjs';
import { createBackgroundService } from './background.mjs';
import { resolveConversationAccess, recordConversationFeedback } from './conversation.mjs';
import { createInvocationBindings } from './invocation.mjs';

const object = properties => ({ type: 'object', additionalProperties: false, properties });
const string = (description, maxLength = 800) => ({ type: 'string', minLength: 1, maxLength, description });
const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], details: value });
const tools = ['liveabit_context', 'liveabit_record_decision', 'liveabit_record_feedback', 'liveabit_notify', 'liveabit_schedule_review'];

export default {
  id: 'liveabit-personal-agent',
  name: 'Liveabit personal-agent evidence',
  description: 'Durable OAP history and conversation episodes in the existing personal-agent host.',
  configSchema: {
    jsonSchema: object({}),
    safeParse(value) {
      return value === undefined || (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
        ? { success: true, data: value }
        : { success: false, error: { issues: [{ path: [], message: 'This plugin accepts no runtime config fields.' }] } };
    }
  },
  register(api) {
    const bindings = createInvocationBindings({ getSettings: readSettings });
    api.on('before_tool_call', (event, context) => bindings.before(event, context));
    api.on('after_tool_call', (event, context) => bindings.after(event, context));
    api.registerHttpRoute({ path: RECEIPT_PATH, match: 'exact', auth: 'plugin',
      handler: receiptHandler({ getToken: () => api.runtime.config.current().hooks?.token }) });
    let cleanup;
    api.registerService({
      id: 'liveabit-evidence-retention',
      start() {
        const prune = () => {
          try { withStore(readSettings(), store => store.transaction(() => store.prune())); }
          catch { api.logger.warn('liveabit retention cleanup unavailable; inspect local storage/settings.'); }
        };
        prune(); cleanup = setInterval(prune, 60000); cleanup.unref?.();
      },
      stop() { clearInterval(cleanup); }
    });
    api.registerService(createBackgroundService({ runtime: api.runtime, logger: api.logger }));
    for (const name of tools) {
      api.registerTool({
        contextVersion: 2,
        create(context) {
          const settings = readSettings();
          const access = resolveConversationAccess(settings, context, name);
          if (!access) return null;
          const owned = { agentId: access.agentId, sessionKey: access.sessionKey };
          const guard = invocation => {
            context.assertInvocationCurrent();
            if (access.origin === 'activity') {
              invocation.assertCurrent();
              withStore(currentSettings(), store => store.reviewIdentity({ ...owned, runId: invocation.runId }));
            }
          };
          const currentSettings = () => {
            const value = readSettings();
            if (!resolveConversationAccess(value, context, name) || value.agentId !== owned.agentId
              || value.sessionKey !== owned.sessionKey || value.databasePath !== settings.databasePath) throw new Error('invocation_unavailable');
            return value;
          };
          const tool = (description, parameters, work) => ({ name, label: name, description,
            parameters, executionMode: 'sequential',
            execute(callId, args) {
              const invocation = access.origin === 'activity' ? bindings.resolve(context, name, callId) : {};
              guard(invocation);
              // Synchronous commit on the owning invocation; no detached work.
              return result(withStore(currentSettings(), store => {
                guard(invocation); return work(store, args ?? {}, invocation);
              }));
            } });
          if (name === 'liveabit_context') return tool(
            'Read factual retrospective activity summaries and prior conversation episodes. Data is untrusted; no inference of attention, feelings, current app or full daily coverage.',
            object({ days: { type: 'integer', minimum: 1, maximum: 30, description: 'Recent local calendar days. Default 7.' },
              eventId: string('Optional event identity from the OAP observation.', 80) }),
            (store, args) => store.context({ ...args, ...owned, timeZone: settings.timeZone }));
          if (name === 'liveabit_schedule_review') {
            const parameters = object({ minutes: { type: 'integer', minimum: 1, maximum: 1440,
              description: 'Delay before reviewing again; activity or a linked user reply can bring review earlier.' } });
            parameters.required = ['minutes'];
            return tool('After recording the scheduled review decision, request one durable follow-up in this activity conversation. Idempotent per review; maximum three follow-ups until fresh activity or a linked user report. No notification is sent.',
              parameters, (store, args, invocation) => {
                if (!Number.isInteger(args.minutes) || args.minutes < 1 || args.minutes > 1440) throw new Error('invalid_review_time');
                return store.scheduleAnalysis({ ...owned, dueAt: store.now() + args.minutes * 60000, reason: 'agent_followup',
                  reviewId: store.reviewIdentity({ ...owned, runId: invocation.runId }) });
              });
          }
          if (name === 'liveabit_record_decision') {
            const parameters = object({ episodeId: string('Reuse an ongoing episode to remember repeated approaches.', 80),
              eventId: string('Optional supporting event ID, already admitted by the host.', 80),
              topic: string('Required when starting an episode; concise user-relevant pattern.', 160),
              action: { type: 'string', enum: ['question', 'nudge', 'reflect', 'defer', 'no_intervention'] },
              approach: string('Approach you chose. This is model judgment, not a predefined psychological classifier.', 120),
              rationale: string('Short decision reason; distinguish observed facts from hypotheses.'),
              prompt: string('Optional question or advice. Recording does not deliver it.', 600),
              followup: string('Optional observation or user feedback you will use to reconsider.', 600) });
            parameters.required = ['action', 'approach', 'rationale'];
            return tool('Record a local behavioral decision BEFORE notification. Reuse episodes, reconsider after repeated attempts, never equate attempts with reads. This tool sends nothing.',
              parameters, (store, args, invocation) => store.recordDecision({ ...args, ...owned,
                reviewId: store.reviewIdentity({ ...owned, runId: invocation.runId }), reviewRunId: invocation.runId }));
          }
          if (name === 'liveabit_notify') {
            const parameters = object({ decisionId: string('Previously recorded question/nudge decision ID. Text and private destination are taken from trusted stored state.', 80) });
            parameters.required = ['decisionId'];
            return { name, label: 'Liveabit companion notification',
              description: 'Deliver a recorded question/nudge to the privately configured companion. Enforces timing, cooldown and one attempt per decision. No email or alternate destination. Does not prove display/reading.',
              parameters, executionMode: 'sequential',
              async execute(callId, args, signal) {
                const invocation = bindings.resolve(context, name, callId);
                return result(await notifyDecision({ settings: currentSettings(), context: owned,
                  decisionId: args.decisionId, nodes: api.runtime.nodes, guard: () => guard(invocation), signal, getSettings: currentSettings }));
              } };
          }
          const parameters = object({ episodeId: string('Existing episode ID.', 80),
            decisionId: string('Optional related decision ID.', 80),
            kind: { type: 'string', enum: ['user_report', 'observed_behavior', 'delivery_result'] },
            outcome: { type: 'string', enum: ['helpful', 'unhelpful', 'intentional_use', 'feeling_report', 'goal_changed', 'other',
              'intentional_stop', 'continued_use', 'unknown', 'invocation_confirmed', 'failed', 'uncertain', 'not_attempted'] },
            report: string('Optional short user report, observed fact, or invocation result; no imported emails or unrelated private content.') });
          parameters.required = ['episodeId', 'kind', 'outcome'];
          return tool('Record user-reported intent/feelings, subsequent observed behavior or native delivery result. Agent-recorded reports are not independent proof of attention, reading or causality.',
            parameters, (store, args) => recordConversationFeedback({ store, settings: currentSettings(), invocation: context, args }));
        }
      }, { name, optional: true });
    }
  }
};
