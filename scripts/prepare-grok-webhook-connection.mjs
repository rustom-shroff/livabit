// Readiness only: no input capture, files, environment configuration, account access or transport.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getGrokConnectionReadiness } from '../src/experimental/grok-webhook-connection.mjs';

export function prepareGrokWebhookConnection(...args) {
  if(args.length) throw new TypeError('Local Grok preparation accepts no configuration.');
  return getGrokConnectionReadiness();
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  if(args.length===1 && args[0]==='--help') {
    console.log('node scripts/prepare-grok-webhook-connection.mjs\nChecks local Grok Bot connection readiness. Credential entry and live dispatch are disabled in this command. A trusted local driver requires fresh review of an existing Bot, plan entitlement, exact provider destination, routine and disabled on-demand usage. No secret arguments, environment configuration, files or account changes.');
  } else if(args.length) {
    console.error('Local Grok preparation accepts no configuration.');process.exitCode=2;
  } else console.log(JSON.stringify(prepareGrokWebhookConnection()));
}
