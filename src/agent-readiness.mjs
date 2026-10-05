// Read-only preparation catalog. This module has no transport or account API.
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { OapError, parseJson, canonical } from './protocol.mjs';

const catalogUrl = new URL('../docs/agent-compatibility.json', import.meta.url);
const trustedSchema = JSON.parse(readFileSync(new URL('../schemas/preparation/agent-compatibility.schema.json', import.meta.url), 'utf8'));
const knownHosts = new Set(['openai-dot-mcp-events-tunnel', 'openai-workspace-agent-native-trigger',
  'claude-consumer-remote-mcp', 'gemini-consumer-custom-mcp', 'existing-local-oap-runtime', 'codex-local-app-server']);
const sourceDomains = new Set(['developers.openai.com', 'learn.chatgpt.com', 'support.claude.com',
  'platform.claude.com', 'support.google.com']);
const validatedCatalogs = new WeakSet();
const invalid = () => { throw new OapError('invalid_request', 'The agent preparation catalog is invalid.'); };
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}

export function validatePreparationCatalog(document) {
  if (!document || Object.keys(document).sort().join(',') !== 'catalog,schema'
    || document.schema?.$schema !== 'https://json-schema.org/draft/2020-12/schema') invalid();
  if (canonical(document.schema) !== canonical(trustedSchema)) invalid();
  const ajv = new Ajv2020({ strict: true, allErrors: false, validateFormats: true });
  addFormats(ajv);
  let validate;
  try { validate = ajv.compile(trustedSchema); } catch { invalid(); }
  if (!validate(document.catalog)) invalid();
  const catalog = document.catalog;
  // The embedded schema is descriptive data, never authority to enable a host.
  if (catalog.format_version !== '1.0.0' || catalog.implementation_status !== 'not_implemented'
    || catalog.selected_host_id !== null || catalog.production_selectable !== false
    || catalog.policy?.no_intermediary !== true || catalog.policy.existing_agent_required !== true
    || catalog.policy.new_agent_substitute_allowed !== false || catalog.policy.catalog_is_runtime_configuration !== false
    || catalog.policy.tokens_or_account_actions_performed !== false) invalid();
  const sources = new Set();
  for (const source of catalog.sources) {
    if (sources.has(source.id)) invalid();
    sources.add(source.id);
    let url;
    try { url = new URL(source.url); } catch { invalid(); }
    if (url.protocol !== 'https:' || url.username || url.password || !sourceDomains.has(url.hostname)) invalid();
  }
  const hosts = new Set();
  for (const host of catalog.hosts) {
    if (!knownHosts.has(host.id) || hosts.has(host.id) || host.production_selectable !== false || host.oap_profile_selected !== null
      || host.account_availability !== 'unverified' || host.complete_path_status !== 'unverified'
      || host.runtime_evidence.length !== 0) invalid();
    hosts.add(host.id);
    for (const sourceId of [...host.source_ids, ...Object.values(host.capabilities).flatMap(item => item.source_ids)]) {
      if (!sources.has(sourceId)) invalid();
    }
  }
  if (hosts.size !== knownHosts.size) invalid();
  validatedCatalogs.add(catalog);
  return freeze(catalog);
}

export async function loadPreparationCatalog() {
  try { return validatePreparationCatalog(parseJson(await readFile(catalogUrl), 131072)); }
  catch { invalid(); }
}

export function inspectAgentReadiness(catalog, hostId) {
  if (!validatedCatalogs.has(catalog)) invalid();
  const host = catalog.hosts.find(item => item.id === hostId);
  if (!host) throw new OapError('unsupported_capability', 'Choose a known agent candidate from the preparation catalog.');
  return {
    purpose: 'read_only_preparation', host_id: host.id, provider: host.provider, surface: host.surface,
    classification: host.classification, ready_for_real_pilot: false, production_selectable: false,
    account_eligibility: 'unverified', direct_path: host.complete_path_status, network_requests: 0,
    oap_profile_selected: null, adapter_contract: host.adapter_contract,
    prerequisites: [...host.prerequisites],
    blockers: ['Choose the actual existing agent and verify account eligibility.', ...host.blockers,
      'Actual supported pairing, credential lifecycle, delivery and observed agent behavior remain untested.'],
    capabilities: structuredClone(host.capabilities),
    linux_portability: 'on_hold_unverified; not_a_current_blocker',
    documentation_is_not_runtime_evidence: true
  };
}
