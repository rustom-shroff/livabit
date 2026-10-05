// Static control-record semantics. This function does not establish authority.
import { assertSchema, validateEvent, validateScope, canonical, OapError } from './protocol.mjs';

const retryable = new Set(['temporary_unavailable', 'rate_limited', 'storage_unavailable']);
const requireRule = condition => { if (!condition) throw new OapError('invalid_request'); };
const instant = value => {
  requireRule(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value));
  const result = Date.parse(value);
  requireRule(Number.isFinite(result) && new Date(result).toISOString() === value);
  return result;
};

export function validateControlRecord(schema, value) {
  assertSchema(schema, value);
  const kind = schema.replace(/\.schema\.json$/, '');
  if (kind === 'activity-summary') return validateEvent(value);
  if (value.scope) validateScope(value.scope);
  if (kind === 'local-grant') {
    requireRule(instant(value.created_at) <= instant(value.approved_at) && instant(value.approved_at) < instant(value.expires_at));
  } else if (kind === 'subscription') {
    requireRule(instant(value.created_at) < instant(value.expires_at));
  } else if (kind === 'batch') {
    requireRule(Buffer.byteLength(canonical(value)) <= 65536);
    requireRule(value.has_more === Object.hasOwn(value, 'next_cursor'));
    const identities = new Set();
    let previousSequence = 0;
    for (const event of value.events) {
      validateEvent(event);
      requireRule(event.sequence > previousSequence && !identities.has(event.event_id));
      for (const key of ['recipient_id', 'stream_id', 'scope_revision']) requireRule(event[key] === value[key]);
      previousSequence = event.sequence; identities.add(event.event_id);
    }
    let previous;
    for (const gap of value.gaps) {
      requireRule(gap.from_sequence <= gap.to_sequence);
      if (previous) requireRule(gap.from_sequence > previous.to_sequence &&
        !(gap.from_sequence === previous.to_sequence + 1 && gap.reason === previous.reason));
      requireRule(!value.events.some(event => event.sequence >= gap.from_sequence && event.sequence <= gap.to_sequence));
      previous = gap;
    }
  } else if (kind === 'error') {
    requireRule(value.retryable === retryable.has(value.code));
    requireRule(!Object.hasOwn(value, 'retry_after_ms') || value.retryable);
  } else if (kind === 'status') {
    requireRule(value.retention.retained_bytes <= value.retention.max_bytes);
    for (const key of ['grant_expires_at', 'last_receipt_at', 'last_valid_consumption_at']) if (Object.hasOwn(value, key)) instant(value[key]);
  } else if (kind === 'receipt') {
    instant(value.received_at);
  }
  return value;
}
