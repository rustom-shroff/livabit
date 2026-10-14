import test from 'node:test';
import assert from 'node:assert/strict';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { PERSONAL_TOOLS, planConfiguration, updateManagedInstructions } from '../integrations/openclaw/personal-agent/configuration.mjs';

// These paths and credentials are synthetic. Planning does not read or write them.
const stateDir = resolve('test-fixtures', 'synthetic-openclaw-state');
const pluginDir = join(stateDir, 'liveabit-personal-agent', 'plugin');
const workspace = resolve('test-fixtures', 'synthetic-personal-workspace');
const options = { stateDir, pluginDir };
const start = '<!-- liveabit-personal-agent:start -->';
const end = '<!-- liveabit-personal-agent:end -->';

function fixture() {
  return {
    gateway: { mode: 'local', auth: { mode: 'token', token: 'synthetic-gateway-token' } },
    hooks: {
      enabled: true, path: '/hooks', token: 'synthetic-hook-token',
      mappings: [], allowedAgentIds: ['other'], allowedSessionKeyPrefixes: ['agent:other:main'],
    },
    session: { mainKey: 'main' },
    agents: { entries: {
      main: {
        workspace, model: { primary: 'synthetic/model' }, thinkingDefault: 'high',
        agentRuntime: { id: 'synthetic-runtime' }, agentDir: join(stateDir, 'agents', 'main'),
        tools: { profile: 'synthetic-existing-profile', deny: ['camera'],
          fs: { workspaceOnly: true }, exec: { security: 'allowlist' } },
      },
      other: { workspace: resolve('test-fixtures', 'synthetic-other-workspace'), model: 'synthetic/other' },
    } },
    plugins: { entries: { 'synthetic-existing-plugin': { enabled: true, config: { custom: 'preserved' } } } },
  };
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test('configuration fixes OAP routing to the existing main conversation and disables hook announcements', () => {
  const config = fixture();
  config.hooks.mappings = [
    { id: 'liveabit-main', match: { path: 'liveabit' }, action: 'agent', agentId: '{{agentId}}', sessionKey: '{{sessionKey}}', deliver: true },
    { id: 'liveabit-tasks', match: { path: 'liveabit' }, action: 'agent', agentId: 'liveabit', sessionMode: 'isolated' },
  ];
  const plan = planConfiguration(freeze(config), options);
  assert.equal(plan.agentId, 'main');
  assert.equal(plan.sessionKey, 'agent:main:main');
  assert.deepEqual(plan.patch.hooks.mappings, [{
    id: 'liveabit-personal', match: { path: 'liveabit' }, action: 'agent', agentId: 'main',
    sessionKey: 'agent:main:main', sessionMode: 'persistent', name: 'liveabit', wakeMode: 'now',
    messageTemplate: '{{message}}', deliver: false, transform: { module: 'liveabit-personal-agent.mjs' },
  }]);
  assert.equal(plan.patch.hooks.allowRequestSessionKey, false);
  assert.ok(plan.patch.hooks.allowedAgentIds.includes('main'));
  assert.ok(plan.patch.hooks.allowedSessionKeyPrefixes.includes('agent:main:main'));
});

test('planning leaves unrelated routes and existing agent models, permissions and unrestricted skills untouched', () => {
  const config = fixture();
  const unrelated = { id: 'synthetic-mail-route', match: { path: 'mail' }, action: 'agent',
    agentId: 'other', sessionKey: 'agent:other:mail', deliver: true,
    transform: { module: 'synthetic-mail-transform.mjs' } };
  config.hooks.mappings = [unrelated];
  config.hooks.allowRequestSessionKey = true;
  const before = structuredClone(config);
  const plan = planConfiguration(freeze(config), options);
  assert.deepEqual(config, before);
  assert.deepEqual(plan.patch.hooks.mappings[0], unrelated);
  assert.deepEqual(plan.patch.hooks.allowedAgentIds, ['other', 'main']);
  assert.deepEqual(plan.patch.hooks.allowedSessionKeyPrefixes, ['agent:other:main', 'agent:main:main']);
  const entry = plan.patch.agents.entries.main;
  // Native config patch merges objects: omitted existing fields must remain intact.
  assert.deepEqual(Object.keys(entry), ['tools']);
  for (const key of ['workspace', 'model', 'thinkingDefault', 'agentRuntime', 'agentDir', 'skills']) {
    assert.equal(Object.hasOwn(entry, key), false);
  }
  for (const key of ['profile', 'deny', 'fs', 'exec']) assert.equal(Object.hasOwn(entry.tools, key), false);
  assert.equal(Object.hasOwn(plan.patch.agents.entries, 'other'), false);
  assert.deepEqual(plan.patch.plugins.entries, { 'liveabit-personal-agent': { enabled: true } });
  assert.equal(Object.hasOwn(plan.patch.plugins, 'allow'), false);
  assert.deepEqual(config.agents.entries.main.tools.deny, ['camera']);
  assert.deepEqual(config.agents.entries.main.tools.fs, { workspaceOnly: true });
});

test('existing tool allowlists are extended without creating an alsoAllow policy', () => {
  const config = fixture();
  config.agents.entries.main.tools.allow = ['calendar_read', 'mail_read', 'liveabit_context', 'calendar_read'];
  const entry = planConfiguration(config, options).patch.agents.entries.main;
  assert.deepEqual(entry.tools.allow, ['calendar_read', 'mail_read', ...PERSONAL_TOOLS, 'workboard_list', 'workboard_read']);
  assert.equal(Object.hasOwn(entry.tools, 'alsoAllow'), false);
});

test('existing additive tool access is preserved without replacing it with an allowlist', () => {
  const config = fixture();
  config.agents.entries.main.tools.alsoAllow = ['calendar_read', 'mail_read', 'liveabit_context'];
  const entry = planConfiguration(config, options).patch.agents.entries.main;
  assert.deepEqual(entry.tools.alsoAllow, ['calendar_read', 'mail_read', ...PERSONAL_TOOLS, 'workboard_list', 'workboard_read']);
  assert.equal(Object.hasOwn(entry.tools, 'allow'), false);
  const fresh = planConfiguration(fixture(), options).patch.agents.entries.main;
  assert.deepEqual(fresh.tools.alsoAllow, [...PERSONAL_TOOLS, 'workboard_list', 'workboard_read']);
  assert.equal(Object.hasOwn(fresh.tools, 'allow'), false);
});

test('an explicit skill or plugin allowlist keeps its existing entries when liveabit is added', () => {
  const config = fixture();
  config.agents.entries.main.skills = ['calendar', 'personal-tasks', 'liveabit', 'calendar'];
  config.plugins.allow = ['synthetic-existing-plugin', 'synthetic-existing-plugin'];
  const patch = planConfiguration(config, options).patch;
  assert.deepEqual(patch.agents.entries.main.skills, ['calendar', 'personal-tasks', 'liveabit']);
  assert.deepEqual(patch.plugins.allow, ['synthetic-existing-plugin', 'liveabit-personal-agent']);
});

test('conflicting allow and alsoAllow policies are rejected instead of silently changing access', () => {
  const config = fixture();
  config.agents.entries.main.tools.allow = [];
  config.agents.entries.main.tools.alsoAllow = [];
  assert.throws(() => planConfiguration(config, options), /conflicting_tool_policy/);
});

test('explicit denial of required tools or this plugin is not overridden', () => {
  for (const denied of [...PERSONAL_TOOLS, 'workboard_list', 'workboard_read', 'liveabit-personal-agent']) {
    const config = fixture();
    config.agents.entries.main.tools.deny.push(denied);
    assert.throws(() => planConfiguration(config, options), /explicit_tool_denial/);
  }
  const config = fixture();
  config.plugins.deny = ['liveabit-personal-agent'];
  assert.throws(() => planConfiguration(config, options), /explicit_plugin_denial/);
});

test('an unrelated liveabit route or custom transform directory requires review', () => {
  const collision = fixture();
  collision.hooks.mappings = [{ id: 'synthetic-user-owned-route', match: { path: 'liveabit' }, action: 'agent', agentId: 'other' }];
  assert.throws(() => planConfiguration(collision, options), /unrelated_liveabit_route/);
  const custom = fixture();
  custom.hooks.transformsDir = resolve('test-fixtures', 'custom-hook-transforms');
  assert.throws(() => planConfiguration(custom, options), /custom_transform_directory_requires_review/);
});

test('unknown agents, unsupported sessions and relative owned paths cannot be planned', () => {
  assert.throws(() => planConfiguration(fixture(), { ...options, agentId: 'missing' }), /existing_personal_agent_required/);
  assert.throws(() => planConfiguration(fixture(), { ...options, agentId: '{{agentId}}' }), /invalid_setup/);
  assert.throws(() => planConfiguration(fixture(), { ...options, stateDir: 'relative-state' }), /invalid_setup/);
  assert.throws(() => planConfiguration(fixture(), { ...options, pluginDir: 'relative-plugin' }), /invalid_setup/);
  const config = fixture();
  config.session.mainKey = '{{sessionKey}}';
  assert.throws(() => planConfiguration(config, options), /unsupported_main_session_key/);
});

test('authenticated local routing requires an existing separate hook token', () => {
  const sharedToken = fixture();
  sharedToken.hooks.token = sharedToken.gateway.auth.token;
  assert.throws(() => planConfiguration(sharedToken, options), /separate_existing_hook_token_required/);
  const missingToken = fixture();
  delete missingToken.hooks.token;
  assert.throws(() => planConfiguration(missingToken, options), /separate_existing_hook_token_required/);
  const remote = fixture();
  remote.gateway.mode = 'remote';
  assert.throws(() => planConfiguration(remote, options), /authenticated_local_gateway_required/);
});

test('settings and activity database stay within the selected state directory and delivery files within the existing workspace', () => {
  const plan = planConfiguration(fixture(), options);
  assert.equal(plan.workspace, workspace);
  assert.equal(plan.pluginDir, pluginDir);
  assert.equal(plan.settingsPath, join(stateDir, 'liveabit-personal-agent', 'settings.json'));
  assert.equal(plan.databasePath, join(stateDir, 'plugins', 'liveabit-personal-agent', 'activity.sqlite'));
  assert.equal(plan.deliveryPolicyPath, join(workspace, 'skills', 'liveabit', 'references', 'delivery.json'));
  assert.equal(plan.deliveryStatePath, join(workspace, 'skills', 'liveabit', 'references', 'delivery-state.json'));
  for (const path of [plan.settingsPath, plan.databasePath]) {
    assert.ok(isAbsolute(path));
    assert.ok(!relative(stateDir, path).startsWith('..'));
  }
  for (const path of [plan.deliveryPolicyPath, plan.deliveryStatePath]) {
    assert.ok(isAbsolute(path));
    assert.ok(!relative(workspace, path).startsWith('..'));
  }
});

test('a custom main-session key is retained and the chosen existing agent is explicit', () => {
  const config = fixture();
  config.session.mainKey = 'personal_daily';
  const plan = planConfiguration(config, { ...options, agentId: 'other' });
  assert.equal(plan.sessionKey, 'agent:other:personal_daily');
  assert.equal(plan.patch.hooks.mappings.at(-1).agentId, 'other');
  assert.equal(plan.patch.hooks.mappings.at(-1).sessionKey, plan.sessionKey);
  assert.equal(plan.workspace, config.agents.entries.other.workspace);
  assert.equal(Object.hasOwn(plan.patch.agents.entries, 'main'), false);
});

test('managed instructions append while preserving custom content and rerun identically', () => {
  for (const existing of ['', '# Existing personal assistant\nKeep my custom rules.', '# Existing rules\r\nKeep these.\r\n']) {
    const guide = '# Activity support\nUse the existing conversation.\n';
    const updated = updateManagedInstructions(existing, guide);
    assert.ok(updated.startsWith(existing));
    assert.ok(updated.includes(`${start}\n${guide.trimEnd()}\n${end}`));
    assert.equal(updateManagedInstructions(updated, guide), updated);
    assert.equal(updated.split(start).length - 1, 1);
    assert.equal(updated.split(end).length - 1, 1);
  }
});

test('managed section updates preserve all content before and after the owned section', () => {
  const prefix = '# Custom persona\r\nPreserve exact whitespace.\r\n\r\n';
  const suffix = '\r\n\r\n# Personal policy\r\nKeep custom tool permissions.\r\n';
  const existing = `${prefix}${start}\nOld managed guidance.\n${end}${suffix}`;
  const next = updateManagedInstructions(existing, 'Updated managed guidance.\n');
  assert.equal(next, `${prefix}${start}\nUpdated managed guidance.\n${end}${suffix}`);
  assert.equal(updateManagedInstructions(next, 'Updated managed guidance.\n'), next);
});

test('malformed or ambiguous managed markers are rejected without returning rewritten instructions', () => {
  for (const existing of [
    `prefix\n${start}\nmissing end`,
    `prefix\n${end}\nmissing start`,
    `${end}\n${start}`,
    `${start}\n${start}\n${end}`,
    `${start}\n${end}\n${end}`,
    `${start}\nfirst\n${end}\n${start}\nsecond\n${end}`,
  ]) {
    assert.throws(() => updateManagedInstructions(existing, 'New guidance.'), /ambiguous_managed_instructions/);
  }
});
