import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { createHash, X509Certificate } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { DirectAdapter, validateDestination, validateAddress, parseRetryAfter } from '../src/direct-adapter.mjs';
import { pairedDestinationFingerprint } from '../src/pairing.mjs';

const event = JSON.parse(await readFile(new URL('../examples/oap/0.1.0/valid/event-complete.json', import.meta.url), 'utf8'));
const capabilities = JSON.parse(await readFile(new URL('../examples/oap/0.1.0/valid/capabilities-receiver.json', import.meta.url), 'utf8'));
const now = Date.parse('2026-10-03T09:15:00.200Z');
const clock = { now: () => now, trusted: () => true };
const binding = { recipient_id: event.recipient_id, stream_id: event.stream_id, subscription_id: event.subscription_id,
  scope_revision: event.scope_revision, profile_id: 'direct-loopback-test-v1' };
const token = 'synthetic-test-only-not-personal-agent-credential-0001';
const credential = () => ({ ...binding, token, expires_at: '2026-10-04T09:15:00.000Z', endpoint: 'http://127.0.0.1:9876/' });
const receipt = () => ({ protocol_version: event.protocol_version, event_id: event.event_id, recipient_id: event.recipient_id,
  stream_id: event.stream_id, sequence: event.sequence, received_at: '2026-10-03T09:15:00.200Z', disposition: 'accepted', validation: 'valid' });
const jsonHeaders = { 'content-type': 'application/json', 'cache-control': 'no-store' };

test('too-short opaque bearer is rejected before discovery or activity request construction', async () => {
  let requests = 0;
  const client = new DirectAdapter({ clock, allowLoopbackTest: true,
    credentialProvider: { get: () => ({ ...credential(), token: 'a'.repeat(32) }) },
    transport: () => { requests++; throw new Error('must not construct a request'); } });
  await assert.rejects(client.getCapabilities(binding), { code: 'unauthorized' });
  await assert.rejects(client.deliver(event, binding), { code: 'unauthorized' });
  assert.equal(requests, 0);
});

// Public synthetic test key and self-signed certificate, generated solely for isolated TLS tests.
// This key provides no real receiver identity and must never be used outside the test server.
const testCertificate = `-----BEGIN CERTIFICATE-----
MIICzzCCAbegAwIBAgIJAOasdp+qdCgiMA0GCSqGSIb3DQEBCwUAMBQxEjAQBgNV
BAMTCTEyNy4wLjAuMTAeFw0yNjAxMDEwMDAwMDBaFw0zNjAxMDEwMDAwMDBaMBQx
EjAQBgNVBAMTCTEyNy4wLjAuMTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoC
ggEBAMo+t53c1aoRM8gu1uaZ/s4HPkiK70RNgA86eKhxJCB7fL0PEzkH7cezQBdi
2jy3xmxXWkDLr0sKA7/wOM8cnQ2LpUsdAsLCuG78FBjEigjeRq8Xmf56QgKpIlx8
9XQDl3wT+hlQMhjO7vHslt8DmBeEgkvrPqmxpMQ0SoFiJQ7YgMaKD9eFfPRYlAd9
uiwb3zQbu3aR8TvwBXp8/HwKXtTHBxfq2nXqnUR8GGE+l+6+e2ZgkzrMzHXVgok5
HI9lg94ajKYRIbMXiPM5oMtRLO5puRLE0yYF7Z6JallfsqIkF+i+wMDgwWd16/vI
DNn809u6yH6JIszKZxy5wAu1oF0CAwEAAaMkMCIwDwYDVR0RBAgwBocEfwAAATAP
BgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQC9qxhUlhMIkWQqozlV
Uj692sb6WDQdYmtdJCQnxg2cgXp4xGStoRuL5fMglzBQ9f6BKgDHPSUv8T/iRruY
y7TNEbt9nccyNh6WqV0d3KSh3ZH64JxsgiefgN6bXYMeoHqy3zDB31HetS5y3CLL
Ui27yspTckEycUWEjgDI4TkS94Dn9psE6fP22id03ukrxuBEAdY0Rv1HxtSOCO1S
kDnAZJO1xyZXxKDHmFKj9O91aU2wrsY4ufB7kRMUo2Zrl3F2z2gE2R9k+2TETI2B
SDMbEQgjTbWAoEs4a4lzSZwA6YHdn3JNeBPCyr9Ex+uugVLK0jJdbFxoHdR9IzFn
Y5em
-----END CERTIFICATE-----`;
const testPrivateKey = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDKPred3NWqETPI
Ltbmmf7OBz5Iiu9ETYAPOniocSQge3y9DxM5B+3Hs0AXYto8t8ZsV1pAy69LCgO/
8DjPHJ0Ni6VLHQLCwrhu/BQYxIoI3kavF5n+ekICqSJcfPV0A5d8E/oZUDIYzu7x
7JbfA5gXhIJL6z6psaTENEqBYiUO2IDGig/XhXz0WJQHfbosG980G7t2kfE78AV6
fPx8Cl7UxwcX6tp16p1EfBhhPpfuvntmYJM6zMx11YKJORyPZYPeGoymESGzF4jz
OaDLUSzuabkSxNMmBe2eiWpZX7KiJBfovsDA4MFndev7yAzZ/NPbush+iSLMymcc
ucALtaBdAgMBAAECggEBAKPm3/fXmHETL9vz2cVY198wj5FKx02bYUT2JgKcbqLE
cPrm1LVLb7B/3FkXi7XZWb1DrakFaTJvE0rh66gtkDoCChstj6c3FzEaqU7JOPSm
7rHHds19VzHA0FAUFPfIUWQE7JLHI1Jnoc395uclioTEprPQGiB8DwPTPO5OE6pK
6m2k2JqbTugiqmht/MKInOh+nrey5MRkFedfcgjhzryaNvJK9nblbbgE3ees3aEc
B0GLMgmlk1XUG1C/2rzc7l40vpH9/+cafjhY5THBuZqowKd1KakleHQQL5A5yS5y
JWl4/S/UqxiVtLTiPWJzjdP9+Y/+0Bd7WHgG4Lur5SECgYEA3sRmY421P1pC+1zH
JTLVfiw3gG1/9J6iDdz8AWrpzM8oCD8AkiX1RXqe4E2JWbWlMjOjfiJwHwJ+iA+h
7ypbQZdRAN8U4sDOLthMJyEmAXZP6stHu6csJ5Ag1ZgbnY3bZQV6iLRpAv2t5B2Q
916OrN+4Gle/RWZ+1xROeRSIJesCgYEA6GqQOliaBJf0ux/lLQ1M3Bvs/M7CfjfZ
WcW8FiJsEqCW15wshmKQaLqLGKDwo3Pu8fy0RgEml6XRSQlxVUgVRYAcbVIqPSXo
J7GMH3+kYuW3MRuKbZuyoKVKcr42lF1gs/0SIsxVX2of4i6x7NsX2oWmw9UAO+se
LX7qyqK/WNcCgYEAmZlKD/KxulD+RlseZSO72Reb3U2jIIQQsQZiLIgPVUyxCZ6H
Qj4x9AosafSMc/KvSQIaBOqx7G/H1wEQYtwNuBghnjwzJnZStDInsANHNVLin74y
Y81MwKq8OQp8YBJj6C/y4TekAI/xyowoXKgyMDjBtEg0diHJ63rw8MObbKkCgYEA
morRYJqtv0QzrYHl5/EiHHJNQUVSuo70bec3zBgTeMdjxfbI/Irpr1nrR/MsT+O1
DR+V177IJKpT4Zbvz19hFZe8T00FXSepmUtL+13qtwA8seC4SW3wdzWxrV6h+EGn
Hce3mX/5fLqafNHD6dU9pUadvzYRM8aBiIsOILPbPH0CgYBpNVepRT6TmsvgMHRj
ptDUSgTOsN86zMpgf4c+b4TuK8BGn1xlyaDgvcVp16XgGqWXfEdmJpBA8/vvkaXw
AMHVu4oWG/MFQRNrFvwG3vZ00rfox4zSyb8YcdWXlYmTQErCKoMfsdw5zJCtnA7T
TvH36aUNzsx0kkUz3NJOGN4/Nw==
-----END PRIVATE KEY-----`;

function fakeRequest({ status = 200, value = receipt(), headers = jsonHeaders, chunks, peer = '127.0.0.1', authorized = true,
  connect = true, respond = true, error, inspect, onSocket } = {}) {
  const calls = [];
  const transport = (url, options, callback) => {
    const req = new EventEmitter();
    req.destroyed = false;
    req.destroy = () => { req.destroyed = true; };
    req.end = body => {
      calls.push({ url, options, body });
      inspect?.(url, options, body);
      if (respond) setImmediate(() => {
        if (req.destroyed) return;
        const response = new PassThrough(); response.statusCode = status; response.headers = headers;
        callback(response);
        for (const chunk of chunks ?? [Buffer.from(JSON.stringify(value))]) response.write(chunk);
        response.end();
      });
    };
    setImmediate(() => {
      if (req.destroyed) return;
      if (error) return req.emit('error', error);
      const socket = new EventEmitter();
      socket.remoteAddress = peer; socket.authorized = authorized; socket.connecting = true;
      req.emit('socket', socket); onSocket?.();
      if (connect) { socket.connecting = false; socket.emit(url.protocol === 'https:' ? 'secureConnect' : 'connect'); }
    });
    return req;
  };
  return { transport, calls };
}

function adapter(overrides = {}) {
  return new DirectAdapter({ clock, credentialProvider: { get: async () => credential() }, allowLoopbackTest: true, ...overrides });
}

async function server(t, handler) {
  const instance = http.createServer(handler);
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { instance.closeAllConnections(); instance.close(resolve); }));
  return `http://127.0.0.1:${instance.address().port}/`;
}

test('canonical destination policy rejects downgrade, redirects-as-setup, aliases, credentials and ambiguous paths', () => {
  assert.equal(validateDestination('https://agent.example/oap/', 'direct-https-v1').pathname, '/oap/');
  for (const url of ['http://agent.example/', 'https://agent.example', 'https://u:p@agent.example/', 'https://agent.example/?token=x',
    'https://agent.example/#x', 'https://agent.example/a/../', 'https://agent.example/a%2f/', 'https://AGENT.example/',
    'https://agent.example:443/', 'https://agent.example/\\x/']) {
    assert.throws(() => validateDestination(url, 'direct-https-v1'), { code: 'destination_rejected' });
  }
  assert.throws(() => validateDestination('http://127.0.0.1/', 'direct-loopback-test-v1'), { code: 'destination_rejected' });
  for (const url of ['http://localhost/', 'http://127.1/', 'http://127.0.0.2/', 'http://[::ffff:127.0.0.1]/']) {
    assert.throws(() => validateDestination(url, 'direct-loopback-test-v1', true), { code: 'destination_rejected' });
  }
  assert.equal(validateDestination('http://[::1]:8080/', 'direct-loopback-test-v1', true).hostname, '[::1]');
});

test('public address policy rejects special-use IPv4, IPv6 and mapped equivalents', () => {
  for (const address of ['0.0.0.0', '10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1',
    '100.64.0.1', '192.0.2.1', '198.51.100.1', '203.0.113.1', '198.18.0.1', '224.0.0.1', '255.255.255.255',
    '::', '::1', 'fe80::1', 'fc00::1', 'ff02::1', '2001:db8::1', '3fff::1', '4000::1', '3000::1', '2001:1000::1',
    '64:ff9b:1::1', '100:0:0:1::1', '5f00::1', '::ffff:127.0.0.1', '::ffff:192.168.0.1', 'fe80::1%eth0']) {
    assert.throws(() => validateAddress(address, 'direct-https-v1'), { code: 'destination_rejected' }, address);
  }
  assert.equal(validateAddress('8.8.8.8', 'direct-https-v1').address, '8.8.8.8');
  assert.equal(validateAddress('2607:f8b0::1', 'direct-https-v1').family, 6);
  assert.equal(validateAddress('::ffff:8.8.8.8', 'direct-https-v1').address, '8.8.8.8');
});

test('local TLS address policy allows only exact paired addresses', () => {
  assert.equal(validateAddress('192.168.1.7', 'direct-local-tls-v1', ['192.168.1.7']).address, '192.168.1.7');
  assert.throws(() => validateAddress('192.168.1.8', 'direct-local-tls-v1', ['192.168.1.7']), { code: 'destination_rejected' });
  assert.throws(() => validateAddress('0.0.0.0', 'direct-local-tls-v1', ['0.0.0.0']), { code: 'destination_rejected' });
});

test('real isolated loopback receiver supports discovery and valid delivery with identity-bound bearer headers', async t => {
  const seen = [];
  const endpoint = await server(t, async (req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    assert.equal(req.headers.accept, 'application/json');
    assert.equal(req.headers['content-encoding'], undefined);
    let raw = ''; for await (const chunk of req) raw += chunk;
    seen.push({ method: req.method, path: req.url, value: raw ? JSON.parse(raw) : undefined });
    res.writeHead(200, jsonHeaders); res.end(JSON.stringify(req.url === '/capabilities' ? capabilities : receipt()));
  });
  const client = adapter({ credentialProvider: { get: async () => ({ ...credential(), endpoint }) } });
  assert.equal((await client.getCapabilities(binding)).role, 'receiver');
  assert.equal((await client.deliver(event, binding)).disposition, 'accepted');
  assert.deepEqual(seen.map(item => [item.method, item.path]), [['GET', '/capabilities'], ['POST', '/events']]);
  assert.deepEqual(seen[1].value, event);
});

test('every redirect is rejected without a second request', async t => {
  let requests = 0;
  const endpoint = await server(t, (_req, res) => { requests++; res.writeHead(307, { Location: '/events' }); res.end(); });
  const client = adapter({ credentialProvider: { get: async () => ({ ...credential(), endpoint }) } });
  await assert.rejects(client.deliver(event, binding), { code: 'destination_rejected', retryable: false });
  assert.equal(requests, 1);
});

test('unsupported protocol, expired credentials and wrong scope fail before request construction', async () => {
  const fake = fakeRequest();
  for (const change of [{ expires_at: '2026-10-03T09:15:00.000Z' }, { stream_id: '00000000-0000-4000-8000-000000000999' },
    { token: 'short' }, { expires_at: '2027-01-01T00:00:00.000Z' }, { endpoint: 'https://agent.example/', profile_id: 'unverified-mcp' }]) {
    const client = adapter({ transport: fake.transport, credentialProvider: { get: async () => ({ ...credential(), ...change }) } });
    await assert.rejects(client.deliver(event, binding));
  }
  assert.equal(fake.calls.length, 0);
});

test('all DNS results are vetted before connecting; no private mixed-answer fallback', async () => {
  const fake = fakeRequest({ peer: '8.8.8.8' });
  const cloudBinding = { ...binding, profile_id: 'direct-https-v1' };
  const client = adapter({ transport: fake.transport, credentialProvider: { get: async () => ({ ...credential(), ...cloudBinding,
    endpoint: 'https://agent.example/' }) }, resolver: async () => [{ address: '8.8.8.8' }, { address: '127.0.0.1' }] });
  await assert.rejects(client.deliver(event, cloudBinding), { code: 'destination_rejected' });
  assert.equal(fake.calls.length, 0);
});

test('connection lookup uses the validated answer and rejects an unexpected actual peer before headers or body', async () => {
  let lookups = 0;
  const fake = fakeRequest({ peer: '1.1.1.1' });
  const cloudBinding = { ...binding, profile_id: 'direct-https-v1' };
  const client = adapter({ transport: fake.transport, credentialProvider: { get: async () => ({ ...credential(), ...cloudBinding,
    endpoint: 'https://agent.example/' }) }, resolver: async () => { lookups++; return [{ address: '8.8.8.8', family: 4 }]; } });
  await assert.rejects(client.deliver(event, cloudBinding), { code: 'destination_rejected' });
  assert.equal(lookups, 1); assert.equal(fake.calls.length, 0);
  const approved = fakeRequest({ peer: '8.8.8.8', inspect: (_url, options) => {
    assert.equal(options.rejectUnauthorized, true); assert.equal(options.minVersion, 'TLSv1.2'); assert.equal(options.maxVersion, 'TLSv1.3');
    assert.equal(options.agent, false);
    options.lookup('agent.example', {}, (_error, address, family) => { assert.equal(address, '8.8.8.8'); assert.equal(family, 4); });
  } });
  const accepted = adapter({ transport: approved.transport, credentialProvider: client.credentialProvider, resolver: client.resolver });
  await accepted.deliver(event, cloudBinding);
  assert.equal(lookups, 2); assert.equal(approved.calls.length, 1);
});

test('failed TLS peer authorization or certificate validation is permanent and cannot write a request', async () => {
  const cloudBinding = { ...binding, profile_id: 'direct-https-v1' };
  for (const scenario of [{ peer: '8.8.8.8', authorized: false }, { error: Object.assign(new Error('sensitive upstream detail'),
    { code: 'CERT_HAS_EXPIRED' }) }]) {
    const fake = fakeRequest(scenario);
    const client = adapter({ transport: fake.transport, credentialProvider: { get: async () => ({ ...credential(), ...cloudBinding,
      endpoint: 'https://agent.example/' }) }, resolver: async () => [{ address: '8.8.8.8', family: 4 }] });
    const failure = await client.deliver(event, cloudBinding).catch(value => value);
    assert.equal(failure.code, 'destination_rejected'); assert.equal(failure.retryable, false);
    assert.equal(failure.message.includes('sensitive'), false); assert.equal(fake.calls.length, 0);
  }
});

test('local TLS requires paired trust and passes hostname checks before evaluating key pins', async () => {
  const localBinding = { ...binding, profile_id: 'direct-local-tls-v1' };
  const fake = fakeRequest({ peer: '192.168.1.7' });
  const provider = { get: async () => ({ ...credential(), ...localBinding, endpoint: 'https://192.168.1.7/',
    allowedAddresses: ['192.168.1.7'] }) };
  await assert.rejects(adapter({ transport: fake.transport, credentialProvider: provider }).deliver(event, localBinding),
    { code: 'destination_rejected' });
  let identityChecked = false;
  const trusted = fakeRequest({ peer: '192.168.1.7', inspect: (_url, options) => {
    assert.equal(options.ca, 'synthetic-test-anchor'); assert.equal(options.rejectUnauthorized, true);
    const badIdentity = options.checkServerIdentity('', { subject: { CN: 'wrong.example' }, subjectaltname: 'DNS:wrong.example' });
    assert.equal(badIdentity.code, 'ERR_TLS_CERT_ALTNAME_INVALID'); identityChecked = true;
  } });
  await adapter({ transport: trusted.transport, credentialProvider: { get: async () => ({ ...await provider.get(),
    tls: { ca: 'synthetic-test-anchor' } }) } }).deliver(event, localBinding);
  assert.equal(identityChecked, true);
});

test('real local TLS verifies the paired CA, certificate hostname and peer key before writing activity', async t => {
  let requests = 0;
  const instance = https.createServer({ cert: testCertificate, key: testPrivateKey, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.3' },
    async (req, res) => {
      requests++;
      assert.ok(['TLSv1.2', 'TLSv1.3'].includes(req.socket.getProtocol()));
      assert.equal(req.headers.authorization, `Bearer ${token}`);
      for await (const _chunk of req) { /* bounded fixture body is consumed by this test receiver */ }
      res.writeHead(200, jsonHeaders); res.end(JSON.stringify(receipt()));
    });
  instance.on('tlsClientError', () => {});
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { instance.closeAllConnections(); instance.close(resolve); }));
  const port = instance.address().port;
  const key = new X509Certificate(testCertificate).publicKey.export({ type: 'spki', format: 'der' });
  const pin = createHash('sha256').update(key).digest('base64');
  const localBinding = { ...binding, profile_id: 'direct-local-tls-v1' };
  const base = { ...credential(), ...localBinding, endpoint: `https://127.0.0.1:${port}/`, allowedAddresses: ['127.0.0.1'] };
  const client = tlsOptions => adapter({ credentialProvider: { get: async () => ({ ...base, tls: tlsOptions }) } });
  assert.equal((await client({ ca: testCertificate, peerKeySha256: pin }).deliver(event, localBinding)).validation, 'valid');
  await assert.rejects(client({ peerKeySha256: pin }).deliver(event, localBinding), { code: 'destination_rejected' });
  await assert.rejects(client({ ca: testCertificate, peerKeySha256: Buffer.alloc(32, 7).toString('base64') }).deliver(event, localBinding),
    { code: 'destination_rejected' });
  const wrongName = adapter({ credentialProvider: { get: async () => ({ ...base, endpoint: `https://localhost:${port}/`,
    tls: { ca: testCertificate, peerKeySha256: pin } }) }, resolver: async () => [{ address: '127.0.0.1', family: 4 }] });
  await assert.rejects(wrongName.deliver(event, localBinding), { code: 'destination_rejected' });
  assert.equal(requests, 1, 'failed peer checks cannot expose authorization headers or activity bodies');
});

test('consent is fenced after asynchronous preparation and again immediately before socket writes', async () => {
  let permitted = true;
  const fake = fakeRequest({ onSocket: () => { permitted = false; } });
  await assert.rejects(adapter({ transport: fake.transport }).deliver(event, binding, { beforeSend: () => permitted }),
    { code: 'consent_inactive' });
  assert.equal(fake.calls.length, 0);
  await assert.rejects(adapter({ transport: fake.transport, credentialProvider: { get: async () => {
    permitted = false; return credential();
  } } }).deliver(event, binding, { beforeSend: () => permitted }), { code: 'consent_inactive' });
  assert.equal(fake.calls.length, 0);
});

test('AbortSignal cancels preparation, connections and pending response reads', async () => {
  const aborted = new AbortController(); aborted.abort();
  const fake = fakeRequest({ respond: false });
  await assert.rejects(adapter({ transport: fake.transport }).deliver(event, binding, { signal: aborted.signal }),
    { code: 'consent_inactive' });
  const inFlight = new AbortController();
  const pending = adapter({ transport: fake.transport }).deliver(event, binding, { signal: inFlight.signal });
  setTimeout(() => inFlight.abort(), 20);
  await assert.rejects(pending, { code: 'consent_inactive' });
  assert.equal(fake.calls.length, 1);
});

test('asynchronous fences are rejected instead of being awaited beyond dispatch checks', async () => {
  const fake = fakeRequest();
  await assert.rejects(adapter({ transport: fake.transport }).deliver(event, binding, { beforeSend: async () => true }),
    { code: 'invalid_request' });
  assert.equal(fake.calls.length, 0);
});

test('missing, generic, malformed, mismatched or encoded receipts do not establish consumption', async () => {
  for (const scenario of [{ status: 202 }, { status: 204 }, { chunks: [Buffer.from('{')] }, { value: { ...receipt(), sequence: 2 } },
    { value: { ...receipt(), disposition: 'rejected' } }, { headers: { ...jsonHeaders, 'content-type': 'text/plain' } },
    { headers: { ...jsonHeaders, 'content-encoding': 'gzip' } }, { headers: { 'content-type': 'application/json' } }]) {
    const fake = fakeRequest(scenario);
    await assert.rejects(adapter({ transport: fake.transport }).deliver(event, binding), { code: 'temporary_unavailable' });
    assert.equal(fake.calls.length, 1);
  }
});

test('response streams and declared body sizes stop at bounded receipt capacity', async () => {
  for (const scenario of [{ chunks: [Buffer.alloc(4097, 32)] }, { headers: { ...jsonHeaders, 'content-length': '999999999' } }]) {
    const fake = fakeRequest(scenario);
    await assert.rejects(adapter({ transport: fake.transport }).deliver(event, binding), { code: 'temporary_unavailable' });
    assert.equal(fake.calls.length, 1);
  }
});

test('permanent HTTP status takes precedence over optimistic or oversized error bodies', async () => {
  for (const [status, code] of [[400, 'invalid_event'], [401, 'unauthorized'], [403, 'unauthorized'], [404, 'endpoint_unsupported'],
    [409, 'conflicting_duplicate'], [410, 'endpoint_unsupported'], [413, 'payload_too_large'], [415, 'media_type_unsupported']]) {
    const fake = fakeRequest({ status, value: { protocol_version: '0.1.0', code: 'temporary_unavailable', message: token,
      retryable: true, retry_after_ms: 1 } });
    const failure = await adapter({ transport: fake.transport }).deliver(event, binding).catch(value => value);
    assert.equal(failure.code, code); assert.equal(failure.retryable, false); assert.equal(failure.message.includes(token), false);
  }
  const oversized = fakeRequest({ status: 401, chunks: [Buffer.alloc(4097)] });
  await assert.rejects(adapter({ transport: oversized.transport }).deliver(event, binding), { code: 'unauthorized' });
});

test('Retry-After preserves long backpressure and malformed hints do not reset a cycle', async () => {
  assert.equal(parseRetryAfter('7200', now), 7200000);
  assert.equal(parseRetryAfter('Sat, 03 Oct 2026 10:15:00 GMT', now), 3599800);
  assert.equal(parseRetryAfter('Saturday, 03-Oct-26 10:15:00 GMT', now), 3599800);
  assert.equal(parseRetryAfter('Sat Oct  3 10:15:00 2026', now), 3599800);
  assert.equal(parseRetryAfter('Fri, 02 Oct 2026 00:00:00 GMT', now), 0);
  for (const invalid of ['-1', '1.2', 'tomorrow', '9999999999999999999999999', '', 'Mon, 03 Oct 2026 10:15:00 GMT',
    'Sat, 31 Feb 2026 10:15:00 GMT', 'Sat, 03 Oct 2026 25:15:00 GMT']) assert.equal(parseRetryAfter(invalid, now), undefined);
  const fake = fakeRequest({ status: 429, headers: { ...jsonHeaders, 'retry-after': '7200' }, value: {
    protocol_version: '0.1.0', code: 'rate_limited', message: 'Capacity unavailable.', retryable: true, retry_after_ms: 1000 } });
  const failure = await adapter({ transport: fake.transport }).deliver(event, binding).catch(value => value);
  assert.equal(failure.code, 'rate_limited'); assert.equal(failure.retryable, true); assert.equal(failure.retryAfterMs, 7200000);
  assert.equal(fake.calls.length, 1);
});

test('connection, total-response and resolver waits are bounded without library retries', async () => {
  for (const scenario of [{ connect: false }, { respond: false }]) {
    const fake = fakeRequest(scenario);
    await assert.rejects(adapter({ transport: fake.transport, connectTimeoutMs: 20, totalTimeoutMs: 30 }).deliver(event, binding),
      { code: 'temporary_unavailable' });
    assert.ok(fake.calls.length <= 1);
  }
  const cloudBinding = { ...binding, profile_id: 'direct-https-v1' };
  await assert.rejects(adapter({ connectTimeoutMs: 20, totalTimeoutMs: 30, credentialProvider: { get: async () => ({
    ...credential(), ...cloudBinding, endpoint: 'https://agent.example/' }) }, resolver: async () => new Promise(() => {}) })
    .deliver(event, cloudBinding), { code: 'temporary_unavailable' });
});

test('event size and expiry are checked before request construction', async () => {
  const fake = fakeRequest();
  await assert.rejects(adapter({ transport: fake.transport }).deliver(event, { ...binding, max_event_bytes: 100 }),
    { code: 'payload_too_large' });
  await assert.rejects(adapter({ transport: fake.transport, clock: { now: () => Date.parse(event.expires_at), trusted: () => true } })
    .deliver(event, binding), { code: 'expired' });
  assert.equal(fake.calls.length, 0);
});

test('discovery rejects wrong roles or unsupported versions/profile without inventing an endpoint fallback', async () => {
  for (const change of [{ role: 'publisher' }, { supported_versions: ['0.2.0'] }, { delivery_profiles: ['direct-https-v1'] }]) {
    const fake = fakeRequest({ value: { ...capabilities, ...change } });
    await assert.rejects(adapter({ transport: fake.transport }).getCapabilities(binding));
    assert.equal(fake.calls.length, 1); assert.equal(fake.calls[0].url.pathname, '/capabilities');
  }
});

test('paired descriptor fingerprint is token-free and normalizes exact addresses and public trust representations', () => {
  const local = { ...credential(), profile_id: 'direct-local-tls-v1', endpoint: 'https://local.agent.example/',
    allowedAddresses: ['192.168.1.7', '::1'], tls: { ca: [testCertificate, 'synthetic-additional-anchor'],
      peerKeySha256: Buffer.alloc(32, 1).toString('base64') } };
  const fingerprint = pairedDestinationFingerprint(local);
  assert.match(fingerprint, /^[a-f0-9]{64}$/u);
  assert.equal(pairedDestinationFingerprint({ ...local, token: 'different-renewed-token', expires_at: '2026-10-05T09:00:00.000Z',
    stream_id: 'new-admitted-epoch', scope_revision: 2 }), fingerprint);
  assert.equal(pairedDestinationFingerprint({ ...local, allowedAddresses: ['::1', '::ffff:192.168.1.7', '192.168.1.7'],
    tls: { ...local.tls, ca: ['synthetic-additional-anchor', Buffer.from(testCertificate.replace(/\n/gu, '\r\n'))] } }), fingerprint);
  for (const change of [{ endpoint: 'https://other.agent.example/' }, { allowedAddresses: ['192.168.1.8'] },
    { tls: { ...local.tls, ca: 'different-trust-anchor' } }, { tls: { ...local.tls, peerKeySha256: Buffer.alloc(32, 2).toString('base64') } }]) {
    assert.notEqual(pairedDestinationFingerprint({ ...local, ...change }), fingerprint);
  }
  assert.equal(pairedDestinationFingerprint({ profile_id: 'direct-loopback-test-v1' }), null);
  assert.throws(() => pairedDestinationFingerprint({ profile_id: 'direct-https-v1' }), { code: 'destination_rejected' });
  assert.throws(() => pairedDestinationFingerprint({ ...local, tls: { ...local.tls, key: 'not-a-supported-public-trust-field' } }),
    { code: 'destination_rejected' });
});

test('same-object endpoint or trust mutation during asynchronous DNS cannot construct a request', async () => {
  for (const localTls of [false, true]) {
    const selectedBinding = { ...binding, profile_id: localTls ? 'direct-local-tls-v1' : 'direct-https-v1' };
    const selectedCredential = { ...credential(), ...selectedBinding, endpoint: localTls ? 'https://local.agent.example/' : 'https://agent.example/',
      ...(localTls ? { allowedAddresses: ['192.168.1.7'], tls: { ca: testCertificate,
        peerKeySha256: Buffer.alloc(32, 1).toString('base64') } } : {}) };
    let constructed = 0;
    const fake = fakeRequest({ peer: localTls ? '192.168.1.7' : '8.8.8.8' });
    const client = adapter({ credentialProvider: { get: async () => selectedCredential },
      transport: (...args) => { constructed++; return fake.transport(...args); }, resolver: async () => {
        await Promise.resolve();
        if (localTls) selectedCredential.tls.peerKeySha256 = Buffer.alloc(32, 2).toString('base64');
        else selectedCredential.endpoint = 'https://other.agent.example/';
        return [{ address: localTls ? '192.168.1.7' : '8.8.8.8', family: 4 }];
      } });
    await assert.rejects(client.deliver(event, selectedBinding), { code: 'destination_rejected' });
    assert.equal(constructed, 0); assert.equal(fake.calls.length, 0);
  }
});

test('paired endpoint, address and trust changes after connection preparation cannot expose headers or activity', async () => {
  for (const mutate of [c => { c.endpoint = 'https://other.agent.example/'; }, c => { c.allowedAddresses = ['192.168.1.8']; },
    c => { c.tls.peerKeySha256 = Buffer.alloc(32, 2).toString('base64'); }, c => { c.tls.ca = 'different-test-anchor'; }]) {
    const selectedBinding = { ...binding, profile_id: 'direct-local-tls-v1' };
    const selectedCredential = { ...credential(), ...selectedBinding, endpoint: 'https://local.agent.example/',
      allowedAddresses: ['192.168.1.7'], tls: { ca: testCertificate, peerKeySha256: Buffer.alloc(32, 1).toString('base64') } };
    const fake = fakeRequest({ peer: '192.168.1.7', onSocket: () => mutate(selectedCredential) });
    const client = adapter({ credentialProvider: { get: async () => selectedCredential }, transport: fake.transport,
      resolver: async () => [{ address: '192.168.1.7', family: 4 }] });
    await assert.rejects(client.deliver(event, selectedBinding), { code: 'destination_rejected' });
    assert.equal(fake.calls.length, 0);
  }
});

test('token and expiry renewal with unchanged paired metadata remains allowed after asynchronous discovery', async () => {
  const selectedBinding = { ...binding, profile_id: 'direct-https-v1' };
  const selectedCredential = { ...credential(), ...selectedBinding, endpoint: 'https://agent.example/' };
  const renewed = 'synthetic-renewed-only-not-personal-agent-credential-0002';
  const fake = fakeRequest({ peer: '8.8.8.8', inspect: (_url, options) => assert.equal(options.headers.Authorization, `Bearer ${renewed}`) });
  const client = adapter({ credentialProvider: { get: async () => selectedCredential }, transport: fake.transport,
    resolver: async () => {
      selectedCredential.token = renewed; selectedCredential.expires_at = '2026-10-05T09:15:00.000Z';
      return [{ address: '8.8.8.8', family: 4 }];
    } });
  assert.equal((await client.deliver(event, selectedBinding)).validation, 'valid'); assert.equal(fake.calls.length, 1);
});

test('an opaque bearer shortened during asynchronous DNS is rejected before request construction', async () => {
  const selectedBinding = { ...binding, profile_id: 'direct-https-v1' };
  const selectedCredential = { ...credential(), ...selectedBinding, endpoint: 'https://agent.example/' };
  let constructed = 0;
  const client = adapter({ credentialProvider: { get: async () => selectedCredential },
    transport: () => { constructed++; throw new Error('must not construct a request'); },
    resolver: async () => { selectedCredential.token = 'a'.repeat(32); return [{ address: '8.8.8.8', family: 4 }]; } });
  await assert.rejects(client.deliver(event, selectedBinding), { code: 'unauthorized' });
  assert.equal(constructed, 0);
});
