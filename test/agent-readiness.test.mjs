import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validatePreparationCatalog, loadPreparationCatalog, inspectAgentReadiness } from '../src/agent-readiness.mjs';

const document = JSON.parse(await readFile(new URL('../docs/agent-compatibility.json', import.meta.url), 'utf8'));
const changed = mutate => { const copy = structuredClone(document); mutate(copy); return copy; };
const invalid = value => assert.throws(() => validatePreparationCatalog(value), error => error.code === 'invalid_request');

test('agent catalog separates documented native ingress from actual supported OAP integration', async () => {
  const catalog = await loadPreparationCatalog();
  const result = inspectAgentReadiness(catalog, 'openai-workspace-agent-native-trigger');
  assert.equal(result.capabilities.native_activity_ingress.status, 'documented');
  assert.equal(result.ready_for_real_pilot, false);
  assert.equal(result.production_selectable, false);
  assert.equal(result.account_eligibility, 'unverified');
  assert.equal(result.adapter_contract, 'requires_reviewed_amendment');
  assert.equal(result.network_requests, 0);
  assert.ok(result.blockers.some(item => item.includes('202')));
  assert.equal(result.linux_portability.includes('not_a_current_blocker'), true);
});

test('all candidate surfaces remain unselected and require actual existing-agent evidence', () => {
  const catalog = validatePreparationCatalog(document);
  assert.equal(catalog.hosts.length, 6);
  for (const host of catalog.hosts) {
    const result = inspectAgentReadiness(catalog, host.id);
    assert.equal(result.ready_for_real_pilot, false);
    assert.equal(result.oap_profile_selected, null);
    assert.equal(result.documentation_is_not_runtime_evidence, true);
  }
});

test('unknown agent IDs fail safely without reflecting supplied secret-like input', () => {
  const supplied = 'unknown-private-token';
  assert.throws(() => inspectAgentReadiness(validatePreparationCatalog(document), supplied), error =>
    error.code === 'unsupported_capability' && !error.message.includes(supplied));
});

test('catalog edits cannot enable a production host or assert a verified account', () => {
  invalid(changed(copy => { copy.catalog.production_selectable = true; }));
  invalid(changed(copy => { copy.catalog.hosts[0].account_availability = 'verified'; }));
  invalid(changed(copy => { copy.catalog.hosts[0].runtime_evidence = ['invented-pass']; }));
});

test('weakening embedded schema cannot turn catalog metadata into runtime authority', () => {
  invalid(changed(copy => { copy.schema = { $schema: document.schema.$schema }; copy.catalog.production_selectable = true; }));
  invalid(changed(copy => { copy.schema = { $schema: document.schema.$schema }; copy.catalog.policy.no_intermediary = false; }));
  invalid(changed(copy => { copy.schema = { $schema: document.schema.$schema }; copy.catalog.hosts[0].capabilities.native_activity_ingress.status = 'verified-supported'; }));
});

test('duplicate source or host IDs and unknown capability citations are invalid', () => {
  invalid(changed(copy => { copy.catalog.sources.push(structuredClone(copy.catalog.sources[0])); }));
  invalid(changed(copy => { copy.catalog.hosts.push(structuredClone(copy.catalog.hosts[0])); }));
  invalid(changed(copy => { copy.catalog.hosts[0].capabilities.native_activity_ingress.source_ids = ['invented-source']; }));
});

test('catalog documentation links reject insecure or credential-bearing URLs', () => {
  invalid(changed(copy => { copy.catalog.sources[0].url = 'http://example.invalid/doc'; }));
  invalid(changed(copy => { copy.catalog.sources[0].url = 'https://private:secret@example.invalid/doc'; }));
  invalid(changed(copy => { copy.catalog.sources[0].url = 'https://example.invalid/doc'; }));
});

test('standalone inspection requires an immutable validated preparation catalog', () => {
  const catalog = validatePreparationCatalog(document);
  assert.throws(() => inspectAgentReadiness(structuredClone(catalog), catalog.hosts[0].id), error => error.code === 'invalid_request');
  assert.throws(() => { catalog.hosts[0].complete_path_status = 'verified'; }, TypeError);
  assert.equal(inspectAgentReadiness(catalog, catalog.hosts[0].id).direct_path, 'unverified');
});
