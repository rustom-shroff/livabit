// Read-only audit of the installed 2026.9.9 SDK. Evaluate only its extracted
// pure metadata builders with synthetic IDs; do not import the host runtime,
// open native state, run a model, or invoke a device.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--dist') throw new Error('Use --dist <installed OpenClaw dist directory>.');
const sources = new Map();
const read = name => {
  if (!sources.has(name)) sources.set(name, readFileSync(join(args[1], name), 'utf8'));
  return sources.get(name);
};
const slice = (source, start, end) => {
  const first = source.indexOf(start), last = source.indexOf(end, first + start.length);
  if (first < 0 || last < 0 || source.indexOf(start, first + start.length) !== -1) throw new Error('Native SDK source contract changed; review required.');
  return source.slice(first, last).trim();
};

const factorySource = read('openclaw-tools-DIUCugPR.mjs');
const nativeFactory = runInNewContext('(' + slice(factorySource,
  'function resolveOpenClawPluginToolInputs(params) {', '\n//#endregion') + ')', {
  resolveSessionAgentIds: () => ({ sessionAgentId: 'main' }),
  resolveWorkspaceRoot: value => value,
  normalizeDeliveryContext: () => undefined,
  normalizeConversationReadInvocationOrigin: value => value
});
const sessionKey = 'agent:main:liveabit-activity', sessionId = 'synthetic-session', runId = 'synthetic-native-run', toolCallId = 'synthetic-native-call';
// Evaluate both actual routing projections from the same run options. Giving
// the fallback chat a different key catches a disagreement between the factory
// and hook paths rather than making their equality true by construction.
const toolsSource = read('agent-tools-HIqp3eTk.mjs');
const routing = slice(toolsSource, 'const executionAgentId =', '\n\tconst attachmentReadRoot');
const pluginOptions = slice(toolsSource, 'const pluginToolOptions = {', '\n\tconst pluginToolsOnly =');
const hookContext = slice(toolsSource, 'const hookContext = {', '\n\treturn finalizeAgentTools(');
const nativeContexts = runInNewContext('(function(options) {' + routing + pluginOptions + hookContext
  + ';return {pluginToolOptions,hookContext};})', {
  agentId: 'main', workspaceRoot: 'synthetic-workspace', codingRoot: 'synthetic-workspace', fsPolicy: undefined,
  sandbox: undefined, pluginToolAllowlist: undefined, pluginToolDenylist: undefined,
  sandboxRoot: undefined, sandboxFsBridge: undefined, allowWorkspaceWrites: false,
  hasRequester: false, turnSourceChannel: undefined, turnSourceTo: undefined,
  resolveGatewayMessageChannel: value => value, resolveToolLoopDetectionConfig: () => ({})
})({ agentId: 'main', runSessionKey: sessionKey, sessionKey: 'agent:main:main', sessionId, runId });
const factory = nativeFactory({ options: nativeContexts.pluginToolOptions }).context;

const beforeSource = read('agent-tools.before-tool-call-Cg8vCu9u.mjs');
const beforeBuilder = slice(beforeSource, 'const buildToolContext = (identity) => ({', '\n\t\tconst toolContext = buildToolContext');
const makeBefore = runInNewContext('(function(args, toolName) {' + beforeBuilder + ';return buildToolContext({});})');
const abort = new AbortController();
const before = makeBefore({ ctx: nativeContexts.hookContext, toolCallId, signal: abort.signal }, 'liveabit_record_decision');

let after;
const afterSource = read('hook-helpers-88BXuErh.mjs');
const emitAfter = runInNewContext('(' + slice(afterSource,
  'async function runAgentHarnessAfterToolCallHook(params) {', '\n/** Runs before-message-write hooks') + ')', {
  consumeAdjustedParamsForToolCall: () => undefined,
  getGlobalHookRunner: () => ({ hasHooks: () => true, runAfterToolCall: async (_event, context) => { after = context; } }),
  structuredClone, cloneHookIsolationValue: (_name, value) => structuredClone(value),
  log: { warn: () => { throw new Error('Native after-hook extraction failed.'); } }
});
await emitAfter({ ...nativeContexts.hookContext, toolCallId, toolName: 'liveabit_record_decision', startArgs: {}, result: { content: [] } });

// Use the actual forwarding argument list from the native before-call wrapper.
// The identity is not reconstructed by our application or by this audit.
const argumentsSource = slice(beforeSource, 'const args = [\n\t\t\t\t\t\ttoolCallId,', '\n\t\t\t\t\tconst invoke =');
const forwarded = runInNewContext('(function(toolCallId, executeParams, signal, onUpdate, executionArgs) {'
  + argumentsSource + ';return args;})')(toolCallId, {}, abort.signal, undefined, []);
const fields = ['agentId', 'sessionKey', 'sessionId', 'runId', 'toolCallId'];
const checks = {
  factory_has_session_identity: factory.agentId === 'main' && factory.sessionKey === sessionKey && factory.sessionId === sessionId,
  factory_omits_run_id: !Object.hasOwn(factory, 'runId'),
  before_context_has_host_run_and_call: before.runId === runId && before.toolCallId === toolCallId,
  before_context_matches_factory_session: ['agentId', 'sessionKey', 'sessionId'].every(field => before[field] === factory[field]),
  before_context_has_cancellation_signal: before.abortSignal === abort.signal,
  execute_receives_same_call_id: forwarded[0] === before.toolCallId,
  after_context_matches_before: fields.every(field => after?.[field] === before[field])
};
const passed = Object.values(checks).every(value => value === true);
console.log(JSON.stringify({ format: 'liveabit.openclaw-sdk-invocation-contract.v1', passed, checks,
  source_files: [...sources].map(([name, source]) => ({ name, sha256: createHash('sha256').update(source).digest('hex') })),
  native_state_opened: false, model_run: false, notification_sent: false,
  limitation: 'Extracted installed metadata builders with synthetic identities; full model-tool execution and lifecycle are separate checks.' }, null, 2));
if (!passed) process.exitCode = 1;
