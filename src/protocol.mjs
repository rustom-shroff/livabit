import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const retryCodes = new Set(['temporary_unavailable', 'rate_limited', 'storage_unavailable']);
const codes = new Set(['invalid_event','incompatible_version','unsupported_capability','unauthorized','scope_mismatch','consent_inactive','expired','payload_too_large','rate_limited','destination_rejected','temporary_unavailable','cursor_invalid','history_unavailable','conflicting_duplicate','invalid_request','scope_unsupported','storage_unavailable','clock_untrusted','cursor_stale','endpoint_unsupported','media_type_unsupported']);
export class OapError extends Error {
  constructor(code, message = 'The operation could not be completed.', options = {}) {
    super(message); this.name = 'OapError'; this.code = codes.has(code) ? code : 'invalid_request';
    this.retryable = retryCodes.has(this.code);
    const hint = typeof options === 'number' ? options : options.retryAfterMs;
    if (Number.isSafeInteger(hint) && hint >= 0) this.retryAfterMs = hint;
  }
  toJSON() {
    const value = { protocol_version: '0.1.0', code: this.code, message: this.message.slice(0, 256) || 'Operation failed.', retryable: this.retryable };
    if (this.retryable && this.retryAfterMs !== undefined && this.retryAfterMs <= 3600000) value.retry_after_ms = this.retryAfterMs;
    return value;
  }
}
export const appKey = application => `${application.namespace}\0${application.id}`;
export const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value !== null && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}` : JSON.stringify(value);
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
const requireRule = (ok, code = 'invalid_event') => { if (!ok) throw new OapError(code); };

function inspectJson(value) {
  if (typeof value === 'number') requireRule(Number.isSafeInteger(value) && !Object.is(value, -0));
  if (typeof value === 'string') requireRule(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value));
  if (Array.isArray(value)) value.forEach(inspectJson);
  else if (value && typeof value === 'object') Object.entries(value).forEach(([k,v]) => { inspectJson(k); inspectJson(v); });
}
function checkDuplicateKeys(raw) {
  let i = 0;
  const ws = () => { while (i < raw.length && /\s/.test(raw[i])) i++; };
  const string = () => { const start = i++; while (i < raw.length) { if (raw[i] === '\\') { i += 2; continue; } if (raw[i++] === '"') break; } return JSON.parse(raw.slice(start, i)); };
  const value = () => {
    ws();
    if (raw[i] === '{') { i++; ws(); const seen = new Set(); if (raw[i] === '}') { i++; return; } while (true) { ws(); const key = string(); requireRule(!seen.has(key)); seen.add(key); ws(); i++; value(); ws(); if (raw[i++] === '}') return; } }
    if (raw[i] === '[') { i++; ws(); if (raw[i] === ']') { i++; return; } while (true) { value(); ws(); if (raw[i++] === ']') return; } }
    if (raw[i] === '"') { string(); return; }
    while (i < raw.length && !/[\s,}\]]/.test(raw[i])) i++;
  };
  value();
}
export function parseJson(input, maxBytes = 16384) {
  // Validate UTF-16 callers before Buffer can replace an unpaired surrogate.
  if (typeof input === 'string') inspectJson(input);
  const bytes = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
  requireRule(bytes.length <= maxBytes, 'payload_too_large');
  try {
    const raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    requireRule(raw.charCodeAt(0) !== 0xfeff);
    const result = JSON.parse(raw); checkDuplicateKeys(raw); inspectJson(result); return result;
  } catch (error) { if (error instanceof OapError) throw error; throw new OapError('invalid_event'); }
}
const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true });
addFormats(ajv, { mode: 'full' });
const schemaDirectory = new URL('../schemas/oap/0.1.0/', import.meta.url);
const base = 'https://example.invalid/oap/0.1.0/';
for (const file of readdirSync(schemaDirectory).filter(f => f.endsWith('.schema.json'))) {
  const schema = JSON.parse(readFileSync(new URL(file, schemaDirectory), 'utf8'));
  ajv.addSchema({ ...schema, $id: new URL(schema.$id, base).href });
}
const nameOf = name => name.endsWith('.schema.json') ? name : `${name}.schema.json`;
export function assertSchema(name, value) {
  inspectJson(value);
  const validate = ajv.getSchema(new URL(nameOf(name), base).href);
  requireRule(validate, 'invalid_request');
  if (value?.protocol_version && value.protocol_version !== '0.1.0') throw new OapError('incompatible_version');
  requireRule(validate(value), name === 'activity-summary' || nameOf(name) === 'activity-summary.schema.json' ? 'invalid_event' : 'invalid_request');
  return value;
}
export function capabilities(role, profiles = ['direct-loopback-test-v1'], namespaces = ['android','android.package','test.app']) {
  return { protocol_version:'0.1.0',role,supported_versions:['0.1.0'],event_names:['activity.summary'],metrics:['foreground_duration'],application_namespaces:namespaces,allowed_fields:['foreground_duration_ms','label'],delivery_profiles:profiles,
    limits:{max_event_bytes:16384,max_batch_bytes:65536,max_apps_per_page:32,max_pages:4,max_fresh_events_per_hour:4,max_history_age_ms:86400000,max_history_bytes:4194304,max_attempts_per_cycle:6},device_actions_enabled:false };
}
export function validateScope(scope) {
  // Reuse the normative scope schema without creating or authorizing a grant.
  const validate = ajv.getSchema(`${base}common.schema.json#/$defs/scope`);
  requireRule(validate(scope), 'invalid_request'); inspectJson(scope);
  const keys = scope.applications.map(appKey);
  requireRule(keys.every((k,i) => !i || k > keys[i-1]), 'invalid_request');
  requireRule(scope.aggregation_interval_ms >= 900000 * Math.ceil(keys.length / 32) && scope.history_max_age_ms > scope.aggregation_interval_ms, 'invalid_request');
  return scope;
}
const timestamp = value => {
  requireRule(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value));
  const time = Date.parse(value); requireRule(Number.isFinite(time) && new Date(time).toISOString() === value); return time;
};
export function validateEvent(event, { now, authorization } = {}) {
  assertSchema('activity-summary', event);
  requireRule(Buffer.byteLength(canonical(event)) <= 16384, 'payload_too_large');
  const start = timestamp(event.window.start), end = timestamp(event.window.end), emitted = timestamp(event.emitted_at), expiry = timestamp(event.expires_at);
  const s = event.summary, duration = end - start, c = s.coverage;
  requireRule(duration === s.aggregation_interval_ms && duration >= 900000 && duration <= 3600000 && duration % 900000 === 0);
  requireRule(emitted >= end && expiry > emitted && expiry <= start + 86400000);
  let observed = 0, previousEnd = -Infinity;
  for (const interval of c.observed_intervals) {
    const a = timestamp(interval.start), b = timestamp(interval.end);
    requireRule(a >= start && b <= end && b > a && a > previousEnd); observed += b-a; previousEnd=b;
  }
  requireRule(c.status === 'complete' ? c.observed_intervals.length === 1 && c.observed_intervals[0].start === event.window.start && c.observed_intervals[0].end === event.window.end && c.reasons.length === 0 : observed > 0 && observed < duration && c.reasons.length > 0);
  requireRule(s.apps.every(a => a.foreground_duration_ms > 0 && a.foreground_duration_ms <= observed));
  const keys = s.apps.map(a => appKey(a.application)); requireRule(keys.every((k,i) => !i || k > keys[i-1]));
  requireRule(s.page_index < s.page_count && duration >= 900000 * s.page_count);
  if (now !== undefined) { const current = typeof now === 'function' ? now() : now; requireRule(Number.isFinite(current), 'clock_untrusted'); requireRule(current < expiry, 'expired'); requireRule(emitted <= current + 300000); }
  if (authorization) {
    const a=authorization; validateScope(a.scope);
    for (const key of ['recipient_id','stream_id','subscription_id','scope_revision']) requireRule(event[key] === a[key], 'scope_mismatch');
    const deadline = typeof a.expires_at === 'number' ? a.expires_at : Date.parse(a.expires_at);
    requireRule(Number.isFinite(deadline) && expiry <= deadline && expiry <= start + a.scope.history_max_age_ms, 'scope_mismatch');
    requireRule(s.aggregation_interval_ms === a.scope.aggregation_interval_ms && s.page_count === Math.ceil(a.scope.applications.length/32), 'scope_mismatch');
    const partition = new Set(a.scope.applications.slice(s.page_index*32,(s.page_index+1)*32).map(appKey));
    for (const record of s.apps) { requireRule(partition.has(appKey(record.application)), 'scope_mismatch'); if (Object.hasOwn(record.application,'label')) requireRule(a.scope.allowed_fields.includes('label'), 'scope_mismatch'); }
    for (const key of Object.keys(event.extensions ?? {})) requireRule((a.scope.extension_keys ?? []).includes(key),'scope_mismatch');
  }
  return event;
}
