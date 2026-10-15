import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectCompanionBackground } from './lib/companion-background-health.mjs';

const args = process.argv.slice(2), options = {};
for (let index = 0; index < args.length; index += 2) {
  if (!['--adb', '--serial'].includes(args[index]) || !args[index + 1]) throw new Error('Use --adb <path> and optional --serial <device>.');
  options[args[index]] = args[index + 1];
}
const adb = options['--adb'] ?? fileURLToPath(new URL('../artifacts/android-sdk/platform-tools/adb.exe', import.meta.url));
const runAdb = command => {
  const result = spawnSync(adb, command, { encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 2 * 1024 * 1024 });
  return { status: result.status ?? 1, stdout: result.stdout ?? '' };
};
console.log(JSON.stringify({ checked_at: new Date().toISOString(), ...inspectCompanionBackground(runAdb, options['--serial']) }, null, 2));
