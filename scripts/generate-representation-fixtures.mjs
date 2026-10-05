// Deterministic negative representations and timestamp-looking data fixtures.
// These files test the artifact checker; this is not runtime protocol code.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const directory = new URL('../examples/oap/0.1.0/', import.meta.url);
const manifestPath = new URL('example-manifest.json', directory);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const original = JSON.parse(await readFile(new URL('valid/event-complete.json', directory), 'utf8'));
const entries = [
  { id: 'invalid-source-utf8', file: 'invalid/source-utf8.json', data: Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]), valid: false, description: 'Invalid UTF-8 fails before replacement decoding can hide it.' },
  { id: 'invalid-malformed-json', file: 'invalid/malformed-json.json', data: '{"event_id":', valid: false, description: 'Incomplete JSON is rejected at the representation boundary.' },
  { id: 'invalid-json-bom', file: 'invalid/json-bom.json', data: `\ufeff${JSON.stringify(original)}`, valid: false, description: 'A byte-order mark is not accepted.' },
  { id: 'invalid-escape-equivalent-keys', file: 'invalid/escape-equivalent-keys.json', data: '{"event_id":"first","event_\\u0069d":"second"}', valid: false, description: 'Escaped and literal member names cannot bypass duplicate-key rejection.' },
  { id: 'invalid-unsafe-integer', file: 'invalid/unsafe-integer.json', data: JSON.stringify({ ...original, sequence: 9007199254740992 }), valid: false, description: 'Counters outside the safe integer range fail representation validation.' }
];
const timestampLabel = structuredClone(original);
timestampLabel.summary.apps[0].application.label = '2026-10-03TFocus';
entries.push({ id: 'valid-timestamp-looking-label', file: 'valid/timestamp-looking-label.json', data: `${JSON.stringify(timestampLabel, null, 2)}\n`, valid: true, description: 'An ordinary data label is not interpreted as a timestamp.' });
for (const entry of entries) {
  await writeFile(new URL(entry.file, directory), entry.data);
  const fixture = { id: entry.id, file: entry.file, schema: 'activity-summary.schema.json', valid: entry.valid, validation: 'semantic', description: entry.description };
  if (!entry.valid) fixture.expected_rule = 'S10';
  const index = manifest.fixtures.findIndex(f => f.id === fixture.id);
  if (index < 0) manifest.fixtures.push(fixture); else manifest.fixtures[index] = fixture;
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated ${entries.length} representation/data fixtures in ${fileURLToPath(directory)}.`);
