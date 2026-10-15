import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackgroundService } from '../integrations/openclaw/personal-agent/background.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('slow analysis cannot starve independent durable notification delivery checks', async () => {
  const waiting = deferred(); let tick, reviews = 0, deliveries = 0;
  const service = createBackgroundService({ runtime: { nodes: {} }, logger: { warn() {} }, getSettings: () => ({}),
    reviewTick: async () => { reviews++; await waiting.promise; },
    deliveryTick: async () => { deliveries++; },
    schedule: callback => { tick = callback; return { unref() {} }; }, cancel() {} });
  service.start(); await flush();
  assert.equal(reviews, 1); assert.equal(deliveries, 1);
  tick(); await flush(); assert.equal(reviews, 1); assert.equal(deliveries, 2);
  service.stop(); waiting.resolve(); await flush();
});

test('stop/start permanently revokes old async guards and old completion cannot release new worker flags', async () => {
  const pending = [], guards = [], signals = [], timers = []; let starts = 0;
  const service = createBackgroundService({ runtime: { nodes: {} }, logger: { warn() {} }, getSettings: () => ({}),
    reviewTick: async ({ guard }) => { starts++; guards.push(guard); const wait = deferred(); pending.push(wait); await wait.promise; guard(); },
    deliveryTick: async ({ signal }) => { signals.push(signal); },
    schedule: callback => { timers.push(callback); return timers.length; }, cancel() {} });
  service.start(); await flush(); service.stop();
  assert.throws(() => guards[0](), /invocation_unavailable/); assert.equal(signals[0].aborted, true);
  service.start(); await flush(); guards[1]();
  assert.throws(() => guards[0](), /invocation_unavailable/);
  pending[0].resolve(); await flush(); timers[1](); await flush();
  assert.equal(starts, 2, 'old finally must not permit a second new-owner review');
  service.stop(); pending[1].resolve(); await flush();
  assert.throws(() => guards[1](), /invocation_unavailable/);
});
