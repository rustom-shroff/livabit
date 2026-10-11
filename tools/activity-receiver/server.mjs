// The desktop test receiver is the final consumer. It displays Android events and forwards nothing.
import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, open, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { parseJson } from '../../src/protocol.mjs';
import { observationVersion, parseObservation } from './oap-observation.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const packageId = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/u;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function save(filename, value) {
  const temporary = filename + '.tmp'; const file = await open(temporary, 'w', 0o600);
  try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync(); } finally { await file.close(); }
  await rename(temporary, filename);
}
function validLegacy(event) {
  if (event?.format !== 'liveabit.test.activity.v1' || !uuid.test(event.event_id) || !uuid.test(event.stream_id)
    || !Number.isSafeInteger(event.sequence) || event.sequence < 1 || event.coverage !== 'unknown'
    || event.quality !== 'unverified_estimate' || !Array.isArray(event.apps) || event.apps.length < 1 || event.apps.length > 32) return false;
  const start = Date.parse(event.window?.start), end = Date.parse(event.window?.end);
  const emitted = Date.parse(event.emitted_at), expires = Date.parse(event.expires_at);
  if (![start, end, emitted, expires].every(Number.isFinite) || end <= start || end - start > 900_000
    || emitted < end || expires <= Date.now() || expires - emitted > 86_400_000 || emitted > Date.now() + 60_000) return false;
  const ids = new Set();
  for (const app of event.apps) {
    if (app?.application?.namespace !== 'android' || !packageId.test(app.application.id) || ids.has(app.application.id)
      || !Number.isSafeInteger(app.transition_count) || app.transition_count < 0 || app.transition_count > 4096
      || (app.foreground_duration_ms !== null && (!Number.isSafeInteger(app.foreground_duration_ms)
        || app.foreground_duration_ms < 1 || app.foreground_duration_ms > end - start))) return false;
    ids.add(app.application.id);
  }
  return true;
}
async function body(request) {
  const pieces = []; let size = 0;
  for await (const piece of request) { size += piece.length; if (size > 65_536) throw Error('too_large'); pieces.push(piece); }
  return Buffer.concat(pieces);
}
function respond(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(value));
}
export async function startActivityReceiver({ host = '127.0.0.1', port = 8765,
  directory = path.resolve(here, '../../artifacts/activity-receiver') } = {}) {
  await mkdir(directory, { recursive: true });
  const configPath = path.join(directory, 'connection.json'), statePath = path.join(directory, 'events.json');
  let token;
  try { token = JSON.parse(await readFile(configPath, 'utf8')).token; }
  catch (error) { if (error.code !== 'ENOENT') throw error; token = randomBytes(32).toString('base64url'); }
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(token)) throw Error('Receiver configuration unavailable.');
  let events = [];
  try {
    const bytes = await readFile(statePath); if (bytes.length > 16_777_216) throw Error('Receiver storage too large.');
    events = JSON.parse(bytes.toString('utf8'));
    if (!Array.isArray(events) || events.length > 200) throw Error('Receiver storage unavailable.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let mode = 'acknowledge', queue = Promise.resolve();
  let connections = [];
  const transact = action => { const result = queue.then(action); queue = result.catch(() => {}); return result; };
  const authorized = request => {
    const supplied = Buffer.from(request.headers.authorization ?? ''); const expected = Buffer.from('Bearer ' + token);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  };
  const server = createServer(async (request, response) => {
    try {
      const route = new URL(request.url, 'http://receiver.local').pathname;
      if (request.method === 'GET' && ['/', '/dashboard.js', '/dashboard.css'].includes(route)) {
        const filename = route === '/' ? 'dashboard.html' : route.slice(1);
        const type = filename.endsWith('.html') ? 'text/html' : filename.endsWith('.js') ? 'text/javascript' : 'text/css';
        response.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'",
          'X-Content-Type-Options': 'nosniff' }); response.end(await readFile(path.join(here, filename))); return;
      }
      if (!authorized(request)) { respond(response, 401, { error: 'Connection key required' }); return; }
      if (request.method === 'GET' && route === '/api/setup') {
        respond(response, 200, { connections, wifi_available: connections.some(item => item.name.startsWith('Phone on Wi-Fi')),
          wifi_help: host === '0.0.0.0' ? 'No private IPv4 address was found. Connect this computer to the same local network as your phone, then restart the receiver.'
            : 'Wi-Fi setup is unavailable because this receiver accepts connections only from this computer. Stop it with Ctrl+C, then run: node tools/activity-receiver/server.mjs --host 0.0.0.0' }); return;
      }
      if (request.method === 'GET' && route === '/api/events') {
        respond(response, 200, { mode, events: [...events].reverse() }); return;
      }
      if (request.method === 'POST' && route === '/api/mode') {
        const value = JSON.parse((await body(request)).toString('utf8'));
        if (!['acknowledge', 'no_acknowledgement', 'wrong_acknowledgement'].includes(value.mode)) {
          respond(response, 400, { error: 'Unknown test mode' }); return;
        }
        mode = value.mode; respond(response, 200, { mode }); return;
      }
      if (request.method !== 'POST' || route !== '/events') { respond(response, 404, { error: 'Not found' }); return; }
      if (!/^application\/json(?:\s*;|$)/iu.test(request.headers['content-type'] ?? '')) {
        respond(response, 415, { error: 'JSON required' }); return;
      }
      const bytes = await body(request); let event = parseJson(bytes, 65_536), wireFormat;
      if (event.protocol_version === observationVersion) {
        event = parseObservation(bytes); wireFormat = 'OAP ' + observationVersion;
      } else if (validLegacy(event)) wireFormat = 'Legacy liveabit test event';
      else { respond(response, 400, { error: 'Invalid or expired activity event' }); return; }
      const digest = hash(bytes), receivedAt = new Date().toISOString();
      const result = await transact(async () => {
        const previous = events.find(item => item.event.event_id === event.event_id);
        if (previous) return previous.body_sha256 === digest ? 'duplicate' : 'conflict';
        const updated = [...events, { event, body_sha256: digest, received_at: receivedAt, wire_format: wireFormat }].slice(-200);
        await save(statePath, updated); events = updated; return 'accepted';
      });
      if (result === 'conflict') { respond(response, 409, { error: 'Event identity already has different bytes' }); return; }
      if (mode === 'no_acknowledgement') { respond(response, 503, { error: 'Test mode: acknowledgement withheld' }); return; }
      respond(response, 200, { receiver: 'liveabit-test-receiver', accepted: true,
        event_id: mode === 'wrong_acknowledgement' ? '00000000-0000-4000-8000-000000000000' : event.event_id,
        body_sha256: digest, received_at: receivedAt, disposition: result });
    } catch (error) { if (!response.headersSent) respond(response, error.message === 'too_large' ? 413 : 400, { error: 'Request could not be accepted' }); }
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  const actualPort = server.address().port;
  const setup = url => ({ format: 'liveabit.receiver.connection.v1', url, key: token, warning_minutes: 60 });
  connections = [
    { name: 'Phone connected by USB', instructions: `Enable Developer options and USB debugging on your phone, connect it by USB, and accept its debugging prompt. From the project root in PowerShell run: .\\artifacts\\android-sdk\\platform-tools\\adb.exe -d reverse tcp:${actualPort} tcp:${actualPort}. Then import this setup in liveabit. Repeat the command after reconnecting the phone.`,
      setup: setup(`http://127.0.0.1:${actualPort}/events`) },
    { name: 'Android emulator', instructions: 'Use this setup only inside the Android emulator.',
      setup: setup(`http://10.0.2.2:${actualPort}/events`) }
  ];
  if (host === '0.0.0.0') {
    const addresses = new Set(Object.values(networkInterfaces()).flat().filter(item => item && item.family === 'IPv4'
      && !item.internal && /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/u.test(item.address)).map(item => item.address));
    for (const address of addresses) connections.unshift({ name: `Phone on Wi-Fi · ${address}`,
      instructions: 'Keep the phone on the same private network as this computer. Allow the receiver port through the computer firewall if needed.',
      setup: setup(`http://${address}:${actualPort}/events`) });
  }
  await save(path.join(directory, 'android-usb-setup.json'), connections.find(item => item.name === 'Phone connected by USB').setup);
  await save(path.join(directory, 'android-emulator-setup.json'), connections.find(item => item.name === 'Android emulator').setup);
  const wifiConnections = connections.filter(item => item.name.startsWith('Phone on Wi-Fi'));
  for (const connection of wifiConnections) {
    const address = new URL(connection.setup.url).hostname;
    await save(path.join(directory, `android-wifi-${address.replaceAll('.', '-')}-setup.json`), connection.setup);
  }
  await save(configPath, { token, desktop_url: `http://127.0.0.1:${actualPort}/`,
    emulator_events_url: `http://10.0.2.2:${actualPort}/events`, usb_events_url: `http://127.0.0.1:${actualPort}/events`,
    note: 'Test receiver only. No agent, relay or Grok account.', bind_host: host,
    wifi_events_urls: wifiConnections.map(connection => connection.setup.url) });
  return { server, port: actualPort, token, configPath,
    close: async () => { await queue; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2); let host = '127.0.0.1', port = 8765;
    for (let i = 0; i < args.length; i += 2) {
      if (args[i] === '--host' && ['127.0.0.1', '0.0.0.0'].includes(args[i + 1])) host = args[i + 1];
      else if (args[i] === '--port' && /^\d{2,5}$/u.test(args[i + 1])) port = Number(args[i + 1]);
      else throw Error('Unknown argument');
    }
    const receiver = await startActivityReceiver({ host, port });
    console.log(`Receiver ready at http://127.0.0.1:${receiver.port}/ — connection settings: ${receiver.configPath}`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await receiver.close(); process.exit(0); });
  } catch { console.error('Receiver could not start. Check the port and local connection files.'); process.exitCode = 1; }
}
