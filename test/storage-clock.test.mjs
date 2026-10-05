import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../src/storage.mjs';
import { SystemClock, ManualClock } from '../src/clock.mjs';

async function localStore(t, maxBytes = 1024) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'oap-store-test-'));
  assert.ok(path.resolve(directory).startsWith(path.join(path.resolve(os.tmpdir()), 'oap-store-test-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'state.json');
  return { filename, store: new JsonStore(filename, { count: 0, active: true }, { maxBytes }) };
}

test('durable transactions serialize concurrent accounting updates and returned reads cannot mutate state', async t => {
  const { store, filename } = await localStore(t);
  await Promise.all(Array.from({ length: 20 }, () => store.transaction(draft => { draft.count++; })));
  assert.equal((await store.read()).count, 20);
  const external = await store.read(); external.active = false;
  assert.equal((await store.read()).active, true);
  await store.close();
  assert.equal((await new JsonStore(filename, {}).read()).count, 20);
});

test('failed transaction and quota overflow leave the last committed file unchanged', async t => {
  const { store, filename } = await localStore(t, 64);
  await store.open(); const original = await readFile(filename, 'utf8');
  await assert.rejects(store.transaction(draft => { draft.active = false; throw new Error('injected failure'); }));
  assert.equal(await readFile(filename, 'utf8'), original);
  await assert.rejects(store.transaction(draft => { draft.excess = 'x'.repeat(100); }), error => error.code === 'storage_unavailable');
  assert.equal(await readFile(filename, 'utf8'), original);
  assert.deepEqual(await store.read(), { active: true, count: 0 });
});

test('post-commit dispatch begins before the next queued denial while seeing only committed state', async t => {
  const { store, filename } = await localStore(t);
  const observed = [];
  const first = store.transaction(draft => { draft.count++; }, { afterCommit: (_, committed) => {
    observed.push({ operation: 'dispatch_begin', count: store.peek().count, active: committed.active });
  } });
  const deny = store.transaction(draft => { draft.active = false; }, { afterCommit: () => observed.push({ operation: 'denial_commit' }) });
  await Promise.all([first, deny]);
  assert.deepEqual(observed, [{ operation: 'dispatch_begin', count: 1, active: true }, { operation: 'denial_commit' }]);
  assert.equal(JSON.parse(await readFile(filename, 'utf8')).active, false);
});

test('corrupt existing UTF-8 or JSON state is refused and never reset to fresh authority', async t => {
  const { filename } = await localStore(t);
  for (const bytes of [Buffer.from('{bad'), Buffer.from([0xff]), Buffer.from('{"active":true,"active":false}'), Buffer.from('[]')]) {
    await writeFile(filename, bytes);
    const store = new JsonStore(filename, { active: true });
    await assert.rejects(store.read(), error => error.code === 'storage_unavailable');
    assert.deepEqual(await readFile(filename), bytes);
  }
});

test('system clock detects forward and backward discontinuities against elapsed time', () => {
  let wall = 1_800_000_000_000, elapsed = 10;
  const clock = new SystemClock({ wall: () => wall, monotonic: () => elapsed });
  wall += 60_000; elapsed += 60_000; assert.equal(clock.trusted(), true);
  wall += 300_001; assert.equal(clock.trusted(), false);
  wall -= 600_002; assert.equal(clock.trusted(), false);
});

test('accelerated synthetic time advances both clocks while an unaccounted jump becomes untrusted', () => {
  const clock = new ManualClock('2026-10-04T00:00:00.000Z');
  clock.advance(86_400_000); assert.equal(clock.elapsed(), 86_400_000); assert.equal(clock.trusted(), true);
  clock.set(clock.now() - 600_000); assert.equal(clock.trusted(), false);
});
