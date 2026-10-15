// Run inside the existing isolated OpenClaw account. Output is a deliberately
// sanitized status record: no keys, raw activity, reports, prompts or node IDs.
// --observe-only makes no HTTP tool calls and writes no synthetic observation.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
    : JSON.stringify(value);
const hash = value => createHash('sha256').update(value).digest('hex');

async function check() {
  if (process.argv.slice(2).some(value => value !== '--observe-only')) throw new Error('invalid_arguments');
  const observe = process.argv.includes('--observe-only');
  const state = process.env.OPENCLAW_STATE_DIR || join(homedir(), '.openclaw');
  const config = JSON.parse(readFileSync(join(state, 'openclaw.json'), 'utf8'));
  const settings = JSON.parse(readFileSync(join(state, 'liveabit-personal-agent/settings.json'), 'utf8'));
  const port = config.gateway?.port;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid_gateway_port');
  const origin = 'http://127.0.0.1:' + port;
  const request = async (path, { key, value, method = 'POST' } = {}) => {
    try {
      const response = await fetch(origin + path, { method, signal: AbortSignal.timeout(30000),
        headers: { ...(value ? { 'Content-Type': 'application/json' } : {}), ...(key ? { Authorization: 'Bearer ' + key } : {}) },
        ...(value ? { body: JSON.stringify(value) } : {}) });
      const raw = await response.text();
      if (raw.length > 4 * 1024 * 1024) return { status: response.status, oversized: true };
      let body; try { body = JSON.parse(raw); } catch {}
      return { status: response.status, body };
    } catch (error) { return { status: null, transport_name: error?.name ?? 'Error',
      transport_code: error?.cause?.code ?? error?.code ?? null }; }
  };
  const health = await request('/health', { method: 'GET' });
  const output = {
    format: 'liveabit.personal-agent.host-check.v1', checked_at: new Date().toISOString(),
    observe_only: observe, http_health_status: health.status,
    http_health_transport: health.status == null ? { name: health.transport_name, code: health.transport_code } : null,
    settings_format: settings.format, agent_id: settings.agentId, activity_session: settings.sessionKey,
    main_session: settings.mainSessionKey ?? settings.sessionKey,
    analysis_enabled: settings.analysisEnabled === true, accountability_emails_enabled: settings.accountabilityEmailsEnabled,
    agent_configuration_fingerprint: hash(JSON.stringify(config.agents?.entries ?? {})),
    plugin_bundles: [], managed_guidance: {}, tables: {}, runtime_work: {}, probes: {},
    real_model_requests: 0, real_notifications_requested: 0, real_emails_requested: 0
  };
  const workspace = config.agents?.entries?.[settings.agentId]?.workspace;
  if (typeof workspace === 'string') {
    for (const [name, parts] of Object.entries({ skill_sha256: ['skills','liveabit','SKILL.md'],
      workflow_sha256: ['skills','liveabit','references','personal-agent-workflow.md'] })) {
      const filename = join(workspace, ...parts);
      if (existsSync(filename)) output.managed_guidance[name] = hash(readFileSync(filename));
    }
    const filename = join(workspace, 'AGENTS.md');
    if (existsSync(filename)) {
      const instructions = readFileSync(filename, 'utf8');
      const start = '<!-- liveabit-personal-agent:start -->\n', end = '\n<!-- liveabit-personal-agent:end -->';
      const first = instructions.indexOf(start), last = instructions.indexOf(end, first + start.length);
      if (first >= 0 && last > first && instructions.indexOf(start, first + start.length) < 0
        && instructions.indexOf(end, last + end.length) < 0)
        output.managed_guidance.guide_sha256 = hash(instructions.slice(first + start.length, last));
    }
  }
  for (const directory of config.plugins?.load?.paths ?? []) {
    if (typeof directory !== 'string' || !existsSync(join(directory, 'openclaw.plugin.json'))) continue;
    const manifest = JSON.parse(readFileSync(join(directory, 'openclaw.plugin.json'), 'utf8'));
    if (manifest.id !== 'liveabit-personal-agent') continue;
    const files = ['package.json','openclaw.plugin.json','index.mjs','ingress.mjs','runtime.mjs','observation.mjs',
      'store.mjs','analysis-store.mjs','analysis.mjs','background.mjs','receipt.mjs','conversation.mjs','invocation.mjs',
      'notification.mjs','delivery-store.mjs','configuration.mjs','installer.mjs'];
    output.plugin_bundles.push({ version: JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')).version,
      hashes: Object.fromEntries(files.filter(file => existsSync(join(directory, file))).map(file => [file, hash(readFileSync(join(directory, file)))])) });
  }
  const database = new DatabaseSync(settings.databasePath, { readOnly: true });
  try {
    const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
    for (const name of ['events','episodes','decisions','feedback','notifications','analysis_state','analysis_events','analysis_jobs','analysis_decisions','notification_jobs']) {
      if (tables.has(name)) output.tables[name] = database.prepare('SELECT COUNT(*) AS n FROM ' + name).get().n;
    }
    for (const name of ['analysis_jobs','notification_jobs']) {
      if (tables.has(name)) output.runtime_work[name] = database.prepare('SELECT status,COUNT(*) AS n FROM ' + name + ' GROUP BY status').all();
    }
    output.sqlite_integrity = database.prepare('PRAGMA quick_check').get().quick_check;
  } finally { database.close(); }
  if (!observe) {
    const token = config.hooks?.token;
    const unauthorized = await request('/liveabit/activity', { value: {} });
    const missing = await request('/liveabit/activity', { key: token, value: {} });
    output.probes.receipt_rejects_unauthenticated = unauthorized.status === 401;
    output.probes.receipt_missing_message = missing.status === 400 && missing.body?.format === 'liveabit.activity-receipt.v1'
      && missing.body?.error === 'activity_message_required';
    const mainContext = await request('/tools/invoke', { key: config.gateway?.auth?.token,
      value: { tool: 'liveabit_context', args: { days: 1 }, sessionKey: settings.mainSessionKey ?? settings.sessionKey } });
    output.probes.main_context_http_status = mainContext.status;
    output.probes.main_context_transport_code = mainContext.transport_code ?? null;
    output.probes.main_context_ok = mainContext.status === 200 && mainContext.body?.ok === true;
    const foreign = await request('/tools/invoke', { key: config.gateway?.auth?.token,
      value: { tool: 'liveabit_context', args: { days: 1 }, sessionKey: 'agent:' + settings.agentId + ':liveabit-verification-foreign' } });
    output.probes.foreign_context_denied = foreign.status === 404;
    output.probes.foreign_context_http_status = foreign.status;
    // Null estimates remain evidence without scheduling a review or calling a
    // model. The exact generated empty row is removed afterwards, never usage.
    if (output.probes.receipt_missing_message) {
      const time = Date.now(), sourceId = randomUUID(), eventId = randomUUID();
      const event = { protocol_version: '0.2.0-draft.2', event_name: 'activity.observation', event_id: eventId,
        recipient_id: randomUUID(), stream_id: sourceId, subscription_id: randomUUID(), scope_revision: 1, sequence: 1,
        emitted_at: new Date(time - 1000).toISOString(), expires_at: new Date(time - 61000 + 86400000).toISOString(),
        window: { window_id: randomUUID(), start: new Date(time - 61000).toISOString(), end: new Date(time - 1000).toISOString() },
        observation: { metric: 'foreground_duration', unit: 'millisecond', coverage: 'unknown', quality: 'unverified_estimate',
          apps: [{ application: { namespace: 'android', id: 'org.liveabit.synthetic' }, foreground_duration_ms: null, transition_count: 0 }] } };
      const body = canonical(event), payload = { message: body };
      const wireHash = hash(JSON.stringify(payload));
      output.probes.synthetic_event_id = eventId;
      output.probes.synthetic_source = event.recipient_id + ':' + sourceId;
      output.probes.synthetic_body_sha256 = hash(body);
      try {
        const accepted = await request('/liveabit/activity', { key: token, value: payload });
        const repeated = await request('/liveabit/activity', { key: token, value: payload });
        output.probes.empty_receipt_http_status = accepted.status;
        output.probes.empty_receipt_transport_code = accepted.transport_code ?? null;
        output.probes.empty_receipt_error = typeof accepted.body?.error === 'string' ? accepted.body.error : null;
        output.probes.durable_empty_receipt = accepted.status === 200 && accepted.body?.durable === true
          && accepted.body?.event_id === eventId && accepted.body?.body_sha256 === wireHash
          && accepted.body?.disposition === 'empty' && accepted.body?.analysis_scheduled === false;
        output.probes.durable_duplicate_receipt = repeated.status === 200 && repeated.body?.disposition === 'duplicate'
          && repeated.body?.original_admission === 'empty' && repeated.body?.body_sha256 === wireHash;
      } finally {
        const cleanup = new DatabaseSync(settings.databasePath);
        try {
          cleanup.exec('PRAGMA busy_timeout=5000;PRAGMA foreign_keys=ON');
          const removed = cleanup.prepare("DELETE FROM events WHERE source=? AND event_id=? AND hash=? AND admission='empty'")
            .run(event.recipient_id + ':' + sourceId, eventId, hash(body)).changes;
          output.probes.synthetic_empty_row_removed = removed === 1;
        } finally { cleanup.close(); }
      }
    }
  }
  return output;
}
check().then(value => console.log(JSON.stringify(value))).catch(() => {
  console.log(JSON.stringify({ format: 'liveabit.personal-agent.host-check.v1', checked_at: new Date().toISOString(),
    check_completed: false, reason: 'host_check_unavailable', private_error_details_printed: false }));
  process.exitCode = 1;
});
