// Foreground, synthetic-only receiver. No hosted service, forwarding or model call.
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { JsonStore } from './storage.mjs';
import { parseJson } from './protocol.mjs';
import { Receiver, createReceiverState } from './receiver.mjs';

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--config') throw new Error('Usage: node src/receiver-cli.mjs --config <synthetic-test-config.json>');
  const configPath = path.resolve(args[1]);
  const config = parseJson(await readFile(configPath), 65_536);
  if (!config || config.synthetic_only !== true || typeof config.state_path !== 'string' || !config.credential ||
      Object.keys(config).some(key => !['synthetic_only', 'state_path', 'credential', 'host', 'port'].includes(key))) {
    throw new Error('The foreground receiver requires an explicit synthetic-only local test configuration.');
  }
  const statePath = path.resolve(path.dirname(configPath), config.state_path);
  const receiver = new Receiver({ store: new JsonStore(statePath, createReceiverState()) });
  await receiver.configure(config.credential);
  const running = await receiver.startServer({ host: config.host, port: config.port });
  console.log(JSON.stringify({ profile: 'direct-loopback-test-v1', base_url: running.baseUrl, synthetic_only: true }));
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await running.close();
  };
  process.once('SIGINT', () => stop().catch(() => { process.exitCode = 1; }));
  process.once('SIGTERM', () => stop().catch(() => { process.exitCode = 1; }));
}

main().catch(error => {
  // Error messages are fixed local text; credentials and payloads are never printed.
  console.error(error?.code ? `Receiver stopped: ${error.code}.` : 'Receiver setup failed; check the synthetic local configuration.');
  process.exitCode = 1;
});
