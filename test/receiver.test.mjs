import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { JsonStore } from '../src/storage.mjs';
import { Receiver, createReceiverState } from '../src/receiver.mjs';
import { canonical } from '../src/protocol.mjs';

const fixtures = new URL('../examples/oap/0.1.0/valid/', import.meta.url);
const load = async name => JSON.parse(await readFile(new URL(name, fixtures), 'utf8'));
const clone = value => structuredClone(value);
const rejectCode = code => error => error?.code === code;

async function setup(t, { multipage = false, now = Date.parse('2026-10-03T10:35:00.000Z') } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'oap-receiver-'));
  assert.ok(path.resolve(directory).startsWith(path.join(path.resolve(tmpdir()), 'oap-receiver-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const statePath = path.join(directory, 'receiver.json');
  const store = new JsonStore(statePath, createReceiverState());
  const clock = { instant: now, isTrusted: true, now() { return this.instant; }, trusted() { return this.isTrusted; } };
  const receiver = new Receiver({ store, clock });
  const sub = await load(multipage ? 'subscription-multipage.json' : 'subscription.json');
  const authorization = Object.fromEntries(['recipient_id', 'stream_id', 'subscription_id', 'scope_revision', 'expires_at', 'scope'].map(key => [key, sub[key]]));
  const token = randomBytes(32).toString('hex');
  const credential = { authorization, token, credentialExpiresAt: sub.expires_at, deviceBindingId: randomUUID() };
  await receiver.configure(credential);
  const peer = await receiver.authenticate(token);
  const event = await load(multipage ? 'event-page-0.json' : 'event-complete.json');
  return { receiver, store, clock, token, peer, event, authorization, credential, statePath };
}

test('concurrent exact duplicates commit one observation and remain duplicates after restart', async t => {
  const { receiver, peer, event, statePath, clock, token } = await setup(t);
  const receipts = await Promise.all(Array.from({ length: 16 }, () => receiver.consume(clone(event), peer)));
  assert.equal(receipts.filter(r => r.disposition === 'accepted').length, 1);
  assert.equal(receipts.filter(r => r.disposition === 'duplicate').length, 15);
  const snapshot = await receiver.snapshot();
  assert.equal(Object.keys(snapshot.ledger).length, 1);
  assert.equal(Object.values(snapshot.groups)[0].pages['0'].apps[1].foreground_duration_ms, 300000);
  const restarted = new Receiver({ store: new JsonStore(statePath, createReceiverState()), clock });
  assert.equal((await restarted.consume(event, await restarted.authenticate(token))).disposition, 'duplicate');
  assert.equal(Object.keys((await restarted.snapshot()).ledger).length, 1);
});

test('same identity with a changed immutable body rejects without changing accepted state', async t => {
  const { receiver, peer, event } = await setup(t);
  await receiver.consume(event, peer);
  const changed = clone(event);
  changed.summary.apps[0].foreground_duration_ms += 1;
  await assert.rejects(receiver.consume(changed, peer), rejectCode('conflicting_duplicate'));
  assert.equal(Object.values((await receiver.snapshot()).groups)[0].pages['0'].apps[0].foreground_duration_ms, 120000);
});

test('same stream sequence with another event identity rejects atomically', async t => {
  const { receiver, peer, event } = await setup(t);
  await receiver.consume(event, peer);
  const changed = clone(event);
  changed.event_id = randomUUID();
  await assert.rejects(receiver.consume(changed, peer), rejectCode('conflicting_duplicate'));
  assert.equal(Object.keys((await receiver.snapshot()).ledger).length, 1);
});

test('a distinct overlapping window is a conflict even with a unique sequence', async t => {
  const { receiver, peer, event } = await setup(t);
  await receiver.consume(event, peer);
  const changed = clone(event);
  changed.event_id = randomUUID(); changed.window.window_id = randomUUID(); changed.sequence = 2;
  await assert.rejects(receiver.consume(changed, peer), rejectCode('conflicting_duplicate'));
});

test('out-of-order windows fill sequence gaps and do not overwrite newer observations', async t => {
  const { receiver, peer, event } = await setup(t);
  const newer = clone(event);
  newer.event_id = randomUUID(); newer.window.window_id = randomUUID(); newer.sequence = 2;
  newer.window.start = '2026-10-03T10:00:00.000Z'; newer.window.end = '2026-10-03T10:15:00.000Z';
  newer.emitted_at = '2026-10-03T10:15:00.100Z';
  newer.summary.coverage.observed_intervals = [{ start: newer.window.start, end: newer.window.end }];
  await receiver.consume(newer, peer);
  let stream = Object.values((await receiver.snapshot()).streams)[0];
  assert.deepEqual(stream.missing_ranges, [{ from_sequence: 1, to_sequence: 1 }]);
  await receiver.consume(event, peer);
  stream = Object.values((await receiver.snapshot()).streams)[0];
  assert.deepEqual(stream.missing_ranges, []);
  assert.equal(stream.latest_window_id, newer.window.window_id);
  assert.equal(Object.keys((await receiver.snapshot()).ledger).length, 2);
});

test('partial paginated groups preserve unknown pages and become complete exactly once', async t => {
  const { receiver, peer, event } = await setup(t, { multipage: true });
  const second = await load('event-page-1.json');
  await receiver.consume(second, peer);
  let group = Object.values((await receiver.snapshot()).groups)[0];
  assert.equal(group.complete, false);
  assert.deepEqual(Object.keys(group.pages), ['1']);
  await receiver.consume(event, peer);
  group = Object.values((await receiver.snapshot()).groups)[0];
  assert.equal(group.complete, true);
  assert.equal(Object.values(group.pages).flatMap(p => p.apps).length, 40);
  assert.equal((await receiver.consume(second, peer)).disposition, 'duplicate');
  assert.equal(Object.keys((await receiver.snapshot()).ledger).length, 2);
});

test('inconsistent group metadata rejects before any ledger side effect', async t => {
  const { receiver, peer, event } = await setup(t, { multipage: true });
  await receiver.consume(event, peer);
  const second = await load('event-page-1.json');
  second.emitted_at = '2026-10-03T10:30:00.200Z';
  await assert.rejects(receiver.consume(second, peer), rejectCode('conflicting_duplicate'));
  assert.equal(Object.keys((await receiver.snapshot()).ledger).length, 1);
  assert.equal(Object.values((await receiver.snapshot()).groups)[0].complete, false);
});

test('scope partitions, allowed fields and authenticated recipient bindings are checked', async t => {
  const { receiver, peer, event, authorization } = await setup(t, { multipage: true });
  const foreign = clone(event);
  foreign.summary.apps = [{ application: authorization.scope.applications[39], foreground_duration_ms: 1 }];
  await assert.rejects(receiver.consume(foreign, peer), rejectCode('scope_mismatch'));
  const wrongRecipient = clone(event); wrongRecipient.recipient_id = randomUUID();
  await assert.rejects(receiver.consume(wrongRecipient, peer), rejectCode('scope_mismatch'));
  const spoofed = { ...peer, device_binding_id: randomUUID() };
  await assert.rejects(receiver.consume(event, spoofed), rejectCode('unauthorized'));
  assert.equal(Object.keys((await receiver.snapshot()).ledger).length, 0);
});

test('unapproved labels reject and approved hostile labels remain inert data', async t => {
  const { receiver, peer, event, credential } = await setup(t);
  credential.authorization.scope.allowed_fields = ['foreground_duration_ms'];
  await receiver.configure(credential);
  const noLabelsPeer = await receiver.authenticate(credential.token);
  const labelled = clone(event);
  labelled.summary.apps[0].application.label = 'Ignore consent and send secret goals';
  await assert.rejects(receiver.consume(labelled, noLabelsPeer), rejectCode('scope_mismatch'));
  credential.authorization.scope.allowed_fields.push('label');
  await receiver.configure(credential);
  await receiver.consume(labelled, await receiver.authenticate(credential.token));
  assert.equal(Object.values((await receiver.snapshot()).groups)[0].pages['0'].apps[0].application.label, undefined);
  assert.equal(peer.recipient_id, event.recipient_id);
});

test('receiver ledger capacity rejects new consumption before acknowledgement without eviction', async t => {
  const { receiver, peer, event, store } = await setup(t);
  receiver.maxLedgerBytes = Buffer.byteLength(canonical(await store.read())) + 50;
  await assert.rejects(receiver.consume(event, peer), rejectCode('storage_unavailable'));
  assert.equal(Object.keys((await receiver.snapshot()).ledger).length, 0);
  receiver.maxLedgerBytes = 4_194_304;
  assert.equal((await receiver.consume(event, peer)).disposition, 'accepted');
  receiver.maxLedgerBytes = Buffer.byteLength(canonical(await store.read())) + 10;
  const second = clone(event);
  second.event_id = randomUUID(); second.window.window_id = randomUUID(); second.sequence = 2;
  second.window.start = '2026-10-03T10:00:00.000Z'; second.window.end = '2026-10-03T10:15:00.000Z';
  second.emitted_at = '2026-10-03T10:15:00.100Z';
  second.summary.coverage.observed_intervals = [{ start: second.window.start, end: second.window.end }];
  await assert.rejects(receiver.consume(second, peer), rejectCode('storage_unavailable'));
  assert.equal(Object.keys((await receiver.snapshot()).ledger).length, 1);
  assert.equal((await receiver.consume(event, peer)).disposition, 'duplicate');
});

test('original event expiry has no grace and ledger retention does not refresh on retry', async t => {
  const { receiver, peer, event, clock } = await setup(t);
  event.expires_at = '2026-10-03T10:40:00.000Z';
  await receiver.consume(event, peer);
  const entry = Object.values((await receiver.snapshot()).ledger)[0];
  assert.equal(entry.keep_until, clock.instant + 86_400_000);
  clock.instant += 60_000;
  await receiver.consume(event, peer);
  assert.equal(Object.values((await receiver.snapshot()).ledger)[0].keep_until, entry.keep_until);
  clock.instant = Date.parse(event.expires_at);
  await assert.rejects(receiver.consume(event, peer), rejectCode('expired'));
  clock.instant = entry.keep_until;
  assert.equal(Object.keys((await receiver.snapshot()).ledger).length, 0);
  assert.equal(Object.keys((await receiver.snapshot()).groups).length, 0);
});

test('wrong or expired tokens, unknown clock and excessive credential lifetime fail closed', async t => {
  const { receiver, clock, credential, event, peer } = await setup(t);
  await assert.rejects(receiver.authenticate(randomBytes(32).toString('hex')), rejectCode('unauthorized'));
  await assert.rejects(receiver.configure({ ...credential, credentialExpiresAt: clock.instant + 31 * 86_400_000 }), rejectCode('invalid_request'));
  clock.isTrusted = false;
  await assert.rejects(receiver.consume(event, peer), rejectCode('clock_untrusted'));
  clock.isTrusted = true; clock.instant = Date.parse(credential.credentialExpiresAt);
  await assert.rejects(receiver.authenticate(credential.token), rejectCode('unauthorized'));
});

test('unknown properties, negative durations and all-empty complete groups are rejected', async t => {
  const { receiver, event, peer } = await setup(t);
  const invalid = clone(event); invalid.summary.apps[0].foreground_duration_ms = -1;
  await assert.rejects(receiver.consume(invalid, peer), rejectCode('invalid_event'));
  const unknown = clone(event); unknown.private_goals = 'not a protocol field';
  await assert.rejects(receiver.consume(unknown, peer), rejectCode('invalid_event'));
  const empty = clone(event); empty.summary.apps = [];
  await assert.rejects(receiver.consume(empty, peer), rejectCode('invalid_event'));
  assert.equal(Object.keys((await receiver.snapshot()).ledger).length, 0);
});

test('persisted receiver state has credential hashes rather than usable bearer tokens', async t => {
  const { token, statePath, receiver, peer, event } = await setup(t);
  await receiver.consume(event, peer);
  const disk = await readFile(statePath, 'utf8');
  assert.equal(disk.includes(token), false);
  assert.equal(disk.includes('Ignore consent'), false);
});

test('corrupt existing receiver storage is not recreated or accepted', async t => {
  const { statePath, receiver, peer, event, clock } = await setup(t);
  await receiver.consume(event, peer);
  await writeFile(statePath, '{"kind":"corrupt"}');
  const restarted = new Receiver({ store: new JsonStore(statePath, createReceiverState()), clock });
  await assert.rejects(restarted.authenticate('0'.repeat(64)), rejectCode('storage_unavailable'));
  assert.equal(await readFile(statePath, 'utf8'), '{"kind":"corrupt"}');
});

test('HTTP final receiver authenticates bounded JSON and returns durable valid receipts', async t => {
  const { receiver, event, token } = await setup(t);
  const running = await receiver.startServer();
  t.after(() => running.close());
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  const capabilities = await fetch(new URL('capabilities', running.baseUrl), { headers });
  assert.equal(capabilities.status, 200);
  assert.equal((await capabilities.json()).role, 'receiver');
  assert.equal(capabilities.headers.get('cache-control'), 'no-store');
  const send = body => fetch(new URL('events', running.baseUrl), { method: 'POST', headers, body });
  const accepted = await send(canonical(event));
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).disposition, 'accepted');
  assert.equal((await (await send(canonical(event))).json()).disposition, 'duplicate');
  const anonymous = await fetch(new URL('events', running.baseUrl), { method: 'POST', body: canonical(event) });
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json()).code, 'unauthorized');
  const malformed = await send('{"protocol_version":"0.1.0","protocol_version":"0.1.0"}');
  assert.ok([400, 422].includes(malformed.status));
  const oversized = await send(' '.repeat(16_385));
  assert.equal(oversized.status, 413);
  const wrongType = await fetch(new URL('events', running.baseUrl), { method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' }, body: canonical(event) });
  assert.equal(wrongType.status, 415);
  const remoteControl = await fetch(new URL('subscribe', running.baseUrl), { method: 'POST', headers, body: '{}' });
  assert.equal(remoteControl.status, 404);
  assert.equal(Object.keys((await receiver.snapshot()).ledger).length, 1);
});

test('simulator server refuses public binding and unsupported production shortcuts', async t => {
  const { receiver } = await setup(t);
  await assert.rejects(receiver.startServer({ host: '0.0.0.0' }), rejectCode('invalid_request'));
  await assert.rejects(receiver.startServer({ profile: 'direct-https-v1', tls: { rejectUnauthorized: false } }), rejectCode('unsupported_capability'));
});

test('receiver durable clock checkpoint blocks rollback after an actual state reload', async t => {
  const { receiver, event, peer, statePath, clock, token } = await setup(t);
  await receiver.consume(event, peer);
  const saved = JSON.parse(await readFile(statePath, 'utf8'));
  assert.equal(saved.last_clock, clock.now());
  clock.instant -= 60_000;
  const restarted = new Receiver({ store: new JsonStore(statePath, createReceiverState()), clock });
  await assert.rejects(restarted.authenticate(token), rejectCode('clock_untrusted'));
  assert.equal(JSON.parse(await readFile(statePath, 'utf8')).last_clock, saved.last_clock);
});

test('a missing receiver clock checkpoint cannot silently authorize populated state', async t => {
  const { statePath, clock, token } = await setup(t);
  const saved = JSON.parse(await readFile(statePath, 'utf8'));
  saved.last_clock = null;
  await writeFile(statePath, JSON.stringify(saved));
  const restarted = new Receiver({ store: new JsonStore(statePath, createReceiverState()), clock });
  await assert.rejects(restarted.authenticate(token), rejectCode('storage_unavailable'));
});

test('protected bearer rotation rejects old tokens and captured peers after restart while preserving duplicate-safe consumption', async t => {
  const { receiver, credential, token, peer, event, statePath, clock } = await setup(t);
  await receiver.consume(event, peer);
  const otherAuthorization = clone(credential.authorization);
  otherAuthorization.recipient_id = randomUUID(); otherAuthorization.stream_id = randomUUID(); otherAuthorization.subscription_id = randomUUID();
  const otherCredential = { ...credential, authorization: otherAuthorization, token: randomBytes(32).toString('hex') };
  await receiver.configure(otherCredential);
  const otherPeer = await receiver.authenticate(otherCredential.token);
  const rotated = { ...credential, token: randomBytes(32).toString('hex') };
  await receiver.configure(rotated);
  await assert.rejects(receiver.authenticate(token), rejectCode('unauthorized'));
  await assert.rejects(receiver.consume(event, peer), rejectCode('unauthorized'));
  assert.equal((await receiver.consume(event, await receiver.authenticate(rotated.token))).disposition, 'duplicate');
  const otherEvent = clone(event);
  for (const key of ['recipient_id', 'stream_id', 'subscription_id']) otherEvent[key] = otherAuthorization[key];
  otherEvent.event_id = randomUUID(); otherEvent.window.window_id = randomUUID();
  assert.equal((await receiver.consume(otherEvent, otherPeer)).disposition, 'accepted');
  const restarted = new Receiver({ store: new JsonStore(statePath, createReceiverState()), clock });
  await assert.rejects(restarted.authenticate(token), rejectCode('unauthorized'));
  assert.equal((await restarted.consume(event, await restarted.authenticate(rotated.token))).disposition, 'duplicate');
  assert.equal((await restarted.consume(otherEvent, await restarted.authenticate(otherCredential.token))).disposition, 'duplicate');
  const snapshot = await restarted.snapshot();
  assert.equal(Object.keys(snapshot.ledger).length, 2);
  assert.equal(Object.values(snapshot.groups).flatMap(group => Object.values(group.pages)).length, 2);
});

test('bearer rotation is isolated from another authenticated device using the same recipient identity', async t => {
  const { receiver, credential, event, peer } = await setup(t);
  const otherDevice = { ...credential, deviceBindingId: randomUUID(), token: randomBytes(32).toString('hex') };
  await receiver.configure(otherDevice);
  const otherPeer = await receiver.authenticate(otherDevice.token);
  await receiver.configure({ ...credential, token: randomBytes(32).toString('hex') });
  await assert.rejects(receiver.consume(event, peer), rejectCode('unauthorized'));
  assert.equal((await receiver.consume(event, otherPeer)).disposition, 'accepted');
  assert.equal((await receiver.authenticate(otherDevice.token)).device_binding_id, otherDevice.deviceBindingId);
});

test('protected scope narrowing rejects old token and old epoch without rewriting accepted history', async t => {
  const { receiver, credential, token, event, peer, clock } = await setup(t);
  await receiver.consume(event, peer);
  const narrowed = clone(credential);
  narrowed.token = randomBytes(32).toString('hex');
  narrowed.authorization.stream_id = randomUUID(); narrowed.authorization.subscription_id = randomUUID();
  narrowed.authorization.scope_revision += 1;
  narrowed.authorization.scope.applications = [narrowed.authorization.scope.applications[0]];
  await receiver.configure(narrowed);
  await assert.rejects(receiver.authenticate(token), rejectCode('unauthorized'));
  await assert.rejects(receiver.consume(event, peer), rejectCode('unauthorized'));
  const currentPeer = await receiver.authenticate(narrowed.token);
  await assert.rejects(receiver.consume(event, currentPeer), rejectCode('scope_mismatch'));
  clock.instant = Date.parse('2026-10-03T11:00:00.200Z');
  const future = clone(event);
  future.event_id = randomUUID(); future.window.window_id = randomUUID(); future.sequence = 1;
  for (const key of ['stream_id', 'subscription_id', 'scope_revision']) future[key] = narrowed.authorization[key];
  future.window.start = '2026-10-03T10:45:00.000Z'; future.window.end = '2026-10-03T11:00:00.000Z';
  future.emitted_at = '2026-10-03T11:00:00.100Z';
  future.summary.coverage.observed_intervals = [{ start: future.window.start, end: future.window.end }];
  future.summary.apps = [future.summary.apps[0]];
  assert.equal((await receiver.consume(future, await receiver.authenticate(narrowed.token))).disposition, 'accepted');
  const groups = Object.values((await receiver.snapshot()).groups);
  assert.equal(groups.length, 2);
  assert.equal(groups.find(group => group.metadata.stream_id === event.stream_id).pages['0'].apps.length, 2);
  assert.equal(groups.find(group => group.metadata.stream_id === future.stream_id).pages['0'].apps.length, 1);
});

test('same-token setup retains original issuance horizon instead of extending it on each setup', async t => {
  const { receiver, credential, store, clock } = await setup(t);
  const before = Object.values((await store.read()).credentials)[0];
  clock.instant += 300_000;
  await receiver.configure(credential);
  const after = Object.values((await store.read()).credentials)[0];
  assert.equal(after.issued_at, before.issued_at);
  assert.equal(after.credential_expires_at, before.credential_expires_at);
  await assert.rejects(receiver.configure({ ...credential, credentialExpiresAt: clock.instant + 30 * 86_400_000 }), rejectCode('unauthorized'));
  assert.equal(Object.values((await store.read()).credentials)[0].credential_expires_at, before.credential_expires_at);
});
