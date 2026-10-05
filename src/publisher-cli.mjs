// Foreground synthetic M1 device process. This is not a production credential store.
import path from 'node:path';
import { readFile, realpath, lstat } from 'node:fs/promises';
import { JsonStore } from './storage.mjs';
import { ManualClock } from './clock.mjs';
import { DevicePublisher } from './publisher.mjs';
import { DirectAdapter, validateDestination } from './direct-adapter.mjs';
import { parseJson, assertSchema, OapError } from './protocol.mjs';

const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const fail = () => { throw new OapError('invalid_request', 'The synthetic local publisher configuration is invalid.'); };
const onlyKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
const within = (directory, filename) => {
  const relative = path.relative(directory, filename);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
};

async function protectedStatePath(configPath, statePath) {
  if (typeof statePath !== 'string' || statePath.length < 1 || statePath.length > 256 ||
      path.isAbsolute(statePath) || /^[a-z]:/i.test(statePath) || statePath.includes('\0')) fail();
  const base = await realpath(path.dirname(configPath));
  const filename = path.resolve(base, statePath);
  if (!within(base, filename)) fail();
  try { if ((await lstat(filename)).isSymbolicLink()) fail(); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let ancestor = path.dirname(filename);
  for (;;) {
    try {
      const resolved = await realpath(ancestor);
      if (resolved !== base && !within(base, resolved)) fail();
      return filename;
    } catch (error) {
      if (error.code !== 'ENOENT' || ancestor === base) throw error;
      ancestor = path.dirname(ancestor);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--config') fail();
  const configPath = await realpath(path.resolve(args[1]));
  const config = parseJson(await readFile(configPath), 65_536);
  if (!onlyKeys(config, ['synthetic_only', 'state_path', 'clock_now', 'operation', 'grant', 'subscription', 'binding', 'credential', 'candidate']) ||
      config.synthetic_only !== true || !['prepare', 'drain', 'revoke', 'status'].includes(config.operation)) fail();
  const instant = typeof config.clock_now === 'number' ? config.clock_now : Date.parse(config.clock_now);
  if (!Number.isSafeInteger(instant) || instant < 0 || !Number.isFinite(new Date(instant).getTime()) ||
      new Date(instant).toISOString().length !== 24 ||
      typeof config.clock_now === 'string' && new Date(instant).toISOString() !== config.clock_now) fail();
  const binding = config.binding, credential = config.credential;
  if (!onlyKeys(binding, ['recipient_id', 'profile_id', 'endpoint_ref', 'credential_ref']) ||
      !['recipient_id', 'endpoint_ref', 'credential_ref'].every(key => isUuid(binding[key])) ||
      binding.profile_id !== 'direct-loopback-test-v1' ||
      !onlyKeys(credential, ['token', 'expires_at', 'profile_id', 'recipient_id', 'stream_id', 'subscription_id', 'scope_revision', 'endpoint']) ||
      !['recipient_id', 'stream_id', 'subscription_id'].every(key => isUuid(credential[key])) ||
      credential.profile_id !== binding.profile_id || credential.recipient_id !== binding.recipient_id ||
      !Number.isSafeInteger(credential.scope_revision) || credential.scope_revision < 1 ||
      typeof credential.token !== 'string' || !/^[A-Za-z0-9._~+/-]{43,512}={0,2}$/.test(credential.token) ||
      typeof credential.expires_at !== 'string' || !Number.isFinite(Date.parse(credential.expires_at)) ||
      new Date(Date.parse(credential.expires_at)).toISOString() !== credential.expires_at) fail();
  validateDestination(credential.endpoint, credential.profile_id, true);
  if (config.grant) assertSchema('local-grant', config.grant);
  if (config.subscription) assertSchema('subscription', config.subscription);
  if (config.operation === 'prepare' && (!config.grant || !config.subscription)) fail();
  if (config.candidate && config.operation !== 'prepare') fail();
  const filename = await protectedStatePath(configPath, config.state_path);
  const store = new JsonStore(filename, {});
  const clock = new ManualClock(instant);
  const credentials = new Map([[credential.recipient_id, credential]]);
  const publisher = new DevicePublisher({ store, clock, credentials });
  const adapter = new DirectAdapter({ clock, credentialProvider: credentials, allowLoopbackTest: true });
  let status;
  try {
    if (config.operation === 'prepare') {
      const receiverCapabilities = await adapter.getCapabilities(binding);
      await publisher.approve({ grant: config.grant, subscription: config.subscription, binding, monitoringApproved: true, receiverCapabilities });
      if (config.candidate) await publisher.finalizeWindow(config.subscription.subscription_id, config.candidate);
    } else {
      try { await publisher.initialize(); }
      catch (error) { if (config.operation !== 'revoke' || error.code !== 'clock_untrusted') throw error; }
      if (config.operation === 'drain') await publisher.dispatchNext(credential.subscription_id, adapter);
      if (config.operation === 'revoke') status = await publisher.revoke(binding.recipient_id);
    }
    status ??= await publisher.getLocalStatus(binding.recipient_id);
    console.log(JSON.stringify({ status }));
  } finally { await store.close(); }
}

main().catch(error => {
  // Fixed error text replaces filesystem paths, raw failures, payloads and tokens.
  const safe = new OapError(error?.code ?? 'invalid_request', 'The synthetic publisher operation could not be completed.');
  console.error(JSON.stringify({ error: safe.toJSON() }));
  process.exitCode = 1;
});
