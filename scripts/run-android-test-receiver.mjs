import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startActivityReceiver } from '../tools/activity-receiver/server.mjs';

// Run the actual desktop consumer in an isolated native-test directory and port.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.resolve(process.argv[2] ?? '');
const relative = path.relative(path.join(root, 'artifacts', 'android-publisher'), directory);
if (!/^run-[a-f0-9-]+[\\/]receiver$/u.test(relative)) throw Error('An owned Android test receiver directory is required');
const receiver = await startActivityReceiver({ host: '127.0.0.1', port: 0, directory });
console.log(`Isolated Android test receiver ready on port ${receiver.port}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  await receiver.close(); process.exit(0);
});
