// Durable pre-dispatch intent only. A native invocation still has its separate,
// non-replayable notification reservation in ActivityStore.
import { createHash, randomUUID } from 'node:crypto';

const FRESH_MS = 15 * 60000;
export const DELIVERY_LEASE_MS = 60000;
export const DELIVERY_MAX_CHECKS = 8;
const assert = (value, code) => { if (!value) throw new Error(code); };
export const deliveryPolicyHash = policy => createHash('sha256').update(JSON.stringify(
  Object.fromEntries(Object.keys(policy).sort().map(key => [key, policy[key]])))).digest('hex');

export function ensureDeliverySchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS notification_jobs (
    decision_id TEXT PRIMARY KEY REFERENCES decisions(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL, session_key TEXT NOT NULL, node_id TEXT NOT NULL,
    policy_hash TEXT NOT NULL, created INTEGER NOT NULL, next_attempt INTEGER NOT NULL,
    expires INTEGER NOT NULL, checks INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL, reason TEXT, lease TEXT, lease_until INTEGER);
    CREATE INDEX IF NOT EXISTS notification_jobs_due ON notification_jobs(status,next_attempt);`);
}

export function enqueueDelivery(store, { decisionId, agentId, sessionKey, policy }) {
  ensureDeliverySchema(store.db);
  return store.transaction(() => {
    store.prune();
    const time = store.now(), decision = store.notificationDecision(decisionId, agentId, sessionKey);
    const attempt = store.db.prepare('SELECT outcome FROM notifications WHERE decision_id=?').get(decisionId);
    const prior = store.db.prepare('SELECT * FROM notification_jobs WHERE decision_id=?').get(decisionId);
    if (prior) {
      assert(prior.agent_id === agentId && prior.session_key === sessionKey, 'decision_unavailable');
      return attempt ? { ...prior, status: 'settled', reason: 'already_attempted' } : prior;
    }
    let expires = decision.created + FRESH_MS;
    if (decision.event_id) {
      const event = store.event(decision.event_id);
      expires = event ? Math.min(expires, event.end + FRESH_MS, event.expires) : time;
    }
    const reason = attempt ? 'already_attempted' : expires <= time ? 'stale_decision' : null;
    // Do not deliver an older waiting suggestion after the model requests a new one.
    // An in-flight reservation is left alone; its durable one-attempt guard wins.
    if (!reason) store.db.prepare(`UPDATE notification_jobs SET status='settled',reason='superseded',lease=NULL,lease_until=NULL
      WHERE agent_id=? AND session_key=? AND (status='queued' OR (status='checking' AND NOT EXISTS
        (SELECT 1 FROM notifications n WHERE n.decision_id=notification_jobs.decision_id)))`).run(agentId, sessionKey);
    assert(store.db.prepare("SELECT COUNT(*) AS n FROM notification_jobs WHERE status<>'settled'").get().n < 16,
      'delivery_queue_full');
    store.db.prepare('INSERT INTO notification_jobs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      decisionId, agentId, sessionKey, policy.node_id, deliveryPolicyHash(policy), time, time, expires, 0,
      reason ? 'settled' : 'queued', reason, null, null);
    return store.db.prepare('SELECT * FROM notification_jobs WHERE decision_id=?').get(decisionId);
  });
}

export function claimDelivery(store, { agentId, sessionKey, decisionId } = {}) {
  ensureDeliverySchema(store.db);
  return store.transaction(() => {
    store.prune(); const time = store.now();
    store.db.prepare(`UPDATE notifications SET outcome='uncertain',settled=?,reason='interrupted_invocation'
      WHERE outcome='reserved' AND created<=?`).run(time, time - DELIVERY_LEASE_MS);
    store.db.prepare(`UPDATE notification_jobs SET status='settled',reason='stale_decision',lease=NULL,lease_until=NULL
      WHERE agent_id=? AND session_key=? AND status<>'settled' AND expires<=?`).run(agentId, sessionKey, time);
    store.db.prepare(`UPDATE notification_jobs SET status='queued',lease=NULL,lease_until=NULL
      WHERE agent_id=? AND session_key=? AND status='checking' AND lease_until<=?`).run(agentId, sessionKey, time);
    const query = `SELECT * FROM notification_jobs WHERE agent_id=? AND session_key=? AND status='queued'
      AND next_attempt<=? ${decisionId ? 'AND decision_id=?' : ''} ORDER BY created DESC LIMIT 1`;
    const args = [agentId, sessionKey, time]; if (decisionId) args.push(decisionId);
    const row = store.db.prepare(query).get(...args);
    if (!row) return null;
    const previous = store.db.prepare('SELECT outcome FROM notifications WHERE decision_id=?').get(row.decision_id);
    if (previous) {
      store.db.prepare("UPDATE notification_jobs SET status='settled',reason='already_attempted' WHERE decision_id=?").run(row.decision_id);
      return null;
    }
    const lease = randomUUID();
    store.db.prepare("UPDATE notification_jobs SET status='checking',checks=checks+1,lease=?,lease_until=? WHERE decision_id=?")
      .run(lease, time + DELIVERY_LEASE_MS, row.decision_id);
    return { ...row, status: 'checking', checks: row.checks + 1, lease, lease_until: time + DELIVERY_LEASE_MS };
  });
}

export function currentDelivery(store, job) {
  ensureDeliverySchema(store.db);
  const row = store.db.prepare('SELECT * FROM notification_jobs WHERE decision_id=?').get(job.decision_id);
  assert(row && row.status === 'checking' && row.lease === job.lease
    && row.expires > store.now() && row.lease_until > store.now(), 'delivery_cancelled');
  store.notificationDecision(job.decision_id, job.agent_id, job.session_key);
  return row;
}

export function finishDelivery(store, job, reason) {
  ensureDeliverySchema(store.db);
  return store.transaction(() => {
    const changed = store.db.prepare(`UPDATE notification_jobs SET status='settled',reason=?,lease=NULL,lease_until=NULL
      WHERE decision_id=? AND status='checking' AND lease=?`).run(reason, job.decision_id, job.lease).changes;
    return { delivery_queued: false, reason, changed: changed === 1 };
  });
}

export function deferDelivery(store, job, reason) {
  ensureDeliverySchema(store.db);
  return store.transaction(() => {
    const time = store.now(), delay = Math.min(240000, 30000 * 2 ** Math.max(0, job.checks - 1));
    const settled = job.checks >= DELIVERY_MAX_CHECKS || time + delay >= job.expires;
    const terminal = time >= job.expires ? 'stale_decision' : settled ? 'connectivity_retry_exhausted' : reason;
    const changed = store.db.prepare(`UPDATE notification_jobs SET status=?,reason=?,next_attempt=?,lease=NULL,lease_until=NULL
      WHERE decision_id=? AND status='checking' AND lease=?`).run(settled ? 'settled' : 'queued', terminal,
      Math.min(time + delay, job.expires), job.decision_id, job.lease).changes;
    return { delivery_queued: !settled && changed === 1, reason: terminal,
      ...(settled ? {} : { next_check_at: new Date(Math.min(time + delay, job.expires)).toISOString() }) };
  });
}

export function cancelDeliveriesInTransaction(store, { agentId, sessionKey }, reason) {
  ensureDeliverySchema(store.db);
  return store.db.prepare(`UPDATE notification_jobs SET status='settled',reason=?,lease=NULL,lease_until=NULL
    WHERE agent_id=? AND session_key=? AND (status='queued' OR (status='checking' AND NOT EXISTS
      (SELECT 1 FROM notifications n WHERE n.decision_id=notification_jobs.decision_id)))`).run(reason, agentId, sessionKey).changes;
}

export function cancelDeliveries(store, owner, reason) {
  return store.transaction(() => cancelDeliveriesInTransaction(store, owner, reason));
}

export function deliveryStatus(store, decisionId) {
  ensureDeliverySchema(store.db);
  const row = store.db.prepare('SELECT status,reason,created,next_attempt,expires,checks FROM notification_jobs WHERE decision_id=?').get(decisionId);
  return row ? { ...row, notification_attempted: false,
    limitation: 'Queue state records pre-dispatch intent; inspect notifications for any native invocation.' } : null;
}
