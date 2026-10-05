// Synthetic data only. One device process sends HTTP directly to one final consumer.
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DevicePublisher } from './publisher.mjs';
import { DirectAdapter } from './direct-adapter.mjs';
import { JsonStore } from './storage.mjs';
import { ManualClock } from './clock.mjs';

const START = Date.parse('2026-10-04T00:00:00.000Z');
const INTERVAL = 900_000, HOUR = 3_600_000;
const iso = value => new Date(value).toISOString();
const app = { namespace: 'android.package', id: 'org.example.synthetic.reader' };
const workerPath = fileURLToPath(new URL('./mock-receiver-worker.mjs', import.meta.url));
const code = expected => error => error?.code === expected;

function worker() {
  const child = fork(workerPath, [], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  let nextId = 0, exited = false;
  const pending = new Map();
  child.on('message', message => {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.error) request.reject(Object.assign(new Error('Synthetic final receiver rejected the operation.'), message.error));
    else request.resolve(message.result);
  });
  const fail = () => {
    exited = true;
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Synthetic receiver stopped.')); }
    pending.clear();
  };
  child.once('exit', fail); child.once('error', fail);
  return {
    pid: child.pid,
    request(operation, value) {
      if (exited) return Promise.reject(new Error('Synthetic receiver is unavailable.'));
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => { pending.delete(id); child.kill(); reject(new Error('Synthetic receiver exceeded its ten-second bound.')); }, 10_000);
        pending.set(id, { resolve, reject, timer }); child.send({ id, operation, value });
      });
    },
    async close() {
      if (!exited && child.connected) await this.request('close');
      if (!exited) await new Promise(resolve => child.once('exit', resolve));
    },
    kill() { child.kill(); }
  };
}

async function scenario(directory, grantHours = 24) {
  const scope = { applications: [app], allowed_fields: ['foreground_duration_ms'], event_names: ['activity.summary'],
    aggregation_interval_ms: INTERVAL, history_max_age_ms: 86_400_000, history_max_bytes: 4_194_304 };
  const recipient = randomUUID(), grantId = randomUUID(), expiry = iso(START + grantHours * HOUR);
  const grant = { protocol_version: '0.1.0', grant_id: grantId, recipient_id: recipient,
    device_binding_id: randomUUID(), user_binding_id: randomUUID(), scope_revision: 1, state: 'active',
    created_at: iso(START), approved_at: iso(START), expires_at: expiry, scope };
  const subscription = { protocol_version: '0.1.0', subscription_id: randomUUID(), grant_id: grantId,
    recipient_id: recipient, stream_id: randomUUID(), scope_revision: 1, state: 'active', created_at: iso(START),
    expires_at: expiry, idempotency_key: randomUUID(), scope };
  const binding = { recipient_id: recipient, profile_id: 'direct-loopback-test-v1', endpoint_ref: randomUUID(), credential_ref: randomUUID() };
  const token = randomBytes(32).toString('hex'); // Disposable receiver-issued synthetic bearer; never reported.
  const authorization = Object.fromEntries(['recipient_id', 'stream_id', 'subscription_id', 'scope_revision', 'expires_at', 'scope'].map(key => [key, subscription[key]]));
  const credential = { token, expires_at: expiry, profile_id: binding.profile_id, recipient_id: recipient,
    stream_id: subscription.stream_id, subscription_id: subscription.subscription_id, scope_revision: 1 };
  const clock = new ManualClock(START);
  const credentials = new Map([[recipient, credential]]);
  const deviceFile = path.join(directory, 'device.json');
  const receiverFile = path.join(directory, 'final-receiver.json');
  let finalReceiver, publisher, store, adapter, receiverPort = 0;
  const destinations = new Set();
  async function startReceiver() {
    finalReceiver = worker();
    try {
      const result = await finalReceiver.request('setup', { synthetic_only: true, clock_now: clock.now(), state_path: receiverFile, port: receiverPort,
        credential: { authorization, token, credentialExpiresAt: expiry, deviceBindingId: grant.device_binding_id } });
      credential.endpoint = result.base_url;
      const destination = new URL(result.base_url);
      receiverPort = Number(destination.port); // Restart the same paired final endpoint; a new port needs fresh approval.
      assert.equal(destination.hostname, '127.0.0.1'); assert.equal(destination.protocol, 'http:');
      destinations.add(destination.origin);
    } catch (error) { finalReceiver.kill(); throw error; }
  }
  async function startPublisher() {
    store = new JsonStore(deviceFile, {});
    publisher = new DevicePublisher({ store, clock, credentials, random: () => 0.5 });
    adapter = new DirectAdapter({ clock, credentialProvider: credentials, allowLoopbackTest: true });
    await publisher.initialize();
  }
  await startReceiver();
  try {
    await startPublisher();
    const receiverCapabilities = await adapter.getCapabilities(binding);
    await publisher.approve({ grant, subscription, binding, monitoringApproved: true, receiverCapabilities });
  } catch (error) { await finalReceiver.close(); throw error; }
  return {
    grant, subscription, binding, clock, deviceFile, receiverFile, token, destinations,
    get publisher() { return publisher; }, get adapter() { return adapter; },
    async advance(milliseconds) { clock.advance(milliseconds); if (finalReceiver) await finalReceiver.request('advance', milliseconds); },
    async finalize() {
      const end = clock.now(), start = end - INTERVAL;
      return publisher.finalizeWindow(subscription.subscription_id, { start: iso(start), end: iso(end),
        observations: [{ application: { ...app, label: 'UNAPPROVED_SYNTHETIC_LABEL' }, start: iso(start), end: iso(start + 120_000),
          private_content: 'UNAPPROVED_SYNTHETIC_CONTENT' },
        { application: { namespace: 'android.package', id: 'UNAPPROVED_SYNTHETIC_APP' }, start: iso(start), end: iso(start + 60_000) }],
        observed_intervals: [{ start: iso(start), end: iso(end) }], reasons: [] });
    },
    counts() { return finalReceiver.request('counts'); },
    async restart() {
      await store.close(); await finalReceiver.close(); finalReceiver = undefined;
      await startReceiver(); await startPublisher();
    },
    async stopReceiver() { await finalReceiver.close(); finalReceiver = undefined; },
    async resumeReceiver() { await startReceiver(); },
    async restartPublisher() { await store.close(); await startPublisher(); },
    async close() { await store.close(); if (finalReceiver) await finalReceiver.close(); },
    async assertRedacted() {
      const saved = await readFile(deviceFile, 'utf8');
      for (const secret of [token, 'UNAPPROVED_SYNTHETIC_LABEL', 'UNAPPROVED_SYNTHETIC_CONTENT', 'UNAPPROVED_SYNTHETIC_APP']) assert.equal(saved.includes(secret), false);
      assert.equal((await readFile(receiverFile, 'utf8')).includes(token), false);
    }
  };
}

async function lifecycle(directory) {
  const x = await scenario(directory);
  try {
    const creation = { grant_id: x.grant.grant_id, idempotency_key: x.subscription.idempotency_key,
      requested_scope: x.subscription.scope, requested_expires_at: x.subscription.expires_at };
    assert.deepEqual(await x.publisher.configureSubscription(creation), await x.publisher.configureSubscription(creation));
    await x.advance(INTERVAL);
    const [event] = await x.finalize();
    await x.publisher.dispatchNext(x.subscription.subscription_id, x.adapter);
    assert.equal((await x.counts()).accepted, 1);
    assert.equal((await x.adapter.deliver(event, x.binding)).disposition, 'duplicate');
    assert.equal((await x.counts()).duplicates, 1);
    const renewal = { subscription_id: x.subscription.subscription_id, idempotency_key: randomUUID(), requested_expires_at: x.subscription.expires_at };
    assert.deepEqual(await x.publisher.renewSubscription(renewal), await x.publisher.renewSubscription(renewal));
    await x.publisher.setNetworkAvailable(false);
    for (let i = 0; i < 16; i++) { await x.advance(INTERVAL); await x.finalize(); }
    assert.equal((await x.publisher.getLocalStatus(x.grant.recipient_id)).retention.queued_events, 16);
    await x.restart();
    await x.publisher.setNetworkAvailable(true);
    assert.equal((await x.adapter.deliver(event, x.binding)).disposition, 'duplicate'); // Receiver process restarted, ledger persisted.
    for (let hour = 0; hour < 4; hour++) {
      if (hour) await x.advance(HOUR);
      for (let attempt = 0; attempt < 4; attempt++) await x.publisher.dispatchNext(x.subscription.subscription_id, x.adapter);
      const expected = 16 - 4 * (hour + 1);
      assert.equal((await x.publisher.getLocalStatus(x.grant.recipient_id)).retention.queued_events, expected);
    }
    const recovered = await x.counts();
    assert.equal(recovered.accepted, 16); assert.equal(recovered.retained_pages, 17);
    await x.assertRedacted();
    await x.publisher.pause(x.grant.recipient_id);
    await assert.rejects(x.publisher.selectReplay({ subscription_id: x.subscription.subscription_id }), code('consent_inactive'));
    await x.publisher.resume(x.grant.recipient_id);
    await x.advance(INTERVAL); await x.finalize();
    await x.stopReceiver();
    await x.publisher.setNetworkAvailable(false);
    await x.publisher.revoke(x.grant.recipient_id);
    await x.restartPublisher();
    await x.resumeReceiver();
    await assert.rejects(x.publisher.dispatchNext(x.subscription.subscription_id, x.adapter), code('consent_inactive'));
    assert.equal((await x.publisher.getLocalStatus(x.grant.recipient_id)).consent_state, 'revoked');
    assert.equal((await x.publisher.getLocalStatus(x.grant.recipient_id)).retention.queued_events, 0);
    assert.equal((await x.counts()).accepted, 0);
    assert.equal(x.destinations.size, 1);
    return { result: 'pass', first_delivery: 'accepted', exact_duplicate_before_and_after_receiver_restart: 'duplicate',
      outage_hours: 4, retained_backlog_pages: 16, recovered_pages: 16, recovery_fresh_pages_per_hour: 4,
      pause_retained_read: 'denied', offline_revoke_after_publisher_restart: 'denied', denied_data_and_bearer_absent_from_device_state: true,
      final_destination_origins: [...x.destinations], processes_at_a_time: ['synthetic_device', 'final_deterministic_receiver'], intermediaries: 0 };
  } finally { await x.close(); }
}

async function benchmark(directory) {
  // Explicit synthetic 32-hour authority permits 100 windows. History still expires from each original window start within 24 hours.
  const x = await scenario(directory, 32);
  try {
    const samples = [];
    for (let i = 0; i < 100; i++) {
      await x.advance(INTERVAL);
      const started = performance.now();
      await x.finalize();
      await x.publisher.dispatchNext(x.subscription.subscription_id, x.adapter);
      samples.push(performance.now() - started);
      assert.equal((await x.counts()).accepted, i + 1);
    }
    await x.assertRedacted();
    const ordered = [...samples].sort((a, b) => a - b), p95 = ordered[Math.ceil(0.95 * samples.length) - 1];
    assert.ok(p95 <= 2000, 'Local durable-consumption upper-bound p95 must be <= 2 seconds.');
    return { result: 'pass', accepted_summaries: 100, timing: 'Real monotonic time from finalization invocation through durable valid receipt and local receipt commit; includes local aggregation computation, outbox commit and dispatch, giving an upper bound on publication-to-valid-consumption.',
      p95_ms: p95, max_ms: ordered.at(-1), threshold_ms: 2000, samples_ms: samples,
      synthetic_clock_hours: 25, synthetic_authority_hours: 32, synthetic_interval_ms: INTERVAL,
      exclusions: ['simulated observation and aggregation interval', 'setup', 'outage and fault scenarios', 'AI evaluation and notification'],
      profile_id: 'direct-loopback-test-v1', final_destination_origins: [...x.destinations], production_sla: false };
  } finally { await x.close(); }
}

export async function runDemo() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'oap-direct-demo-'));
  // The recursive cleanup target is this newly allocated disposable directory only.
  assert.ok(path.resolve(temporary).startsWith(path.join(path.resolve(os.tmpdir()), 'oap-direct-demo-')));
  try {
    return { evidence_version: 1, generated_at: new Date().toISOString(), protocol_version: '0.1.0', approved_contract_date: '2026-10-04',
      synthetic_only: true, environment: { platform: process.platform, release: os.release(), architecture: process.arch, node: process.version },
      lifecycle: await lifecycle(path.join(temporary, 'lifecycle')), latency: await benchmark(path.join(temporary, 'benchmark')),
      portability: { recorded_platform: process.platform, recorded_platform_result: 'pass',
        linux: process.platform === 'linux' ? 'this_run_recorded' : 'not_run', windows: process.platform === 'win32' ? 'this_run_recorded' : 'not_run',
        m1_gate: 'Windows reference scope accepted by user under ADR-0008; Linux deferred. This demo alone does not establish real-agent or Android behavior.' },
      real_existing_agent: 'not_run', android: 'not_run', hosted_delivery_infrastructure: false };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3 || process.argv[2] && process.argv[2] !== '--save-evidence') throw new Error('Use node src/demo.mjs [--save-evidence].');
    const result = await runDemo();
    if (process.argv[2] === '--save-evidence') await writeFile(new URL('../docs/review/phase-4-demo.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ result: 'pass', synthetic_only: true, lifecycle: result.lifecycle,
      latency: { accepted_summaries: 100, p95_ms: result.latency.p95_ms, threshold_ms: 2000 }, portability: result.portability }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ result: 'fail', code: error?.code ?? 'reference_demo_failed', message: 'The synthetic reference demo failed; run the test suite for diagnostic evidence.' }));
    process.exitCode = 1;
  }
}
