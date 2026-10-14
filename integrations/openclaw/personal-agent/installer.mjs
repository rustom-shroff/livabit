// Invoked only by the explicit native configuration helper, inside OpenClaw.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, unlinkSync, lstatSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ActivityStore } from './store.mjs';
import { planConfiguration, updateManagedInstructions } from './configuration.mjs';

const args = process.argv.slice(2);
let agentId = 'main', prepareStoppedUpdate = false, usePreparedInventory = false;
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--agent' && args[index + 1] && !args[index + 1].startsWith('--')) agentId = args[++index];
  else if (args[index] === '--prepare-stopped-update') prepareStoppedUpdate = true;
  else if (args[index] === '--use-prepared-inventory') usePreparedInventory = true;
  else throw new Error('unsupported_installer_argument');
}
if (prepareStoppedUpdate && usePreparedInventory) throw new Error('conflicting_installer_modes');
const stateDir = process.env.OPENCLAW_STATE_DIR || join(process.env.USERPROFILE, '.openclaw');
const ownedRoot = join(stateDir, 'liveabit-personal-agent');
const pluginDir = dirname(fileURLToPath(import.meta.url));
if (!/^[a-f0-9]{64}$/.test(relative(join(ownedRoot, 'versions'), pluginDir))) throw new Error('immutable_staging_directory_required');
const configPath = join(stateDir, 'openclaw.json');
const configBeforeBytes = readFileSync(configPath);
const configBefore = JSON.parse(configBeforeBytes.toString('utf8'));
const plan = planConfiguration(configBefore, { agentId, stateDir, pluginDir });
const backupDir = join(stateDir, 'liveabit-setup-backups', new Date().toISOString().replace(/[:.]/g, '-') + '-personal-agent');
const originals = new Map();
const authored = new Map();
let backupsStarted = false;
const backup = (filename, name) => {
  if (!backupsStarted) { mkdirSync(backupDir, { recursive: true }); backupsStarted = true; }
  if (!originals.has(filename)) originals.set(filename, existsSync(filename) ? readFileSync(filename) : null);
  if (existsSync(filename)) copyFileSync(filename, join(backupDir, name));
};
const ownedWrite = (filename, value) => {
  if (!originals.has(filename)) throw new Error('unbacked_setup_write');
  const current = existsSync(filename) ? readFileSync(filename) : null;
  const expected = authored.has(filename) ? authored.get(filename) : originals.get(filename);
  if ((current === null) !== (expected === null) || (current && current.compare(expected) !== 0)) throw new Error('setup_file_changed');
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  writeFileSync(filename, bytes); authored.set(filename, bytes);
};
const agentFingerprint = config => JSON.stringify(Object.entries(config.agents.entries).map(([id, value]) =>
  [id, value.model, value.thinkingDefault, value.agentRuntime, value.agentDir]));
const beforeFingerprint = agentFingerprint(configBefore);
const cli = (argv, input) => {
  const node = process.env.OPENCLAW_SHIM_NODE, entry = process.env.OPENCLAW_SHIM_ENTRY;
  if (!node || !entry) throw new Error('managed_openclaw_runtime_required');
  const prefix = process.env.OPENCLAW_SHIM_NATIVE_PRELOAD_URL ? ['--import', process.env.OPENCLAW_SHIM_NATIVE_PRELOAD_URL] : [];
  const env = { ...process.env };
  if (env.OPENCLAW_SHIM_NATIVE_STAGED_ROOT) {
    env.OPENCLAW_NATIVE_APP_ROOT = env.OPENCLAW_SHIM_NATIVE_APP_ROOT;
    env.OPENCLAW_NATIVE_STAGED_ROOT = env.OPENCLAW_SHIM_NATIVE_STAGED_ROOT;
  }
  const changesConfig = (argv[0] === 'plugins' && argv[1] === 'install')
    || (argv[0] === 'config' && argv[1] === 'patch' && !argv.includes('--dry-run'));
  if (changesConfig) {
    const expected = authored.get(configPath) ?? originals.get(configPath);
    if (readFileSync(configPath).compare(expected) !== 0) throw new Error('configuration_changed_during_setup');
  }
  const result = spawnSync(node, [...prefix, entry, ...argv], { input, encoding: 'utf8', env,
    windowsHide: true, timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
  if (changesConfig) authored.set(configPath, readFileSync(configPath));
  if (result.status !== 0) {
    if (backupsStarted) writeFileSync(join(backupDir, 'private-cli-diagnostic.txt'), (result.stdout ?? '') + '\n' + (result.stderr ?? ''));
    throw new Error('native_configuration_step_failed:' + argv.slice(0, 3).join(' ')
      + (backupsStarted ? '; private diagnostic retained' : '; no managed files changed'));
  }
  return result.stdout;
};
const cliJson = raw => {
  try { return JSON.parse(raw); } catch { }
  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    if (!/^\s*[\[{]/.test(lines[index])) continue;
    try { return JSON.parse(lines.slice(index).join('\n')); } catch { }
  }
  throw new Error('unexpected_native_cli_response');
};
cli(['config', 'patch', '--stdin', '--dry-run', '--json'], JSON.stringify(plan.patch));
// `plugins validate --entry` validates defineToolPlugin/feature authoring
// metadata, not mixed legacy registration objects. Native config validation
// and subsequent runtime inspection are the relevant gates for this entry.

const references = join(plan.workspace, 'skills', 'liveabit', 'references');
const oldWorkspace = configBefore.agents.entries.liveabit?.workspace;
const candidates = [plan.deliveryPolicyPath, oldWorkspace && join(oldWorkspace, 'skills', 'liveabit', 'references', 'delivery.json')].filter(Boolean);
let policy, sourcePolicyPath, sourcePolicyBytes;
for (const filename of candidates) {
  if (!existsSync(filename)) continue;
  const bytes = readFileSync(filename), candidate = JSON.parse(bytes);
  if (candidate.format === 'liveabit.openclaw.companion-delivery.v1') { policy = candidate; sourcePolicyPath = filename; sourcePolicyBytes = bytes; break; }
}
if (!policy || policy.channel !== 'companion' || policy.identity_source !== 'openclaw.nodes.status'
  || policy.command !== 'system.notify' || !/^[a-fA-F0-9]{64}$/.test(policy.node_id)
  || typeof policy.enabled !== 'boolean') throw new Error('existing_verified_companion_policy_required');
const sourceStatePath = sourcePolicyPath.replace(/delivery\.json$/, 'delivery-state.json');
if (!existsSync(sourceStatePath)) throw new Error('existing_delivery_state_required');
const stateBytes = readFileSync(sourceStatePath);
const state = JSON.parse(stateBytes);
if (state.format !== 'liveabit.openclaw.delivery-state.v1' || !Array.isArray(state.processed_event_ids)
  || state.processed_event_ids.length > 128) throw new Error('invalid_delivery_state');
const hash = value => createHash('sha256').update(value).digest('hex');
const inventoryPath = join(pluginDir, 'prepared-inventory.json');
const cacheFormat = 'liveabit.personal-agent.prepared-inventory.v1';
let inventory, fetchedAt;
if (usePreparedInventory) {
  const stat = lstatSync(inventoryPath);
  if (!stat.isFile() || stat.size > 128 * 1024) throw new Error('invalid_prepared_inventory');
  const cacheBytes = readFileSync(inventoryPath);
  if (cacheBytes.length > 128 * 1024) throw new Error('invalid_prepared_inventory');
  const cached = JSON.parse(cacheBytes.toString('utf8'));
  const fetched = typeof cached.fetchedAt === 'string' ? Date.parse(cached.fetchedAt) : NaN, now = Date.now();
  if (cached.format !== cacheFormat || !Number.isFinite(fetched) || fetched > now || now - fetched > 300000)
    throw new Error('stale_or_invalid_prepared_inventory');
  if (cached.configSha256 !== hash(configBeforeBytes) || cached.sourcePolicySha256 !== hash(sourcePolicyBytes)
    || cached.sourceStateSha256 !== hash(stateBytes)) throw new Error('prepared_inventory_inputs_changed');
  inventory = cached.inventory;
} else {
  inventory = cliJson(cli(['nodes', 'status', '--json']));
  fetchedAt = new Date().toISOString();
}
if (!inventory || !Array.isArray(inventory.nodes)) throw new Error('invalid_node_inventory');
const savedPhone = inventory.nodes.filter(node => node.nodeId === policy.node_id);
if (savedPhone.length !== 1 || !savedPhone[0].paired || savedPhone[0].platform !== 'android'
  || !savedPhone[0].commands?.includes('system.notify') || savedPhone[0].permissions?.notifications !== true)
  throw new Error('saved_companion_unavailable; no destination changed');

if (prepareStoppedUpdate) {
  if (readFileSync(configPath).compare(configBeforeBytes) !== 0
    || readFileSync(sourcePolicyPath).compare(sourcePolicyBytes) !== 0 || readFileSync(sourceStatePath).compare(stateBytes) !== 0)
    throw new Error('prepared_inventory_inputs_changed');
  const cacheBytes = Buffer.from(JSON.stringify({ format: cacheFormat, fetchedAt, inventory,
    configSha256: hash(configBeforeBytes), sourcePolicySha256: hash(sourcePolicyBytes), sourceStateSha256: hash(stateBytes) }));
  if (cacheBytes.length > 128 * 1024) throw new Error('invalid_prepared_inventory');
  writeFileSync(inventoryPath, cacheBytes);
  console.log(JSON.stringify({ format: cacheFormat, prepared: true, configured: false,
    inventory_cached: true, maximum_age_seconds: 300, notification_sent: false }));
  process.exit(0);
}

// Preparation and cached-input validation finish before any managed writes.
if (readFileSync(configPath).compare(configBeforeBytes) !== 0) throw new Error('configuration_changed_during_setup');
mkdirSync(references, { recursive: true });
backup(configPath, 'openclaw.json');
backup(plan.deliveryPolicyPath, 'target-delivery.json');
backup(plan.deliveryStatePath, 'target-delivery-state.json');
backup(sourcePolicyPath, 'source-delivery.json');
backup(sourceStatePath, 'source-delivery-state.json');
backup(plan.settingsPath, 'settings.json');
const instructionPath = join(plan.workspace, 'AGENTS.md');
backup(instructionPath, 'AGENTS.md');
backup(join(plan.workspace, 'skills', 'liveabit', 'SKILL.md'), 'SKILL.md');
backup(join(references, 'personal-agent-workflow.md'), 'personal-agent-workflow.md');
const payload = JSON.parse(readFileSync(join(pluginDir, 'install-payload.json'), 'utf8'));
const guide = Buffer.from(payload.guide, 'base64').toString('utf8');
const existingInstructions = existsSync(instructionPath) ? readFileSync(instructionPath, 'utf8') : '';
const newInstructions = updateManagedInstructions(existingInstructions, guide);
const settings = { format: 'liveabit.personal-agent.settings.v1', enabled: true,
  agentId, mainKey: plan.mainKey, sessionKey: plan.sessionKey, databasePath: plan.databasePath,
  timeZone: policy.time_zone, historyDays: 30, episodeDays: 90,
  deliveryPolicyPath: plan.deliveryPolicyPath, deliveryStatePath: plan.deliveryStatePath,
  accountabilityEmailsEnabled: false };
policy = { ...policy, agent_id: agentId };
try {
if (readFileSync(sourceStatePath).compare(stateBytes) !== 0 || readFileSync(sourcePolicyPath).compare(sourcePolicyBytes) !== 0)
  throw new Error('source_delivery_state_changed; retry after the prior agent run completes');
// All data remains inside the chosen agent host. No sender APK/credentials or
// existing conversation database is rewritten. Old agent history is preserved.
ownedWrite(plan.settingsPath, JSON.stringify(settings, null, 2));
ownedWrite(plan.deliveryPolicyPath, JSON.stringify(policy, null, 2));
ownedWrite(plan.deliveryStatePath, stateBytes);
ownedWrite(instructionPath, newInstructions);
ownedWrite(join(plan.workspace, 'skills', 'liveabit', 'SKILL.md'), Buffer.from(payload.skill, 'base64'));
ownedWrite(join(references, 'personal-agent-workflow.md'), Buffer.from(payload.workflow, 'base64'));
const store = new ActivityStore(plan.databasePath, settings); store.transaction(() => store.prune()); store.close();
const transformDir = join(stateDir, 'hooks', 'transforms'); mkdirSync(transformDir, { recursive: true });
const transformPath = join(transformDir, 'liveabit-personal-agent.mjs');
backup(transformPath, 'transform.mjs');
ownedWrite(transformPath, 'export { default } from ' + JSON.stringify(pathToFileURL(join(pluginDir, 'ingress.mjs')).href) + ';\n');
// Select the sole owned immutable load path before native install validates
// package ownership; adding a new link alongside the previous path is ambiguous.
cli(['config', 'patch', '--stdin'], JSON.stringify(plan.patch));
cli(['plugins', 'install', '--link', '--no-enable', '--force', '--accept-capabilities', pluginDir]);
const configAfter = JSON.parse(readFileSync(configPath, 'utf8'));
if (agentFingerprint(configAfter) !== beforeFingerprint) throw new Error('agent_model_or_runtime_changed');
if (readFileSync(plan.deliveryStatePath).compare(stateBytes) !== 0) throw new Error('delivery_state_changed_during_setup');
// Retire only the recognized old dedicated reminder policy after the new
// mapping has been applied. Global channels and other agents stay intact.
if (sourcePolicyPath !== plan.deliveryPolicyPath) {
  if (readFileSync(sourceStatePath).compare(stateBytes) !== 0 || readFileSync(sourcePolicyPath).compare(sourcePolicyBytes) !== 0)
    throw new Error('source_delivery_state_changed_during_setup');
  const retired = JSON.parse(readFileSync(sourcePolicyPath, 'utf8'));
  retired.enabled = false; ownedWrite(sourcePolicyPath, JSON.stringify(retired, null, 2));
}
const validation = { format: 'liveabit.personal-agent.installation.v1', configured: true,
  agent_id: agentId, session_key: plan.sessionKey, automatic_hook_announcements: false,
  durable_activity_storage: true, history_days: settings.historyDays, episode_days: settings.episodeDays,
  accountability_emails_enabled: false, models_and_reasoning_preserved: true,
  original_instructions_preserved: newInstructions.startsWith(existingInstructions) || existingInstructions.includes('<!-- liveabit-personal-agent:start -->'),
  companion_destination_preserved: true, timing_preferences_preserved: true,
  companion_connected_at_setup: savedPhone[0].connected === true,
  delivery_state_preserved: true, notification_sent: false, apk_changed: false,
  source_hash: createHash('sha256').update(readFileSync(join(pluginDir, 'index.mjs'))).digest('hex'),
  backup_directory: backupDir };
writeFileSync(join(ownedRoot, 'installation.json'), JSON.stringify(validation, null, 2));
console.log(JSON.stringify(validation));
} catch (error) {
  // Restore only exact files captured by this setup. Configuration writes from
  // the native install/apply steps are covered by the original private backup.
  // Keep backup/staging/evidence directories and the new local DB for diagnosis.
  const failed = [], preservedConcurrent = [];
  for (const [filename, written] of [...authored].reverse()) {
    try {
      if (!existsSync(filename) || readFileSync(filename).compare(written) !== 0) { preservedConcurrent.push(filename); continue; }
      const original = originals.get(filename);
      if (original === null) { if (existsSync(filename)) unlinkSync(filename); }
      else writeFileSync(filename, original);
    } catch { failed.push(filename); }
  }
  writeFileSync(join(backupDir, 'rollback.json'), JSON.stringify({ restored_owned_files: failed.length === 0 && preservedConcurrent.length === 0, failed_paths: failed, concurrent_files_preserved: preservedConcurrent }));
  throw new Error('installation_failed; owned configuration/instructions restored=' + (failed.length === 0 && preservedConcurrent.length === 0) + '; ' + error.message);
}
