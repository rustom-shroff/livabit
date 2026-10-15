// Produces a separate phone import file. Existing connections, pending packets,
// host configuration and credentials are never changed or printed.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function activityConnection(source) {
  if (!source || source.format !== 'liveabit.openclaw.connection.v1'
    || typeof source.url !== 'string' || typeof source.key !== 'string'
    || !/^[A-Za-z0-9_-]{32,256}$/.test(source.key)) throw new Error('invalid_connection');
  let url;
  try { url = new URL(source.url); } catch { throw new Error('invalid_connection'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password
    || url.search || url.hash || !['/hooks/liveabit', '/hooks/agent', '/liveabit/activity'].includes(url.pathname)) {
    throw new Error('invalid_connection');
  }
  const warning = source.warning_minutes ?? 60;
  if (!Number.isInteger(warning) || warning < 1 || warning > 1440) throw new Error('invalid_connection');
  url.pathname = '/liveabit/activity';
  return { format: source.format, url: url.href, key: source.key, agent_id: 'main', warning_minutes: warning };
}

export async function exportActivityConnection(sourceFile, outputFile) {
  if (resolve(sourceFile) === resolve(outputFile)) throw new Error('separate_output_required');
  const raw = await readFile(sourceFile);
  if (raw.length > 8192) throw new Error('invalid_connection');
  let source;
  try { source = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, '')); }
  catch { throw new Error('invalid_connection'); }
  const prepared = activityConnection(source);
  await writeFile(outputFile, JSON.stringify(prepared, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return { exported: true, receipt_path: '/liveabit/activity', source_unchanged: true,
    requires_sender: '0.12.0-poc or later', requires_installed_durable_endpoint: true };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--source' || args[2] !== '--output') throw new Error('invalid_arguments');
  console.log(JSON.stringify(await exportActivityConnection(args[1], args[3])));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Connection export failed. Use a valid Android OpenClaw setup file and a new, separate output path. No connection key was printed.'); process.exitCode = 1; });
}
