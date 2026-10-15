import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const sourceDir = fileURLToPath(new URL('../integrations/openclaw/personal-agent/', import.meta.url));
const phoneId = 'a'.repeat(64);
const stageId = 'b'.repeat(64);
const guide = '# Activity context\nUse the existing personal conversation.\n';
const skill = '---\nname: liveabit\ndescription: Synthetic installer fixture.\n---\n';
const workflow = '# Synthetic workflow\nAsk about intent.\n';

// Independent local CLI fixture. No OpenClaw modules, networking or notification
// actions are used. Config patches model native object merge and array replacement.
const fakeCli = String.raw`
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const argv = process.argv.slice(2), state = process.env.OPENCLAW_STATE_DIR;
const filename = state + '/openclaw.json';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2));
const mode = process.env.LIVEABIT_TEST_MODE || 'success';
const merge = (before, patch) => {
  if (patch === null || Array.isArray(patch) || typeof patch !== 'object') return patch;
  const next = before && !Array.isArray(before) && typeof before === 'object' ? { ...before } : {};
  for (const [key, value] of Object.entries(patch)) next[key] = merge(next[key], value);
  return next;
};
appendFileSync(process.env.LIVEABIT_TEST_CALLS, JSON.stringify(argv) + '\n');
if (argv[0] === 'nodes' && argv[1] === 'status') {
  if (mode === 'nodes-unavailable') { console.error('Synthetic gateway is stopped.'); process.exit(9); }
  console.log(JSON.stringify({ nodes: [{ nodeId: process.env.LIVEABIT_TEST_PHONE,
    paired: true, connected: false, platform: 'android', commands: ['system.notify'],
    permissions: { notifications: true } }] }));
} else if (argv[0] === 'plugins' && argv[1] === 'install') {
  const config = read(filename);
  const ownedRoot = state + '/liveabit-personal-agent';
  const managedPaths = (config.plugins?.load?.paths ?? []).filter(value => {
    const path = value.replaceAll('\\', '/');
    const root = ownedRoot.replaceAll('\\', '/');
    return path === root + '/plugin' || new RegExp('^' + root.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '/versions/[a-f0-9]{64}$').test(path);
  });
  if (managedPaths.length !== 1 || managedPaths[0] !== argv.at(-1)) {
    throw new Error('Synthetic native install rejected duplicate or unselected managed plugin paths.');
  }
  config.plugins ??= {}; config.plugins.installs ??= {};
  config.plugins.installs['liveabit-personal-agent'] = { source: 'path', sourcePath: argv.at(-1) };
  save(filename, config);
  if (mode === 'source-race-failure') {
    const policy = read(process.env.LIVEABIT_TEST_SOURCE_POLICY);
    policy.cooldown_minutes = 91;
    save(process.env.LIVEABIT_TEST_SOURCE_POLICY, policy);
    const delivery = read(process.env.LIVEABIT_TEST_SOURCE_STATE);
    delivery.processed_event_ids.push('synthetic-concurrent-event');
    delivery.last_sent_at = '2026-10-14T18:45:00.000Z';
    delivery.last_sent_event_id = 'synthetic-concurrent-event';
    save(process.env.LIVEABIT_TEST_SOURCE_STATE, delivery);
  }
  if (mode === 'target-race-failure') {
    writeFileSync(process.env.LIVEABIT_TEST_AGENT_GUIDE,
      readFileSync(process.env.LIVEABIT_TEST_AGENT_GUIDE, 'utf8') + '\nUser added concurrent personal guidance.\n');
  }
  if (mode.endsWith('failure')) {
    writeFileSync(process.env.LIVEABIT_TEST_UNRELATED, 'Concurrent unrelated writer retained.');
    console.error('Synthetic plugin installation failed after its config write.');
    process.exit(7);
  }
  console.log(JSON.stringify({ installed: true }));
} else if (argv[0] === 'config' && argv[1] === 'patch') {
  const patch = JSON.parse(readFileSync(0, 'utf8'));
  if (argv.includes('--dry-run')) console.log(JSON.stringify({ valid: true }));
  else {
    save(filename, merge(read(filename), patch));
    if (mode === 'apply-error') {
      console.error('Synthetic apply failure after writing the patch.');
      process.exit(8);
    }
    console.log(JSON.stringify({ applied: true }));
  }
} else {
  throw new Error('Unexpected synthetic CLI invocation: ' + argv.join(' '));
}
`;

function write(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const bytes = path => existsSync(path) ? readFileSync(path) : null;

function fixture(t, mode = 'success') {
  const root = mkdtempSync(join(tmpdir(), 'liveabit-installer-test-'));
  const userProfile = join(root, 'synthetic-user'), stateDir = join(userProfile, '.openclaw');
  const ownedRoot = join(stateDir, 'liveabit-personal-agent');
  const pluginDir = join(ownedRoot, 'versions', stageId);
  const workspace = join(root, 'personal-workspace'), legacyWorkspace = join(root, 'legacy-workspace');
  mkdirSync(pluginDir, { recursive: true });
  // Bounded copy of direct module/metadata files, not a recursive source tree.
  for (const name of readdirSync(sourceDir)) {
    if (/\.(mjs|json)$/.test(name)) copyFileSync(join(sourceDir, name), join(pluginDir, name));
  }
  write(join(pluginDir, 'install-payload.json'), JSON.stringify({
    guide: Buffer.from(guide).toString('base64'), skill: Buffer.from(skill).toString('base64'),
    workflow: Buffer.from(workflow).toString('base64'),
  }));
  const refs = join(workspace, 'skills', 'liveabit', 'references');
  const sourceRefs = join(legacyWorkspace, 'skills', 'liveabit', 'references');
  const paths = {
    config: join(stateDir, 'openclaw.json'), settings: join(ownedRoot, 'settings.json'),
    guide: join(workspace, 'AGENTS.md'), skill: join(workspace, 'skills', 'liveabit', 'SKILL.md'),
    workflow: join(refs, 'personal-agent-workflow.md'), policy: join(refs, 'delivery.json'),
    state: join(refs, 'delivery-state.json'), sourcePolicy: join(sourceRefs, 'delivery.json'),
    sourceState: join(sourceRefs, 'delivery-state.json'),
    transform: join(stateDir, 'hooks', 'transforms', 'liveabit-personal-agent.mjs'),
    workboard: join(stateDir, 'plugins', 'workboard', 'workboard.sqlite'),
    transcript: join(stateDir, 'agents', 'main', 'sessions', 'synthetic-transcript.jsonl'),
    unrelated: join(root, 'unrelated-owner.txt'), calls: join(root, 'fake-cli-calls.jsonl'),
  };
  const config = {
    gateway: { mode: 'local', auth: { mode: 'token', token: 'synthetic-gateway-token' } },
    session: { mainKey: 'main' },
    hooks: { enabled: true, path: '/hooks', token: 'synthetic-hook-token', allowedAgentIds: ['liveabit'],
      mappings: [{ id: 'liveabit-tasks', match: { path: 'liveabit' }, action: 'agent', agentId: 'liveabit' },
        { id: 'synthetic-mail-route', match: { path: 'mail' }, action: 'agent', agentId: 'main', deliver: true }] },
    agents: { entries: {
      main: { workspace, model: { primary: 'synthetic/model', fallbacks: ['synthetic/fallback'] },
        thinkingDefault: 'high', agentRuntime: { id: 'synthetic-runtime' }, agentDir: join(stateDir, 'agents', 'main'),
        tools: { alsoAllow: ['calendar_read', 'mail_read'], deny: ['camera'], fs: { workspaceOnly: true } },
        skills: ['calendar', 'personal-tasks'] },
      liveabit: { workspace: legacyWorkspace, model: 'synthetic/legacy' },
    } },
    plugins: { entries: { workboard: { enabled: true, config: { board: 'default' } } },
      load: { paths: [join(root, 'unrelated-plugin'), join(ownedRoot, 'versions', 'c'.repeat(64)), join(ownedRoot, 'plugin')] } },
  };
  const policy = { format: 'liveabit.openclaw.companion-delivery.v1', enabled: true, agent_id: 'liveabit',
    channel: 'companion', identity_source: 'openclaw.nodes.status', command: 'system.notify', node_id: phoneId,
    cooldown_minutes: 60, quiet_start_hour: 22, quiet_end_hour: 8, time_zone: 'America/Chicago' };
  const state = { format: 'liveabit.openclaw.delivery-state.v1', processed_event_ids: ['synthetic-old-event'],
    last_sent_at: '2026-10-14T17:00:00.000Z', last_sent_event_id: 'synthetic-old-event' };
  write(paths.config, JSON.stringify(config, null, 2));
  write(paths.sourcePolicy, JSON.stringify(policy, null, 2));
  write(paths.sourceState, JSON.stringify(state, null, 2));
  write(paths.guide, '# Personal assistant\r\nKeep my custom guidance.\r\n');
  write(paths.skill, 'Original personal skill bytes.\r\n');
  write(paths.workflow, 'Original personal workflow bytes.\r\n');
  write(paths.settings, JSON.stringify({ format: 'liveabit.personal-agent.settings.v1', enabled: true,
    agentId: 'main', mainKey: 'main', sessionKey: 'agent:main:main',
    databasePath: join(stateDir, 'plugins', 'liveabit-personal-agent', 'activity.sqlite'),
    timeZone: 'America/Chicago', historyDays: 30, episodeDays: 90, accountabilityEmailsEnabled: false }));
  write(paths.transform, '// Original owned transform bytes.\n');
  write(paths.workboard, 'Synthetic Workboard bytes that setup must preserve.');
  write(paths.transcript, '{"synthetic":"personal conversation remains intact"}\n');
  write(paths.unrelated, 'Original unrelated owner bytes.');
  const cliPath = join(root, 'fake-cli.mjs');
  write(cliPath, fakeCli);
  const original = Object.fromEntries(Object.entries(paths).map(([name, path]) => [name, bytes(path)]));
  const env = { ...process.env, USERPROFILE: userProfile, HOME: userProfile, OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_SHIM_NODE: process.execPath, OPENCLAW_SHIM_ENTRY: cliPath,
    LIVEABIT_TEST_MODE: mode, LIVEABIT_TEST_PHONE: phoneId, LIVEABIT_TEST_CALLS: paths.calls,
    LIVEABIT_TEST_SOURCE_POLICY: paths.sourcePolicy, LIVEABIT_TEST_SOURCE_STATE: paths.sourceState,
    LIVEABIT_TEST_AGENT_GUIDE: paths.guide, LIVEABIT_TEST_UNRELATED: paths.unrelated };
  for (const key of ['NODE_OPTIONS', 'OPENCLAW_SHIM_NATIVE_PRELOAD_URL', 'OPENCLAW_SHIM_NATIVE_STAGED_ROOT',
    'OPENCLAW_SHIM_NATIVE_APP_ROOT', 'OPENCLAW_NATIVE_APP_ROOT', 'OPENCLAW_NATIVE_STAGED_ROOT']) delete env[key];
  t.after(() => {
    const target = resolve(root), parent = resolve(tmpdir()) + sep;
    assert.ok(target.startsWith(parent), 'temporary cleanup target escaped its parent');
    rmSync(target, { recursive: true, force: true });
  });
  return { root, stateDir, ownedRoot, pluginDir, workspace, config, policy, state, paths, original, env,
    run(entry = join(pluginDir, 'installer.mjs'), flags = []) {
      return spawnSync(process.execPath, [entry, '--agent', 'main', ...flags], {
        env, cwd: root, encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024, windowsHide: true,
      });
    },
    calls() { return existsSync(paths.calls) ? readFileSync(paths.calls, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : []; },
  };
}

function assertRestored(f, { concurrentGuide = false } = {}) {
  for (const name of ['config', 'settings', 'skill', 'workflow', 'policy', 'state', 'transform', 'workboard', 'transcript']) {
    assert.deepEqual(bytes(f.paths[name]), f.original[name], name + ' was not restored/preserved');
  }
  if (!concurrentGuide) assert.deepEqual(bytes(f.paths.guide), f.original.guide);
  assert.equal(existsSync(join(f.ownedRoot, 'installation.json')), false);
  const backups = readdirSync(join(f.stateDir, 'liveabit-setup-backups'));
  assert.equal(backups.length, 1);
  const backupDir = join(f.stateDir, 'liveabit-setup-backups', backups[0]);
  assert.ok(existsSync(join(backupDir, 'SKILL.md')));
  assert.ok(existsSync(join(backupDir, 'personal-agent-workflow.md')));
  return json(join(backupDir, 'rollback.json'));
}

test('real installer preserves personal state and migrates only the activity route while paired phone is offline', t => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const installed = JSON.parse(result.stdout.trim());
  assert.equal(installed.configured, true);
  assert.equal(installed.notification_sent, false);
  assert.equal(installed.companion_connected_at_setup, false);
  assert.equal(installed.accountability_emails_enabled, false);
  const after = json(f.paths.config), main = after.agents.entries.main;
  for (const key of ['model', 'thinkingDefault', 'agentRuntime', 'agentDir', 'workspace']) {
    assert.deepEqual(main[key], f.config.agents.entries.main[key], key);
  }
  assert.deepEqual(main.tools.deny, ['camera']);
  assert.deepEqual(main.tools.fs, { workspaceOnly: true });
  assert.ok(main.tools.alsoAllow.includes('calendar_read'));
  assert.ok(main.tools.alsoAllow.includes('mail_read'));
  assert.ok(main.tools.alsoAllow.includes('liveabit_notify'));
  assert.deepEqual(main.skills, ['calendar', 'personal-tasks', 'liveabit']);
  assert.deepEqual(after.plugins.entries.workboard, f.config.plugins.entries.workboard);
  assert.deepEqual(after.agents.entries.liveabit, f.config.agents.entries.liveabit);
  assert.deepEqual(after.hooks.mappings[0], f.config.hooks.mappings[1]);
  const route = after.hooks.mappings[1];
  assert.equal(route.id, 'liveabit-personal');
  assert.equal(route.agentId, 'main');
  assert.equal(route.sessionKey, 'agent:main:liveabit-activity');
  assert.equal(route.sessionMode, 'persistent');
  assert.equal(route.deliver, false);
  assert.equal(after.hooks.allowRequestSessionKey, false);
  assert.ok(after.plugins.load.paths.includes(f.pluginDir));
  assert.ok(after.plugins.load.paths.includes(join(f.root, 'unrelated-plugin')));
  assert.deepEqual(after.plugins.load.paths, [join(f.root, 'unrelated-plugin'), f.pluginDir]);
  assert.deepEqual(json(f.paths.policy), { ...f.policy, agent_id: 'main' });
  assert.equal(json(f.paths.sourcePolicy).enabled, false);
  assert.deepEqual(bytes(f.paths.state), f.original.sourceState);
  assert.deepEqual(bytes(f.paths.sourceState), f.original.sourceState);
  const instructions = readFileSync(f.paths.guide, 'utf8');
  assert.ok(instructions.startsWith(f.original.guide.toString('utf8')));
  assert.ok(instructions.includes(guide.trimEnd()));
  assert.equal(readFileSync(f.paths.skill, 'utf8'), skill);
  assert.equal(readFileSync(f.paths.workflow, 'utf8'), workflow);
  assert.equal(json(f.paths.settings).accountabilityEmailsEnabled, false);
  assert.equal(json(f.paths.settings).format, 'liveabit.personal-agent.settings.v2');
  assert.equal(json(f.paths.settings).mainSessionKey, 'agent:main:main');
  assert.deepEqual(json(f.paths.settings).legacyEpisodeSessionKeys, ['agent:main:main']);
  for (const name of ['workboard', 'transcript', 'unrelated']) assert.deepEqual(bytes(f.paths[name]), f.original[name]);
  assert.ok(existsSync(join(f.stateDir, 'plugins', 'liveabit-personal-agent', 'activity.sqlite')));
  assert.ok(f.calls().every(argv => ['config', 'nodes', 'plugins'].includes(argv[0])));
  assert.ok(f.calls().every(argv => !argv.includes('notify') && !argv.includes('invoke')));
  const calls = f.calls();
  const applyIndex = calls.findIndex(argv => argv[0] === 'config' && argv[1] === 'patch' && !argv.includes('--dry-run'));
  const installIndex = calls.findIndex(argv => argv[0] === 'plugins' && argv[1] === 'install');
  assert.ok(applyIndex >= 0 && installIndex > applyIndex, 'the sole managed load path must be applied before native install');
});

test('plugin installation failure restores authored targets and preserves unrelated owner changes', t => {
  const f = fixture(t, 'plugin-failure');
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /installation_failed/);
  const rollback = assertRestored(f);
  assert.equal(rollback.restored_owned_files, true);
  assert.deepEqual(rollback.concurrent_files_preserved, []);
  assert.deepEqual(bytes(f.paths.sourcePolicy), f.original.sourcePolicy);
  assert.deepEqual(bytes(f.paths.sourceState), f.original.sourceState);
  assert.equal(readFileSync(f.paths.unrelated, 'utf8'), 'Concurrent unrelated writer retained.');
});

test('rollback preserves concurrently advanced legacy delivery policy and state after plugin failure', t => {
  const f = fixture(t, 'source-race-failure');
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /installation_failed/);
  const rollback = assertRestored(f);
  assert.equal(rollback.restored_owned_files, true);
  assert.equal(json(f.paths.sourcePolicy).cooldown_minutes, 91);
  assert.equal(json(f.paths.sourcePolicy).enabled, true);
  assert.deepEqual(json(f.paths.sourceState).processed_event_ids, ['synthetic-old-event', 'synthetic-concurrent-event']);
  assert.equal(json(f.paths.sourceState).last_sent_event_id, 'synthetic-concurrent-event');
  assert.equal(json(f.paths.sourceState).last_sent_at, '2026-10-14T18:45:00.000Z');
});

test('rollback does not overwrite concurrent edits to an already-authored personal instruction file', t => {
  const f = fixture(t, 'target-race-failure');
  const result = f.run();
  assert.notEqual(result.status, 0);
  const rollback = assertRestored(f, { concurrentGuide: true });
  assert.equal(rollback.restored_owned_files, false);
  assert.deepEqual(rollback.failed_paths, []);
  assert.deepEqual(rollback.concurrent_files_preserved, [f.paths.guide]);
  const instructions = readFileSync(f.paths.guide, 'utf8');
  assert.ok(instructions.startsWith(f.original.guide.toString('utf8')));
  assert.ok(instructions.includes('User added concurrent personal guidance.'));
});

test('failure after native config patch restores configuration and the original transform', t => {
  const f = fixture(t, 'apply-error');
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /installation_failed/);
  assert.equal(assertRestored(f).restored_owned_files, true);
  assert.deepEqual(bytes(f.paths.sourcePolicy), f.original.sourcePolicy);
  assert.deepEqual(bytes(f.paths.sourceState), f.original.sourceState);
  assert.ok(f.calls().some(argv => argv[0] === 'config' && argv[1] === 'patch' && !argv.includes('--dry-run')));
});

test('a mutable installer entry is rejected before configuration or workspace changes', t => {
  const f = fixture(t);
  const mutableDir = join(f.ownedRoot, 'plugin');
  mkdirSync(mutableDir, { recursive: true });
  for (const name of readdirSync(f.pluginDir)) copyFileSync(join(f.pluginDir, name), join(mutableDir, name));
  const result = f.run(join(mutableDir, 'installer.mjs'));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /immutable_staging_directory_required/);
  assert.equal(existsSync(join(f.stateDir, 'liveabit-setup-backups')), false);
  assert.deepEqual(f.calls(), []);
  for (const name of ['config', 'settings', 'guide', 'skill', 'workflow', 'sourcePolicy', 'sourceState']) {
    assert.deepEqual(bytes(f.paths[name]), f.original[name], name);
  }
});

test('global conversation scope is rejected before native calls or managed changes', t => {
  const f = fixture(t);
  const config = json(f.paths.config);
  config.session.scope = 'global';
  write(f.paths.config, JSON.stringify(config, null, 2));
  const configBefore = readFileSync(f.paths.config);
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /global_session_requires_explicit_migration/);
  assert.equal(existsSync(join(f.stateDir, 'liveabit-setup-backups')), false);
  assert.deepEqual(f.calls(), []);
  assert.deepEqual(readFileSync(f.paths.config), configBefore);
  for (const name of ['settings', 'guide', 'skill', 'workflow', 'sourcePolicy', 'sourceState']) {
    assert.deepEqual(bytes(f.paths[name]), f.original[name], name);
  }
});

function prepare(f) {
  const result = f.run(undefined, ['--prepare-stopped-update']);
  assert.equal(result.status, 0, result.stderr);
  const prepared = JSON.parse(result.stdout.trim());
  assert.equal(prepared.prepared, true);
  assert.equal(prepared.configured, false);
  assert.equal(prepared.notification_sent, false);
  return join(f.pluginDir, 'prepared-inventory.json');
}

function assertUnmanaged(f, configBefore = f.original.config) {
  assert.deepEqual(bytes(f.paths.config), configBefore);
  for (const name of ['settings', 'guide', 'skill', 'workflow', 'policy', 'state', 'transform', 'sourcePolicy', 'sourceState', 'workboard', 'transcript']) {
    assert.deepEqual(bytes(f.paths[name]), f.original[name], name + ' was changed before installation');
  }
  assert.equal(existsSync(join(f.stateDir, 'liveabit-setup-backups')), false);
  assert.equal(existsSync(join(f.stateDir, 'plugins', 'liveabit-personal-agent', 'activity.sqlite')), false);
  assert.equal(existsSync(join(f.ownedRoot, 'installation.json')), false);
}

test('stopped-update preparation validates online inventory and changes only its private cache', t => {
  const f = fixture(t);
  const cachePath = prepare(f);
  assertUnmanaged(f);
  const cached = json(cachePath);
  assert.equal(cached.format, 'liveabit.personal-agent.prepared-inventory.v1');
  assert.ok(Date.parse(cached.fetchedAt) <= Date.now());
  for (const key of ['configSha256', 'sourcePolicySha256', 'sourceStateSha256']) assert.match(cached[key], /^[a-f0-9]{64}$/);
  assert.equal(cached.inventory.nodes[0].nodeId, phoneId);
  assert.deepEqual(f.calls().map(argv => argv.slice(0, 2)), [['config', 'patch'], ['nodes', 'status']]);
});

test('prepared inventory permits native apply with the gateway stopped and never calls nodes status again', t => {
  const f = fixture(t);
  prepare(f);
  const priorCalls = f.calls().length;
  f.env.LIVEABIT_TEST_MODE = 'nodes-unavailable';
  const result = f.run(undefined, ['--use-prepared-inventory']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout.trim()).configured, true);
  assert.equal(json(f.paths.config).hooks.mappings.at(-1).sessionKey, 'agent:main:liveabit-activity');
  assert.ok(f.calls().slice(priorCalls).every(argv => argv[0] !== 'nodes'));
});

test('stale or future prepared inventory is rejected before managed writes', t => {
  for (const offset of [-301000, 60000]) {
    const f = fixture(t);
    const cachePath = prepare(f), cached = json(cachePath);
    cached.fetchedAt = new Date(Date.now() + offset).toISOString();
    write(cachePath, JSON.stringify(cached));
    const result = f.run(undefined, ['--use-prepared-inventory']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /stale_or_invalid_prepared_inventory/);
    assertUnmanaged(f);
    assert.ok(f.calls().every(argv => argv[0] !== 'plugins'));
  }
});

test('changed configuration, source policy or source state invalidates prepared inventory without overwriting the change', t => {
  for (const changed of ['config', 'sourcePolicy', 'sourceState']) {
    const f = fixture(t);
    prepare(f);
    write(f.paths[changed], Buffer.concat([f.original[changed], Buffer.from('\n')]));
    const current = readFileSync(f.paths[changed]);
    const result = f.run(undefined, ['--use-prepared-inventory']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /prepared_inventory_inputs_changed/);
    assert.deepEqual(readFileSync(f.paths[changed]), current);
    for (const name of ['settings', 'guide', 'skill', 'workflow', 'policy', 'state', 'transform']) {
      assert.deepEqual(bytes(f.paths[name]), f.original[name]);
    }
    assert.equal(existsSync(join(f.stateDir, 'liveabit-setup-backups')), false);
    assert.ok(f.calls().every(argv => argv[0] !== 'plugins'));
  }
});

test('prepared inventory is bounded and cannot be selected through an arbitrary supplied path', t => {
  const f = fixture(t);
  const cachePath = prepare(f);
  write(cachePath, Buffer.alloc(128 * 1024 + 1, 32));
  const oversized = f.run(undefined, ['--use-prepared-inventory']);
  assert.notEqual(oversized.status, 0);
  assert.match(oversized.stderr, /invalid_prepared_inventory/);
  assertUnmanaged(f);
  const arbitrary = f.run(undefined, ['--inventory-path', join(f.root, 'other-inventory.json')]);
  assert.notEqual(arbitrary.status, 0);
  assert.match(arbitrary.stderr, /unsupported_installer_argument/);
  assertUnmanaged(f);
});
