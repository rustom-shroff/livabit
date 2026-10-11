// No secret arguments, environment configuration, files, account access or outbound transport.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getMuseConnectionReadiness } from '../src/experimental/meta-muse-connection.mjs';

export function prepareMetaMuseConnection(...args) {
  if(args.length) throw new TypeError('Local Muse preparation accepts no configuration.');
  // Gate BEFORE asking for credentials. The hidden input/session primitives are ready for a verified contract.
  return getMuseConnectionReadiness();
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  if(args.length===1 && args[0]==='--help') {
    console.log('node scripts/prepare-meta-muse-connection.mjs\nChecks Muse connection readiness locally. Credential entry and network dispatch stay disabled until native webhook documentation is verified. No secret arguments, configuration files or model/API fallback.');
  } else if(args.length) {
    console.error('Local Muse preparation accepts no configuration.');process.exitCode=2;
  } else console.log(JSON.stringify(prepareMetaMuseConnection()));
}
