import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { activityConnection, exportActivityConnection } from '../scripts/export-openclaw-activity-connection.mjs';

const source = { format: 'liveabit.openclaw.connection.v1', url: 'http://192.168.1.20:62283/hooks/liveabit',
  key: 'synthetic-private-key-'.repeat(3), agent_id: 'liveabit', warning_minutes: 45 };

test('activity setup export preserves destination, transport, credential and warning preference', () => {
  for (const url of [source.url, 'https://example.test:443/hooks/agent', 'http://127.0.0.1:62283/liveabit/activity']) {
    const original = { ...source, url, extra: 'discard unrelated metadata' };
    const before = JSON.stringify(original);
    const result = activityConnection(original);
    assert.equal(new URL(result.url).origin, new URL(url).origin);
    assert.equal(new URL(result.url).pathname, '/liveabit/activity');
    assert.equal(result.key, original.key);
    assert.equal(result.warning_minutes, 45);
    assert.equal(result.agent_id, 'main');
    assert.equal(JSON.stringify(original), before);
    assert.equal(Object.hasOwn(result, 'extra'), false);
  }
});

test('invalid connection exports fail without reflecting credentials or accepting URL authority changes', () => {
  for (const invalid of [null, { ...source, format: 'computer-config' }, { ...source, key: 'secret' },
    { ...source, url: 'https://user:password@example.test/hooks/liveabit' },
    { ...source, url: 'https://example.test/hooks/liveabit?key=secret' },
    { ...source, url: 'https://example.test/hooks/liveabit#secret' },
    { ...source, url: 'file:///hooks/liveabit' }, { ...source, url: 'https://example.test/other' },
    { ...source, warning_minutes: 0 }, { ...source, warning_minutes: '45' }]) {
    assert.throws(() => activityConnection(invalid), { message: 'invalid_connection' });
  }
});

test('separate export is exclusive and cannot overwrite either the original or an existing output', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'liveabit-connection-export-'));
  t.after(async () => {
    assert(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    await rm(directory, { recursive: true, force: true });
  });
  const input = join(directory, 'source.json'), output = join(directory, 'activity.json');
  const bytes = JSON.stringify(source);
  await writeFile(input, bytes);
  await assert.rejects(exportActivityConnection(input, input), /separate_output_required/);
  const result = await exportActivityConnection(input, output);
  assert.equal(result.source_unchanged, true);
  assert.equal(await readFile(input, 'utf8'), bytes);
  const first = await readFile(output, 'utf8');
  await assert.rejects(exportActivityConnection(input, output), { code: 'EEXIST' });
  assert.equal(await readFile(output, 'utf8'), first);
  assert.equal(JSON.parse(first).url, 'http://192.168.1.20:62283/liveabit/activity');
  const cli = spawnSync(process.execPath, ['scripts/export-openclaw-activity-connection.mjs', '--source', input, '--output', output], { encoding: 'utf8', windowsHide: true });
  assert.equal(cli.status, 1);
  assert.equal((cli.stdout + cli.stderr).includes(source.key), false);
  assert.match(cli.stderr, /Connection export failed/);
});
