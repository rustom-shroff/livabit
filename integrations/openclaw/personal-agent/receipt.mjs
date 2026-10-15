// A plugin-authenticated data endpoint. It never admits a model run.
import { createHash, timingSafeEqual } from 'node:crypto';
import { parseActivityMessage } from './observation.mjs';
import { readSettings, withStore } from './runtime.mjs';
import { REVIEW_DEFAULTS } from './analysis-store.mjs';

export const RECEIPT_PATH = '/liveabit/activity';
export const RECEIPT_FORMAT = 'liveabit.activity-receipt.v1';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function receiveActivity(payload, settings, { now = Date.now } = {}) {
  if (!payload || typeof payload.message !== 'string') throw new Error('activity_message_required');
  if (settings.format !== 'liveabit.personal-agent.settings.v2' || settings.analysisEnabled !== true
    || settings.sessionKey === settings.mainSessionKey) throw new Error('invalid_personal_agent_settings');
  const parsed = parseActivityMessage(payload.message, now());
  const receipt = withStore(settings, store => {
    store.now = now;
    return store.admit(parsed, { analysis: { agentId: settings.agentId, sessionKey: settings.sessionKey,
      dueAt: now() + (settings.analysisCoalesceMs ?? REVIEW_DEFAULTS.coalesceMs), reason: 'activity' } });
  });
  return { ok: true, format: RECEIPT_FORMAT, durable: true, event_id: parsed.event.event_id,
    disposition: receipt.disposition, analysis_scheduled: receipt.analysis_scheduled === true,
    ...(receipt.original_admission ? { original_admission: receipt.original_admission } : {}) };
}
export function receiptHandler({ getToken, getSettings = readSettings, now = Date.now } = {}) {
  return async (req, res) => {
    const reply = (status, value) => {
      res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(value));
    };
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); reply(405, { ok: false, error: 'method_not_allowed' }); return true; }
    const expected = getToken?.();
    const supplied = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    // Compare fixed-size digests, and reject absent/oversized credentials before
    // opening storage. The phone key remains the existing separate hook token.
    if (typeof expected !== 'string' || !expected || supplied.length > 4096
      || !timingSafeEqual(createHash('sha256').update(supplied).digest(), createHash('sha256').update('Bearer ' + expected).digest())) {
      reply(401, { ok: false, error: 'unauthorized' }); return true;
    }
    if (!/^application\/json(?:\s*;.*)?$/i.test(req.headers['content-type'] ?? '')) {
      reply(415, { ok: false, error: 'json_required' }); return true;
    }
    let bytes;
    try {
      const chunks = []; let length = 0;
      bytes = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(new Error('body_timeout')); }, 5000); timer.unref?.();
        const cleanup = () => { clearTimeout(timer); req.off('data', data); req.off('end', end); req.off('error', fail); req.off('aborted', fail); };
        const fail = () => { cleanup(); reject(new Error('invalid_activity')); };
        const data = chunk => {
          length += chunk.length;
          if (length > 65536) { cleanup(); reject(new Error('body_too_large')); return; }
          chunks.push(chunk);
        };
        const end = () => { cleanup(); resolve(Buffer.concat(chunks)); };
        req.on('data', data); req.on('end', end); req.on('error', fail); req.on('aborted', fail);
      });
      // Validate current settings and token again after asynchronous body reads.
      if (getToken() !== expected) { reply(401, { ok: false, error: 'unauthorized' }); return true; }
      const value = receiveActivity(JSON.parse(bytes.toString('utf8')), getSettings(), { now });
      reply(200, { ...value, body_sha256: sha256(bytes) });
    } catch (error) {
      const reason = error?.message;
      const status = reason === 'storage_quota' || reason === 'invalid_personal_agent_settings' ? 503
        : reason === 'body_too_large' ? 413 : reason === 'body_timeout' ? 408
          : ['conflicting_duplicate', 'conflicting_identity', 'overlapping_stream_window'].includes(reason) ? 409
            : error instanceof SyntaxError || ['invalid_observation', 'invalid_activity', 'activity_message_required'].includes(reason) ? 400 : 503;
      reply(status, { ok: false, format: RECEIPT_FORMAT, error: status === 503 ? 'storage_unavailable'
        : status === 409 ? 'conflicting_activity' : reason === 'activity_message_required' ? 'activity_message_required' : 'invalid_activity' });
    }
    return true;
  };
}
