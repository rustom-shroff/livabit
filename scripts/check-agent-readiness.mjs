import { loadPreparationCatalog, inspectAgentReadiness } from '../src/agent-readiness.mjs';

try {
  const args = process.argv.slice(2), catalog = await loadPreparationCatalog();
  if (args.length === 1 && args[0] === '--list') {
    console.log(JSON.stringify({ purpose: 'preparation_only', production_selectable: false,
      candidates: catalog.hosts.map(({ id, provider, surface, classification }) => ({ id, provider, surface, classification })) }, null, 2));
  } else if (args.length === 2 && args[0] === '--host') {
    console.log(JSON.stringify(inspectAgentReadiness(catalog, args[1]), null, 2));
  } else {
    console.error('Use node scripts/check-agent-readiness.mjs --list or --host <catalog-id>. No network or account actions are performed.');
    process.exitCode = 2;
  }
} catch {
  console.error('Agent preparation could not be checked. No host was enabled or contacted.');
  process.exitCode = 1;
}
