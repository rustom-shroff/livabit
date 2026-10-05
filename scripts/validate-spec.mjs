// Contract artifact checker only. No publisher, receiver, network or model calls.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaDir = path.join(root, 'schemas/oap/0.1.0');
const exampleDir = path.join(root, 'examples/oap/0.1.0');
const base = 'https://example.invalid/oap/0.1.0/'; // Resolution identity; never fetched.
const failures = [];
const outcomes = [];
const digests = {};
const fail = message => failures.push(message);
const hash = value => createHash('sha256').update(value).digest('hex');
const orderedKey = a => `${a.namespace}\0${a.id}`;
const same = (a, b) => canonical(a) === canonical(b);
const instant = s => Date.parse(s);
const canonical = value => Array.isArray(value)
  ? `[${value.map(canonical).join(',')}]`
  : value !== null && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`
    : JSON.stringify(value);

// JSON.parse first establishes syntax. This second walk preserves member names,
// including escape-equivalent keys that an ordinary parse would overwrite.
function duplicateKeys(raw) {
  let i = 0;
  const ws = () => { while (/\s/.test(raw[i] ?? '') && i < raw.length) i++; };
  const string = () => {
    const start = i++;
    while (i < raw.length) {
      if (raw[i] === '\\') { i += 2; continue; }
      if (raw[i++] === '"') break;
    }
    return JSON.parse(raw.slice(start, i));
  };
  const visit = () => {
    ws();
    if (raw[i] === '{') {
      i++; ws(); const keys = new Set();
      if (raw[i] === '}') { i++; return; }
      while (true) {
        ws(); const key = string();
        if (keys.has(key)) throw new Error('duplicate member');
        keys.add(key); ws(); i++; visit(); ws();
        if (raw[i++] === '}') return;
      }
    }
    if (raw[i] === '[') {
      i++; ws(); if (raw[i] === ']') { i++; return; }
      while (true) { visit(); ws(); if (raw[i++] === ']') return; }
    }
    if (raw[i] === '"') { string(); return; }
    while (i < raw.length && !/[\s,}\]]/.test(raw[i])) i++;
  };
  visit();
}

function representation(raw, maxBytes) {
  const problems = [];
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) problems.push('S10');
  let value;
  try {
    if (raw.charCodeAt(0) === 0xfeff) throw new Error('BOM');
    value = JSON.parse(raw);
    duplicateKeys(raw);
  } catch { return { value, problems: [...problems, 'S10'] }; }
  const inspect = v => {
    if (typeof v === 'number' && (!Number.isSafeInteger(v) || Object.is(v, -0))) problems.push('S10');
    if (typeof v === 'string' && /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v)) problems.push('S10');
    if (Array.isArray(v)) v.forEach(inspect);
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { inspect(k); inspect(x); });
  };
  inspect(value);
  if (Buffer.byteLength(canonical(value), 'utf8') > maxBytes) problems.push('S10');
  return { value, problems: [...new Set(problems)] };
}

function semantics(value, schema) {
  const errors = new Set();
  const check = (condition, rule) => { if (!condition) errors.add(rule); };
  const timeFields = new Set(['start', 'end', 'emitted_at', 'expires_at', 'created_at', 'approved_at', 'received_at', 'grant_expires_at', 'last_receipt_at', 'last_valid_consumption_at']);
  const times = (v, key = '') => {
    if (typeof v === 'string' && timeFields.has(key)) {
      const d = new Date(v);
      check(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(d.getTime()) && d.toISOString() === v, 'S01');
    } else if (Array.isArray(v)) v.forEach(x => times(x));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => times(x, k));
  };
  times(value);
  const roster = (apps, rule) => {
    const keys = apps.map(orderedKey);
    check(keys.every((key, i) => i === 0 || key > keys[i - 1]), rule);
  };
  if (schema === 'activity-summary.schema.json') {
    const s = value.summary, w = value.window, c = s.coverage;
    const start = instant(w.start), end = instant(w.end), emitted = instant(value.emitted_at), expiry = instant(value.expires_at);
    const duration = end - start;
    check(duration >= 900000 && duration <= 3600000 && duration % 900000 === 0 && duration === s.aggregation_interval_ms, 'S02');
    check(emitted >= end, 'S03');
    check(expiry > emitted && expiry <= start + 86400000, 'S04');
    let covered = 0, previousEnd = -Infinity;
    for (const interval of c.observed_intervals) {
      const a = instant(interval.start), b = instant(interval.end);
      check(a >= start && b <= end && b > a && a > previousEnd, 'S05');
      covered += b - a; previousEnd = b;
    }
    if (c.status === 'complete') check(c.observed_intervals.length === 1 && c.observed_intervals[0].start === w.start && c.observed_intervals[0].end === w.end && c.reasons.length === 0, 'S05');
    else check(covered > 0 && covered < duration && c.reasons.length > 0, 'S05');
    check(s.apps.every(a => a.foreground_duration_ms > 0 && a.foreground_duration_ms <= covered), 'S06');
    roster(s.apps.map(a => a.application), 'S07');
    check(s.page_index < s.page_count && duration >= 900000 * s.page_count, 'S08');
  }
  if (schema === 'local-grant.schema.json' || schema === 'subscription.schema.json') {
    const s = value.scope;
    check(instant(value.created_at) < instant(value.expires_at), 'S19');
    if (value.approved_at) check(instant(value.created_at) <= instant(value.approved_at) && instant(value.approved_at) < instant(value.expires_at), 'S19');
    roster(s.applications, 'S19');
    check(s.aggregation_interval_ms >= 900000 * Math.ceil(s.applications.length / 32) && s.history_max_age_ms > s.aggregation_interval_ms, 'S19');
  }
  if (schema === 'batch.schema.json') {
    let previousSequence = 0, previousGap = 0;
    check(new Set(value.events.map(e => e.event_id)).size === value.events.length, 'S20');
    for (const event of value.events) {
      semantics(event, 'activity-summary.schema.json').forEach(x => errors.add(x));
      check(event.recipient_id === value.recipient_id && event.stream_id === value.stream_id && event.scope_revision === value.scope_revision && event.sequence > previousSequence, 'S20');
      previousSequence = event.sequence;
    }
    for (const gap of value.gaps) {
      check(gap.from_sequence <= gap.to_sequence && gap.from_sequence > previousGap && !value.events.some(e => e.sequence >= gap.from_sequence && e.sequence <= gap.to_sequence), 'S20');
      if (previousGap > 0) check(gap.from_sequence > previousGap + 1 || gap.reason !== value.gaps[value.gaps.indexOf(gap) - 1].reason, 'S20');
      previousGap = gap.to_sequence;
    }
    check(value.has_more === Object.hasOwn(value, 'next_cursor'), 'S20');
  }
  if (schema === 'error.schema.json') check(value.retryable === ['temporary_unavailable', 'rate_limited', 'storage_unavailable'].includes(value.code), 'S21');
  if (schema === 'status.schema.json') {
    check(value.retention.retained_bytes <= value.retention.max_bytes && value.retention.queued_events <= value.retention.retained_bytes, 'S22');
    check(value.consent_state === 'unknown' || Object.hasOwn(value, 'grant_expires_at'), 'S22');
  }
  return [...errors];
}

async function fixtureContext(event, context) {
  if (!context) return [];
  const problems = new Set();
  const add = (ok, rule) => { if (!ok) problems.add(rule); };
  const localJson = async file => JSON.parse(await readFile(path.join(exampleDir, file), 'utf8'));
  const grant = context.grant ? await localJson(context.grant) : null;
  const sub = context.subscription ? await localJson(context.subscription) : null;
  const now = instant(context.now);
  if (grant && sub) {
    add(grant.state === 'active' && sub.state === 'active' && now >= instant(grant.approved_at) && now < instant(grant.expires_at) && now < instant(sub.expires_at), 'S12');
    add(sub.grant_id === grant.grant_id && sub.recipient_id === grant.recipient_id && sub.scope_revision === grant.scope_revision && instant(sub.expires_at) <= instant(grant.expires_at), 'S11');
    add(event.recipient_id === grant.recipient_id && event.recipient_id === sub.recipient_id, 'S17');
    add(event.scope_revision === grant.scope_revision && event.scope_revision === sub.scope_revision, 'S11');
    add(event.stream_id === sub.stream_id && event.subscription_id === sub.subscription_id, 'S11');
    const granted = new Set(grant.scope.applications.map(orderedKey));
    const subscribed = new Set(sub.scope.applications.map(orderedKey));
    add(sub.scope.applications.every(a => granted.has(orderedKey(a))) && sub.scope.allowed_fields.every(f => grant.scope.allowed_fields.includes(f)), 'S11');
    add(sub.scope.history_max_age_ms <= grant.scope.history_max_age_ms && sub.scope.history_max_bytes <= grant.scope.history_max_bytes && sub.scope.aggregation_interval_ms >= grant.scope.aggregation_interval_ms, 'S11');
    add(event.summary.aggregation_interval_ms === sub.scope.aggregation_interval_ms && event.summary.page_count === Math.ceil(sub.scope.applications.length / 32), 'S11');
    const partition = new Set(sub.scope.applications.slice(event.summary.page_index * 32, (event.summary.page_index + 1) * 32).map(orderedKey));
    for (const a of event.summary.apps) {
      add(granted.has(orderedKey(a.application)) && subscribed.has(orderedKey(a.application)) && partition.has(orderedKey(a.application)), 'S11');
      if (Object.hasOwn(a.application, 'label')) add(grant.scope.allowed_fields.includes('label') && sub.scope.allowed_fields.includes('label'), 'S11');
    }
    for (const key of Object.keys(event.extensions ?? {})) add((grant.scope.extension_keys ?? []).includes(key) && (sub.scope.extension_keys ?? []).includes(key), 'S11');
    const maxExpiry = Math.min(instant(grant.expires_at), instant(sub.expires_at), instant(event.window.start) + Math.min(grant.scope.history_max_age_ms, sub.scope.history_max_age_ms));
    add(instant(event.expires_at) <= maxExpiry, 'S11');
    for (const interval of event.summary.coverage.observed_intervals) add(instant(interval.start) >= instant(grant.approved_at) && instant(interval.end) <= instant(grant.expires_at), 'S11');
  }
  if (context.now) add(now < instant(event.expires_at) && instant(event.emitted_at) <= now + 300000, 'S15');
  if (context.recipient_id) add(context.recipient_id === event.recipient_id, 'S17');
  if (context.profile_id) add(['direct-https-v1', 'direct-local-tls-v1', 'direct-loopback-test-v1'].includes(context.profile_id), 'S17');
  return [...problems];
}

function groupSemantics(events, complete = true) {
  const problems = new Set(), head = events[0];
  if (!head) return ['S13'];
  const check = (ok, rule = 'S13') => { if (!ok) problems.add(rule); };
  const ledger = new Map();
  for (const event of events) {
    if (ledger.has(event.event_id)) check(same(ledger.get(event.event_id), event));
    else ledger.set(event.event_id, event);
  }
  events = [...ledger.values()];
  const pages = [...events].sort((a, b) => a.summary.page_index - b.summary.page_index);
  check(new Set(events.map(e => e.event_id)).size === events.length);
  check(new Set(events.map(e => e.summary.page_index)).size === events.length);
  if (complete) check(events.length === head.summary.page_count && pages.every((e, i) => e.summary.page_index === i));
  for (const e of events) {
    for (const field of ['recipient_id', 'stream_id', 'subscription_id', 'scope_revision', 'emitted_at', 'expires_at']) check(e[field] === head[field]);
    check(same(e.window, head.window) && same(e.summary.coverage, head.summary.coverage) && e.summary.page_count === head.summary.page_count && e.summary.aggregation_interval_ms === head.summary.aggregation_interval_ms);
    check(e.sequence - e.summary.page_index === head.sequence - head.summary.page_index);
  }
  const apps = pages.flatMap(e => e.summary.apps).map(a => orderedKey(a.application));
  check(new Set(apps).size === apps.length);
  check(apps.every((key, i) => i === 0 || key > apps[i - 1]));
  if (complete) check(apps.length > 0);
  return [...problems];
}

const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true, validateFormats: true });
addFormats(ajv, { mode: 'full' });
const schemaFiles = (await readdir(schemaDir)).filter(f => f.endsWith('.schema.json')).sort();
for (const file of schemaFiles) {
  const raw = await readFile(path.join(schemaDir, file), 'utf8');
  const schema = JSON.parse(raw); digests[`schemas/oap/0.1.0/${file}`] = hash(raw);
  if (schema.$id !== file || schema.$schema !== 'https://json-schema.org/draft/2020-12/schema' || !ajv.validateSchema(schema)) fail(`CT-01: invalid schema ${file}`);
  ajv.addSchema({ ...schema, $id: new URL(schema.$id, base).href });
}
const validators = new Map();
for (const file of schemaFiles) validators.set(file, ajv.getSchema(new URL(file, base).href));
const manifestRaw = await readFile(path.join(exampleDir, 'example-manifest.json'), 'utf8');
const manifest = JSON.parse(manifestRaw);
digests['examples/oap/0.1.0/example-manifest.json'] = hash(manifestRaw);
const declared = new Set(), fixtureIds = new Set();
const values = new Map();
for (const fixture of manifest.fixtures) {
  if (declared.has(fixture.file) || fixtureIds.has(fixture.id)) fail(`CT-02: duplicate declaration ${fixture.id}`);
  declared.add(fixture.file); fixtureIds.add(fixture.id);
  if (!validators.has(fixture.schema)) { fail(`CT-02: unknown schema ${fixture.schema}`); continue; }
  const bytes = await readFile(path.join(exampleDir, fixture.file));
  digests[`examples/oap/0.1.0/${fixture.file}`] = hash(bytes);
  const maximum = fixture.schema === 'batch.schema.json' || fixture.schema === 'local-grant.schema.json' || fixture.schema === 'subscription.schema.json' ? 65536 : fixture.schema === 'receipt.schema.json' || fixture.schema === 'error.schema.json' ? 4096 : 16384;
  let result;
  try {
    const raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    result = representation(raw, maximum);
  } catch { result = { value: undefined, problems: ['S10'] }; }
  const rules = [...result.problems];
  if (!rules.length) {
    const validate = validators.get(fixture.schema);
    if (!validate(result.value)) rules.push('schema');
    else rules.push(...semantics(result.value, fixture.schema));
    if (!rules.length && fixture.validation === 'context') rules.push(...await fixtureContext(result.value, fixture.context));
  }
  values.set(fixture.file, result.value);
  const ok = fixture.valid ? rules.length === 0 : rules.length > 0 && rules.includes(fixture.expected_rule);
  if (!ok) fail(`CT-02: ${fixture.id}: expected ${fixture.valid ? 'valid' : fixture.expected_rule}, observed ${rules.join(',') || 'valid'}`);
  outcomes.push({ id: fixture.id, kind: fixture.validation, passed: ok, observed_rules: [...new Set(rules)] });
}
for (const group of manifest.groups ?? []) {
  const events = group.files.map(f => values.get(f));
  const rules = groupSemantics(events, group.complete ?? true);
  if (group.context) for (const event of events) {
    const contextRules = await fixtureContext(event, group.context);
    // A group with a foreign partition is inconsistent, even if each page has
    // independently well-formed syntax. This is still a synthetic static check.
    if (contextRules.length) rules.push('S13');
  }
  const ok = group.valid ? rules.length === 0 : rules.includes(group.expected_rule);
  if (!ok) fail(`CT-07: ${group.id}: expected ${group.valid ? 'valid' : group.expected_rule}, observed ${rules.join(',') || 'valid'}`);
  outcomes.push({ id: group.id, kind: 'static_group', passed: ok, observed_rules: rules });
}

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = await Promise.all(entries.filter(e => !['node_modules', '.git', 'artifacts'].includes(e.name)).map(e => e.isDirectory() ? filesUnder(path.join(directory, e.name)) : [path.join(directory, e.name)]));
  return results.flat();
}
for (const file of await filesUnder(exampleDir)) {
  const relative = path.relative(exampleDir, file).split(path.sep).join('/');
  if (file.endsWith('.json') && relative !== 'example-manifest.json' && !declared.has(relative)) fail(`CT-02: undeclared JSON fixture ${relative}`);
}

const docs = (await filesUnder(root)).filter(f => f.endsWith('.md'));
let localLinks = 0;
const slug = heading => heading.toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
for (const file of docs) {
  const raw = await readFile(file, 'utf8');
  digests[path.relative(root, file).split(path.sep).join('/')] = hash(raw);
  for (const match of raw.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].replace(/^<|>$/g, '');
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const [relative, anchor] = target.split('#');
    const destination = relative ? path.resolve(path.dirname(file), decodeURIComponent(relative)) : file;
    try {
      const contents = await readFile(destination, 'utf8'); localLinks++;
      if (anchor && destination.endsWith('.md')) {
        const anchors = [...contents.matchAll(/^#{1,6}\s+(.+)$/gm)].map(h => slug(h[1]));
        if (!anchors.includes(decodeURIComponent(anchor))) fail(`CT-37: missing anchor ${target} in ${path.relative(root, file)}`);
      }
    } catch { fail(`CT-37: missing link ${target} in ${path.relative(root, file)}`); }
  }
}
const trace = await readFile(path.join(root, 'specs/requirements-traceability.md'), 'utf8');
const requirements = [...trace.matchAll(/^\| (OAP-(?:FR|NFR|PR)-\d{3}) \|/gm)].map(m => m[1]);
if (requirements.length !== 33 || new Set(requirements).size !== 33) fail('CT-37: expected 33 unique requirement rows');
const conformance = await readFile(path.join(root, 'specs/protocol/conformance.md'), 'utf8');
const acs = [...conformance.matchAll(/^\| (AC-\d{2}) \|/gm)].map(m => m[1]);
if (acs.length !== 29 || new Set(acs).size !== 29) fail('CT-37: expected 29 unique AC mappings');
const ruleIds = new Set([...conformance.matchAll(/^\| (S\d{2}) \|/gm)].map(m => m[1]));
for (const f of [...manifest.fixtures, ...(manifest.groups ?? [])]) {
  if (f.expected_rule && !['schema', 'representation'].includes(f.expected_rule) && !ruleIds.has(f.expected_rule)) fail(`CT-02: undocumented rule ${f.expected_rule}`);
}
for (const file of ['specs/protocol/interfaces.ts', 'scripts/validate-spec.mjs', 'scripts/generate-representation-fixtures.mjs', 'package.json', 'pnpm-lock.yaml']) {
  digests[file] = hash(await readFile(path.join(root, file)));
}
const report = {
  protocol_version: manifest.protocol_version,
  evidence_kind: 'phase_3_contract_artifacts_only',
  environment: { platform: process.platform, node: process.version, ajv: JSON.parse(await readFile(path.join(root, 'node_modules/ajv/package.json'), 'utf8')).version, ajv_formats: JSON.parse(await readFile(path.join(root, 'node_modules/ajv-formats/package.json'), 'utf8')).version },
  schema_count: schemaFiles.length, fixture_count: manifest.fixtures.length, group_count: (manifest.groups ?? []).length,
  markdown_count: docs.length, local_link_count: localLinks, requirement_count: requirements.length, acceptance_mapping_count: acs.length,
  passed: failures.length === 0, failures, outcomes, sha256: digests,
  untested: ['running provider/receiver', 'live OS permission/consent fences', 'real TLS/network/authentication', 'durable deduplication/recovery', 'publication/retry/storage runtime budgets', 'Windows/Linux M1 portability', 'real personal agent M2', 'Android M3']
};
const reportIndex = process.argv.indexOf('--report');
if (reportIndex !== -1) await writeFile(path.resolve(root, process.argv[reportIndex + 1]), `${JSON.stringify(report, null, 2)}\n`);
console.log(`${report.passed ? 'PASS' : 'FAIL'}: ${report.schema_count} schemas, ${report.fixture_count} fixtures, ${report.group_count} groups, ${report.local_link_count} local links, 33 requirements, 29 AC mappings.`);
failures.forEach(message => console.error(message));
console.log('Contract artifacts only; M1/M2/M3 runtime claims remain untested.');
if (failures.length) process.exitCode = 1;
