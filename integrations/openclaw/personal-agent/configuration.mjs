// Pure configuration planning; native OpenClaw validates/applies its own patch.
import { isAbsolute, join, relative } from 'node:path';

export const PERSONAL_TOOLS = ['liveabit_context', 'liveabit_record_decision', 'liveabit_record_feedback', 'liveabit_notify'];
const unique = values => [...new Set(values.filter(value => typeof value === 'string' && value))];
const check = (condition, reason) => { if (!condition) throw new Error(reason); };
export function planConfiguration(config, { agentId = 'main', stateDir, pluginDir } = {}) {
  check(/^[a-z][a-z0-9_-]{0,63}$/.test(agentId) && isAbsolute(stateDir) && isAbsolute(pluginDir), 'invalid_setup');
  const agent = config.agents?.entries?.[agentId];
  check(agent && typeof agent.workspace === 'string' && isAbsolute(agent.workspace), 'existing_personal_agent_required');
  check(config.gateway?.mode === 'local' && config.gateway?.auth?.mode === 'token', 'authenticated_local_gateway_required');
  check(config.hooks?.token && config.hooks.token !== config.gateway.auth.token, 'separate_existing_hook_token_required');
  check(!config.hooks.path || config.hooks.path === '/hooks', 'unsupported_hook_path');
  check(!config.hooks.transformsDir, 'custom_transform_directory_requires_review');
  const owned = new Set(['liveabit-main', 'liveabit-tasks', 'liveabit-personal']);
  const mappings = (config.hooks.mappings ?? []).filter(mapping => !owned.has(mapping.id));
  check(!mappings.some(mapping => mapping.match?.path === 'liveabit'), 'unrelated_liveabit_route');
  const mainKey = config.session?.mainKey || 'main';
  check(config.session?.scope !== 'global', 'global_session_requires_explicit_migration');
  check(typeof mainKey === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(mainKey), 'unsupported_main_session_key');
  const sessionKey = `agent:${agentId}:${mainKey}`;
  mappings.push({ id: 'liveabit-personal', match: { path: 'liveabit' }, action: 'agent',
    agentId, sessionKey, sessionMode: 'persistent', name: 'liveabit', wakeMode: 'now',
    messageTemplate: '{{message}}', deliver: false, transform: { module: 'liveabit-personal-agent.mjs' } });
  const extraTools = [...PERSONAL_TOOLS, 'workboard_list', 'workboard_read'];
  const oldTools = agent.tools ?? {};
  check(!(Array.isArray(oldTools.allow) && Array.isArray(oldTools.alsoAllow)), 'conflicting_tool_policy');
  check(!(oldTools.deny ?? []).some(name => extraTools.includes(name) || name === 'liveabit-personal-agent'), 'explicit_tool_denial');
  const tools = Array.isArray(oldTools.allow)
    ? { allow: unique([...oldTools.allow, ...extraTools]) }
    : { alsoAllow: unique([...(oldTools.alsoAllow ?? []), ...extraTools]) };
  const entry = { tools };
  // No allowlist means all eligible existing skills; do not narrow it to ours.
  if (Array.isArray(agent.skills)) entry.skills = unique([...agent.skills, 'liveabit']);
  const existingPaths = (config.plugins?.load?.paths ?? []).filter(value => {
    if (typeof value !== 'string' || !isAbsolute(value)) return true;
    const ownRelative = relative(join(stateDir, 'liveabit-personal-agent'), value);
    return ownRelative !== 'plugin' && !/^versions[/\\][a-f0-9]{64}$/.test(ownRelative);
  });
  const plugins = { entries: { 'liveabit-personal-agent': { enabled: true } },
    load: { paths: unique([...existingPaths, pluginDir]) } };
  if (Array.isArray(config.plugins?.allow)) plugins.allow = unique([...config.plugins.allow, 'liveabit-personal-agent']);
  check(!(config.plugins?.deny ?? []).includes('liveabit-personal-agent'), 'explicit_plugin_denial');
  const patch = { agents: { entries: { [agentId]: entry } }, plugins,
    hooks: { enabled: true, path: '/hooks', mappings,
      allowedAgentIds: unique([...(config.hooks.allowedAgentIds ?? []), agentId]),
      allowRequestSessionKey: false,
      allowedSessionKeyPrefixes: unique([...(config.hooks.allowedSessionKeyPrefixes ?? []), sessionKey]) } };
  return { patch, agentId, mainKey, sessionKey, workspace: agent.workspace,
    pluginDir, settingsPath: join(stateDir, 'liveabit-personal-agent', 'settings.json'),
    databasePath: join(stateDir, 'plugins', 'liveabit-personal-agent', 'activity.sqlite'),
    deliveryPolicyPath: join(agent.workspace, 'skills', 'liveabit', 'references', 'delivery.json'),
    deliveryStatePath: join(agent.workspace, 'skills', 'liveabit', 'references', 'delivery-state.json') };
}
export function updateManagedInstructions(existing, guide) {
  const start = '<!-- liveabit-personal-agent:start -->', end = '<!-- liveabit-personal-agent:end -->';
  const section = start + '\n' + guide.trimEnd() + '\n' + end;
  if (existing.includes(start) || existing.includes(end)) {
    const first = existing.indexOf(start), last = existing.indexOf(end);
    check(first >= 0 && last > first && existing.indexOf(start, first + start.length) < 0
      && existing.indexOf(end, last + end.length) < 0, 'ambiguous_managed_instructions');
    return existing.slice(0, first) + section + existing.slice(last + end.length);
  }
  return existing + (existing.endsWith('\n') || !existing ? '' : '\n') + '\n' + section + '\n';
}
