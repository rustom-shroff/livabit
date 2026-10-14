// Closed OAP draft observation validation, using only the host's Node runtime.
import { createHash } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
export const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value !== null && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const check = condition => { if (!condition) throw new Error('invalid_observation'); };
const fields = (value, names) => {
  check(value && typeof value === 'object' && !Array.isArray(value));
  check(Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name)));
};
const instant = value => {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value));
  const time = Date.parse(value);
  check(Number.isFinite(time) && new Date(time).toISOString() === value);
  return time;
};
export function parseActivityMessage(message, now = Date.now()) {
  check(typeof message === 'string' && Buffer.byteLength(message) <= 32768);
  const beginning = message.indexOf('{');
  check(beginning >= 0);
  const body = message.slice(beginning);
  check(Buffer.byteLength(body) <= 16384);
  const event = JSON.parse(body);
  // Exact canonical representation also rejects overwritten duplicate keys,
  // whitespace variants, unsafe numbers and noncanonical Unicode escapes.
  check(canonical(event) === body);
  fields(event, ['protocol_version', 'event_name', 'event_id', 'recipient_id', 'stream_id',
    'subscription_id', 'scope_revision', 'sequence', 'emitted_at', 'expires_at', 'window', 'observation']);
  check(['0.2.0-draft.1', '0.2.0-draft.2'].includes(event.protocol_version)
    && event.event_name === 'activity.observation');
  for (const key of ['event_id', 'recipient_id', 'stream_id', 'subscription_id']) check(UUID.test(event[key]));
  for (const key of ['scope_revision', 'sequence']) check(Number.isSafeInteger(event[key]) && event[key] > 0);
  fields(event.window, ['window_id', 'start', 'end']);
  check(UUID.test(event.window.window_id));
  const start = instant(event.window.start), end = instant(event.window.end);
  const emitted = instant(event.emitted_at), expires = instant(event.expires_at);
  check(end > start && end - start <= 900000 && emitted >= end && emitted <= now + 60000
    && expires > emitted && expires <= start + 86400000);
  fields(event.observation, ['metric', 'unit', 'coverage', 'quality', 'apps']);
  const observation = event.observation;
  check(observation.metric === 'foreground_duration' && observation.unit === 'millisecond'
    && observation.coverage === 'unknown' && observation.quality === 'unverified_estimate');
  check(Array.isArray(observation.apps) && observation.apps.length >= 1 && observation.apps.length <= 32);
  let previous = '', transitions = 0;
  for (const app of observation.apps) {
    fields(app, ['application', 'foreground_duration_ms', 'transition_count']);
    fields(app.application, ['namespace', 'id']);
    check(app.application.namespace === 'android' && typeof app.application.id === 'string'
      && app.application.id.length <= 128 && PACKAGE.test(app.application.id) && app.application.id > previous);
    previous = app.application.id;
    check(Number.isSafeInteger(app.transition_count) && app.transition_count >= 0 && app.transition_count <= 4096);
    transitions += app.transition_count;
    const duration = app.foreground_duration_ms;
    check(duration === null || (Number.isSafeInteger(duration) && duration > 0 && duration <= end - start));
    if (event.protocol_version === '0.2.0-draft.1' && duration !== null) check(app.transition_count >= 2);
  }
  check(transitions <= 4096);
  return { event, body, start, end, emitted, expires,
    source: `${event.recipient_id}:${event.stream_id}`,
    hash: createHash('sha256').update(body).digest('hex'),
    expired: expires <= now,
    meaningful: observation.apps.some(app => app.foreground_duration_ms !== null) };
}
