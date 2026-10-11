// Consumer validation for the actual desktop receiver, not a sender model.
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { canonical, parseJson } from '../../src/protocol.mjs';

export const observationVersion = '0.2.0-draft.1';
const base = 'https://example.invalid/oap/'; // Offline identity; never fetched.
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv, { mode: 'full' });
for (const relative of ['0.1.0/common.schema.json', '0.2.0-draft.1/activity-observation.schema.json']) {
  const schema = JSON.parse(readFileSync(new URL('../../schemas/oap/' + relative, import.meta.url), 'utf8'));
  ajv.addSchema({ ...schema, $id: new URL(relative, base).href });
}
const validate = ajv.getSchema(base + '0.2.0-draft.1/activity-observation.schema.json');
const requireRule = condition => { if (!condition) throw Error('Invalid OAP observation'); };
const instant = value => {
  const time = Date.parse(value);
  requireRule(Number.isFinite(time) && new Date(time).toISOString() === value);
  return time;
};
export function parseObservation(bytes, now = Date.now()) {
  const event = parseJson(bytes, 16_384);
  requireRule(validate(event));
  requireRule(Buffer.from(bytes).equals(Buffer.from(canonical(event))));
  const start = instant(event.window.start), end = instant(event.window.end);
  const emitted = instant(event.emitted_at), expires = instant(event.expires_at);
  requireRule(end > start && end - start <= 900_000 && emitted >= end && emitted <= now + 60_000);
  requireRule(expires > emitted && expires > now && expires <= start + 86_400_000);
  let previous = '', transitions = 0;
  for (const app of event.observation.apps) {
    requireRule(app.application.id > previous); previous = app.application.id;
    requireRule(app.foreground_duration_ms === null || app.foreground_duration_ms <= end - start);
    requireRule(app.foreground_duration_ms === null || app.transition_count >= 2);
    transitions += app.transition_count;
  }
  requireRule(transitions <= 4096);
  return event;
}
