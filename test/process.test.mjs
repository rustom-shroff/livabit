import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { JsonStore } from '../src/storage.mjs';
import { ManualClock } from '../src/clock.mjs';
import { Receiver, createReceiverState } from '../src/receiver.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CLI = fileURLToPath(new URL('../src/publisher-cli.mjs', import.meta.url));
const START = Date.parse('2026-10-04T00:00:00.000Z');
const INTERVAL = 900_000;
const iso = n => new Date(n).toISOString();

async function run(configPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, '--config', configPath], {
      cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '', stderr = '', failure;
    const limit = (current, chunk) => {
      const next = current + chunk.toString('utf8');
      if (Buffer.byteLength(next) > 8192) { failure = new Error('Child exceeded safe output bound.'); child.kill(); }
      return next;
    };
    child.stdout.on('data', chunk => { stdout = limit(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = limit(stderr, chunk); });
    const timer = setTimeout(() => { failure = new Error('Foreground publisher child exceeded ten seconds.'); child.kill(); }, 10_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (failure) { reject(failure); return; }
      resolve({ code, signal, stdout, stderr });
    });
  });
}

async function setup(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'oap-process-'));
  assert.ok(path.resolve(directory).startsWith(path.join(path.resolve(os.tmpdir()), 'oap-process-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const app = { namespace: 'android.package', id: 'org.example.reader' };
  const scope = { applications: [app], allowed_fields: ['foreground_duration_ms'], event_names: ['activity.summary'],
    aggregation_interval_ms: INTERVAL, history_max_age_ms: 86_400_000, history_max_bytes: 4_194_304 };
  const recipient = randomUUID(), grantId = randomUUID(), expiry = iso(START + 86_400_000);
  const grant = { protocol_version: '0.1.0', grant_id: grantId, recipient_id: recipient,
    device_binding_id: randomUUID(), user_binding_id: randomUUID(), scope_revision: 1, state: 'active',
    created_at: iso(START), approved_at: iso(START), expires_at: expiry, scope };
  const subscription = { protocol_version: '0.1.0', subscription_id: randomUUID(), grant_id: grantId,
    recipient_id: recipient, stream_id: randomUUID(), scope_revision: 1, state: 'active',
    created_at: iso(START), expires_at: expiry, idempotency_key: randomUUID(), scope };
  const token = randomBytes(32).toString('hex');
  const clock = new ManualClock(START + INTERVAL);
  const receiverPath = path.join(directory, 'receiver.json');
  const receiver = new Receiver({ store: new JsonStore(receiverPath, createReceiverState()), clock });
  const authorization = Object.fromEntries(['recipient_id', 'stream_id', 'subscription_id', 'scope_revision', 'expires_at', 'scope'].map(key => [key, subscription[key]]));
  await receiver.configure({ authorization, token, credentialExpiresAt: expiry, deviceBindingId: grant.device_binding_id });
  let server = await receiver.startServer();
  t.after(() => server.close());
  const binding = { recipient_id: recipient, profile_id: 'direct-loopback-test-v1', endpoint_ref: randomUUID(), credential_ref: randomUUID() };
  const credential = { token, expires_at: expiry, profile_id: binding.profile_id, recipient_id: recipient,
    stream_id: subscription.stream_id, subscription_id: subscription.subscription_id, scope_revision: 1, endpoint: server.baseUrl };
  const candidate = { start: iso(START), end: iso(START + INTERVAL),
    coverage: { status: 'complete', observed_intervals: [{ start: iso(START), end: iso(START + INTERVAL) }], reasons: [] },
    apps: [{ application: app, foreground_duration_ms: 120_000 }] };
  const configPath = path.join(directory, 'synthetic-config.json');
  const config = { synthetic_only: true, state_path: 'device.json', clock_now: iso(clock.now()),
    operation: 'prepare', grant, subscription, binding, credential, candidate };
  const devicePath = path.join(directory, config.state_path);
  const invoke = async (operation, extra = {}) => {
    const selected = { ...config, operation, ...extra };
    if (operation !== 'prepare') delete selected.candidate;
    await writeFile(configPath, JSON.stringify(selected), { mode: 0o600 });
    const result = await run(configPath);
    assert.equal(result.stdout.includes(token) || result.stderr.includes(token), false);
    assert.equal(result.stdout.includes(app.id) || result.stderr.includes(app.id), false);
    return result;
  };
  const reconnect = async () => {
    const port = Number(new URL(server.baseUrl).port);
    await server.close();
    server = await receiver.startServer({ port });
  };
  return { directory, receiver, clock, config, configPath, devicePath, invoke, stop: () => server.close(), reconnect };
}

test('actual publisher process exits and another process delivers the identical durable queued page', async t => {
  const x = await setup(t);
  const prepared = await x.invoke('prepare');
  assert.equal(prepared.code, 0, prepared.stderr);
  assert.equal(JSON.parse(prepared.stdout).status.retention.queued_events, 1);
  assert.equal(Object.keys((await x.receiver.snapshot()).ledger).length, 0);
  const firstDisk = JSON.parse(await readFile(x.devicePath, 'utf8'));
  const originalEntry = firstDisk.recipients[x.config.binding.recipient_id].entries[0];
  const delivered = await x.invoke('drain');
  assert.equal(delivered.code, 0, delivered.stderr);
  const status = JSON.parse(delivered.stdout).status;
  assert.equal(status.retention.queued_events, 0);
  assert.ok(status.last_valid_consumption_at);
  const secondDisk = JSON.parse(await readFile(x.devicePath, 'utf8'));
  const deliveredEntry = secondDisk.recipients[x.config.binding.recipient_id].entries[0];
  assert.equal(deliveredEntry.canonical, originalEntry.canonical);
  assert.equal(deliveredEntry.event.event_id, originalEntry.event.event_id);
  assert.equal(deliveredEntry.received, true);
  assert.equal(deliveredEntry.attempts, 1);
  assert.equal(secondDisk.recipients[x.config.binding.recipient_id].freshBudget.length, 1);
  const again = await x.invoke('drain');
  assert.equal(again.code, 0, again.stderr);
  assert.equal(Object.keys((await x.receiver.snapshot()).ledger).length, 1);
  const group = Object.values((await x.receiver.snapshot()).groups)[0];
  assert.equal(group.pages['0'].apps[0].foreground_duration_ms, 120_000);
  assert.equal((await readFile(x.devicePath, 'utf8')).includes(x.config.credential.token), false);
});

test('offline revocation in one process persists across exit, receiver reconnect and a new publisher process', async t => {
  const x = await setup(t);
  assert.equal((await x.invoke('prepare')).code, 0);
  await x.stop();
  const revoked = await x.invoke('revoke');
  assert.equal(revoked.code, 0, revoked.stderr);
  assert.equal(JSON.parse(revoked.stdout).status.consent_state, 'revoked');
  const disk = JSON.parse(await readFile(x.devicePath, 'utf8'));
  assert.equal(disk.recipients[x.config.binding.recipient_id].entries.length, 0);
  await x.reconnect();
  const drained = await x.invoke('drain');
  assert.equal(drained.code, 1);
  assert.equal(JSON.parse(drained.stderr).error.code, 'consent_inactive');
  assert.equal(Object.keys((await x.receiver.snapshot()).ledger).length, 0);
  const status = await x.invoke('status');
  assert.equal(status.code, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).status.consent_state, 'revoked');
});

test('a restarted publisher process rejects corrupt existing state without resetting it or exposing credentials', async t => {
  const x = await setup(t);
  assert.equal((await x.invoke('prepare')).code, 0);
  const corrupt = `{"unexpected_secret":"${x.config.credential.token}"`;
  await writeFile(x.devicePath, corrupt);
  const failed = await x.invoke('drain');
  assert.equal(failed.code, 1);
  assert.equal(JSON.parse(failed.stderr).error.code, 'storage_unavailable');
  assert.equal(await readFile(x.devicePath, 'utf8'), corrupt);
  assert.equal(Object.keys((await x.receiver.snapshot()).ledger).length, 0);
});

test('synthetic process entry rejects unapproved execution, unknown controls and state path traversal', async t => {
  const x = await setup(t);
  for (const extra of [{ synthetic_only: false }, { issue_device_command: 'do anything' }, { state_path: '../escaped-device.json' }]) {
    const failed = await x.invoke('prepare', extra);
    assert.equal(failed.code, 1);
    assert.equal(JSON.parse(failed.stderr).error.code, 'invalid_request');
  }
  await assert.rejects(readFile(x.devicePath), error => error.code === 'ENOENT');
  assert.equal(Object.keys((await x.receiver.snapshot()).ledger).length, 0);
});

test('clock rollback in a fresh publisher process blocks data while an offline revocation still commits', async t => {
  const x = await setup(t);
  assert.equal((await x.invoke('prepare')).code, 0);
  await x.stop();
  const rollback = { clock_now: iso(START) };
  const blocked = await x.invoke('drain', rollback);
  assert.equal(blocked.code, 1);
  assert.equal(JSON.parse(blocked.stderr).error.code, 'clock_untrusted');
  const revoked = await x.invoke('revoke', rollback);
  assert.equal(revoked.code, 0, revoked.stderr);
  assert.equal(JSON.parse(revoked.stdout).status.consent_state, 'revoked');
  const status = await x.invoke('status');
  assert.equal(status.code, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).status.consent_state, 'revoked');
  assert.equal(Object.keys((await x.receiver.snapshot()).ledger).length, 0);
});
