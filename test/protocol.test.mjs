// Exercise the shipped runtime validator against independently specified fixtures.
// The Phase 3 artifact checker is deliberately not imported or reused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseJson, validateEvent, canonical, digest, OapError } from '../src/protocol.mjs';
import { validateControlRecord } from '../src/control-records.mjs';

const BASE = new URL('../examples/oap/0.1.0/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('example-manifest.json', BASE), 'utf8'));
const EVENT_SCHEMA = 'activity-summary.schema.json';

test('generated error retryability follows the catalogue despite caller flags', () => {
  const permanent = new OapError('unauthorized', undefined, { retryable: true, retryAfterMs: 3000 });
  assert.equal(permanent.retryable, false);
  assert.equal(Object.hasOwn(permanent.toJSON(), 'retry_after_ms'), false);
  validateControlRecord('error', permanent.toJSON());
  const temporary = new OapError('temporary_unavailable', undefined, { retryable: false });
  assert.equal(temporary.retryable, true);
  validateControlRecord('error', temporary.toJSON());
});

// Local authority cannot be established by a standalone receiver event validator.
// Separate publisher lifecycle tests exercise the device-local pause fence.
export const RUNTIME_FIXTURE_EXCLUSIONS = {
  'invalid-event-consent-paused': 'S12: receiver authorization cannot observe device-local pause, permission or collection authority.'
};

const maxBytesFor = schema => ['batch.schema.json', 'local-grant.schema.json', 'subscription.schema.json'].includes(schema)
  ? 65536 : ['receipt.schema.json', 'error.schema.json'].includes(schema) ? 4096 : 16384;
const readJson = async file => parseJson(await readFile(new URL(file, BASE)), 65536);
const identity = application => `${application.namespace}\0${application.id}`;

async function receiverContext(context) {
  if (!context) return {};
  const grant = await readJson(context.grant), sub = await readJson(context.subscription);
  validateControlRecord('local-grant', grant);
  validateControlRecord('subscription', sub);
  // Materialize the admitted intersection supplied by setup. No local consent
  // state, approval timestamp, OS permission or device user identity is invented.
  const grantedApps = new Set(grant.scope.applications.map(identity));
  const scope = {
    ...sub.scope,
    applications: sub.scope.applications.filter(app => grantedApps.has(identity(app))),
    allowed_fields: sub.scope.allowed_fields.filter(field => grant.scope.allowed_fields.includes(field)),
    event_names: sub.scope.event_names.filter(name => grant.scope.event_names.includes(name)),
    history_max_age_ms: Math.min(grant.scope.history_max_age_ms, sub.scope.history_max_age_ms),
    history_max_bytes: Math.min(grant.scope.history_max_bytes, sub.scope.history_max_bytes)
  };
  if (scope.extension_keys) scope.extension_keys = scope.extension_keys.filter(key => (grant.scope.extension_keys ?? []).includes(key));
  return {
    now: Date.parse(context.now),
    authorization: {
      recipient_id: grant.recipient_id, stream_id: sub.stream_id,
      subscription_id: sub.subscription_id, scope_revision: sub.scope_revision,
      expires_at: new Date(Math.min(Date.parse(grant.expires_at), Date.parse(sub.expires_at))).toISOString(), scope
    }
  };
}

const expectedEventCode = fixture => {
  if (fixture.id === 'invalid-event-unsupported-version-json') return 'incompatible_version';
  if (fixture.expected_rule === 'S11' || fixture.expected_rule === 'S17') return 'scope_mismatch';
  if (fixture.expected_rule === 'S15') return 'expired';
  if (fixture.id === 'invalid-event-oversize-json') return 'payload_too_large';
  return 'invalid_event';
};

for (const fixture of manifest.fixtures) {
  const excluded = RUNTIME_FIXTURE_EXCLUSIONS[fixture.id];
  if (excluded) {
    test(`runtime fixture excluded: ${fixture.id}`, { skip: excluded }, () => {});
    continue;
  }
  const event = fixture.schema === EVENT_SCHEMA;
  const level = event ? 'event predicates' : 'control record predicates';
  test(`runtime fixture ${level}: ${fixture.id}`, async () => {
    const source = await readFile(new URL(fixture.file, BASE));
    const options = event ? await receiverContext(fixture.context) : undefined;
    const validate = () => {
      const value = parseJson(source, maxBytesFor(fixture.schema));
      if (event) return validateEvent(value, options);
      return validateControlRecord(fixture.schema, value);
    };
    if (fixture.valid) assert.doesNotThrow(validate, `${fixture.id}: declared valid at ${level}`);
    else assert.throws(validate, error => error instanceof OapError && error.code === (event ? expectedEventCode(fixture) : 'invalid_request'),
      `${fixture.id}: declared rejection for ${fixture.expected_rule}`);
  });
}

test('raw representation rejects invalid UTF-8 rather than replacing source bytes', () => {
  const raw = Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xc0, 0xaf, 0x22, 0x7d]);
  assert.throws(() => parseJson(raw), error => error.code === 'invalid_event');
});

test('raw representation rejects nested and escape-equivalent duplicate names', () => {
  for (const raw of ['{"outer":[{"x":1,"x":2}]}', '{"a":1,"\\u0061":2}']) {
    assert.throws(() => parseJson(raw), error => error.code === 'invalid_event');
  }
});

test('raw representation rejects negative zero and escaped lone Unicode surrogates', () => {
  for (const raw of ['{"a":-0}', '{"a":"\\ud800"}', '{"a":"\\udc00"}']) {
    assert.throws(() => parseJson(raw), error => error.code === 'invalid_event');
  }
});

test('string input cannot conceal an actual lone surrogate through UTF-8 replacement', () => {
  const raw = `{"label":"${String.fromCharCode(0xd800)}"}`;
  assert.throws(() => parseJson(raw), error => error.code === 'invalid_event');
});

test('raw representation rejects a UTF-8 BOM and admits valid paired Unicode', () => {
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{}')]);
  assert.throws(() => parseJson(bom), error => error.code === 'invalid_event');
  assert.deepEqual(parseJson('{"label":"💡"}'), { label: '💡' });
});

test('representation bounds count UTF-8 bytes at the exact admission boundary', () => {
  const raw = '{"label":"💡"}';
  const length = Buffer.byteLength(raw, 'utf8');
  assert.deepEqual(parseJson(raw, length), { label: '💡' });
  assert.throws(() => parseJson(raw, length - 1), error => error.code === 'payload_too_large');
});

test('canonical event digests preserve identity across object key order but detect changed activity', async () => {
  const event = await readJson('valid/event-complete.json');
  const reordered = Object.fromEntries(Object.entries(event).reverse());
  reordered.summary = Object.fromEntries(Object.entries(event.summary).reverse());
  assert.equal(canonical(reordered), canonical(event));
  assert.equal(digest(reordered), digest(event));
  const changed = structuredClone(event);
  changed.summary.apps[0].foreground_duration_ms += 1;
  assert.notEqual(digest(changed), digest(event));
  assert.notEqual(digest({ values: ['a', 'b'] }), digest({ values: ['b', 'a'] }));
});

test('receiver time admits exactly five minutes of future emission and no expiration grace', async () => {
  const event = await readJson('valid/event-complete.json');
  const emitted = Date.parse(event.emitted_at), expires = Date.parse(event.expires_at);
  assert.doesNotThrow(() => validateEvent(event, { now: emitted - 300000 }));
  assert.throws(() => validateEvent(event, { now: emitted - 300001 }), error => error.code === 'invalid_event');
  assert.doesNotThrow(() => validateEvent(event, { now: expires - 1 }));
  assert.throws(() => validateEvent(event, { now: expires }), error => error.code === 'expired');
});
