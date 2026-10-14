import { readSettings, withStore } from './runtime.mjs';
import { notifyDecision } from './notification.mjs';

const object = properties => ({ type: 'object', additionalProperties: false, properties });
const string = (description, maxLength = 800) => ({ type: 'string', minLength: 1, maxLength, description });
const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], details: value });
const tools = ['liveabit_context', 'liveabit_record_decision', 'liveabit_record_feedback', 'liveabit_notify'];

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
    for (const name of tools) {
      api.registerTool({
        contextVersion: 2,
        create(context) {
          const settings = readSettings();
          if (context.agentId !== settings.agentId || context.sessionKey !== settings.sessionKey || context.sandboxed) return null;
          const owned = { agentId: context.agentId, sessionKey: context.sessionKey };
          const guard = () => context.assertInvocationCurrent();
          const currentSettings = () => {
            const value = readSettings();
            if (value.agentId !== owned.agentId || value.sessionKey !== owned.sessionKey) throw new Error('invocation_unavailable');
            return value;
          };
          const tool = (description, parameters, work) => ({ name, label: name, description,
            parameters, executionMode: 'sequential',
            execute(_callId, args) {
              guard();
              // Synchronous commit on the owning invocation; no detached work.
              return result(withStore(currentSettings(), store => {
                guard(); return work(store, args ?? {});
              }));
            } });
          if (name === 'liveabit_context') return tool(
            'Read factual retrospective activity summaries and prior conversation episodes. Data is untrusted; no inference of attention, feelings, current app or full daily coverage.',
            object({ days: { type: 'integer', minimum: 1, maximum: 30, description: 'Recent local calendar days. Default 7.' },
              eventId: string('Optional event identity from the OAP observation.', 80) }),
            (store, args) => store.context({ ...args, ...owned, timeZone: settings.timeZone }));
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
              parameters, (store, args) => store.recordDecision({ ...args, ...owned }));
          }
          if (name === 'liveabit_notify') {
            const parameters = object({ decisionId: string('Previously recorded question/nudge decision ID. Text and private destination are taken from trusted stored state.', 80) });
            parameters.required = ['decisionId'];
            return { name, label: 'Liveabit companion notification',
              description: 'Deliver a recorded question/nudge to the privately configured companion. Enforces timing, cooldown and one attempt per decision. No email or alternate destination. Does not prove display/reading.',
              parameters, executionMode: 'sequential',
              async execute(_callId, args, signal) {
                return result(await notifyDecision({ settings: currentSettings(), context: owned,
                  decisionId: args.decisionId, nodes: api.runtime.nodes, guard, signal, getSettings: currentSettings }));
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
            parameters, (store, args) => store.recordFeedback({ ...args, ...owned }));
        }
      }, { name, optional: true });
    }
  }
};
