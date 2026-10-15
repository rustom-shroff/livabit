// Durable review obligations share the observation transaction and database.
// A lease owns local coordination, not proof that a model or user saw anything.
import { randomUUID } from 'node:crypto';

export const REVIEW_DEFAULTS = Object.freeze({ coalesceMs: 300000, leaseMs: 90000,
  maxAgeMs: 900000, maxAttempts: 5, retryBaseMs: 30000, retryMaxMs: 300000 });
export const REVIEW_RUN_PREFIX = 'liveabit-review-';
const check = (value, code) => { if (!value) throw new Error(code); };
const owner = value => {
  check(typeof value.agentId === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(value.agentId)
    && typeof value.sessionKey === 'string' && value.sessionKey.startsWith(`agent:${value.agentId}:`)
    && value.sessionKey.length <= 256, 'invalid_review_owner');
};
export function ensureAnalysisSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS analysis_state (
    agent_id TEXT NOT NULL, session_key TEXT NOT NULL, requested_generation INTEGER NOT NULL DEFAULT 0,
    completed_generation INTEGER NOT NULL DEFAULT 0, pending_due INTEGER, last_completed INTEGER,
    last_outcome TEXT, pending_reason TEXT, followup_count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(agent_id,session_key));
    CREATE TABLE IF NOT EXISTS analysis_events (
      source TEXT NOT NULL, event_id TEXT NOT NULL, agent_id TEXT NOT NULL, session_key TEXT NOT NULL,
      generation INTEGER NOT NULL, PRIMARY KEY(source,event_id,agent_id,session_key),
      FOREIGN KEY(source,event_id) REFERENCES events(source,event_id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS analysis_jobs (
      agent_id TEXT NOT NULL, session_key TEXT NOT NULL, id TEXT NOT NULL UNIQUE,
      created INTEGER NOT NULL, updated INTEGER NOT NULL, due INTEGER NOT NULL, deadline INTEGER NOT NULL,
      target_generation INTEGER, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      lease_token TEXT, lease_until INTEGER, run_id TEXT, last_error TEXT, reason TEXT NOT NULL,
      admission_key TEXT NOT NULL, message TEXT,
      PRIMARY KEY(agent_id,session_key));
    CREATE TABLE IF NOT EXISTS analysis_decisions (
      review_id TEXT PRIMARY KEY, decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
      run_id TEXT, followup_due INTEGER);
    CREATE INDEX IF NOT EXISTS analysis_event_generation ON analysis_events(agent_id,session_key,generation);`);
  if (!db.prepare('PRAGMA table_info(analysis_jobs)').all().some(column => column.name === 'admission_key')) {
    db.exec('ALTER TABLE analysis_jobs ADD COLUMN admission_key TEXT');
    db.exec('UPDATE analysis_jobs SET admission_key=id WHERE admission_key IS NULL');
  }
  if (!db.prepare('PRAGMA table_info(analysis_jobs)').all().some(column => column.name === 'message'))
    db.exec('ALTER TABLE analysis_jobs ADD COLUMN message TEXT');
  if (!db.prepare('PRAGMA table_info(analysis_state)').all().some(column => column.name === 'pending_reason')) {
    db.exec('ALTER TABLE analysis_state ADD COLUMN pending_reason TEXT');
  }
  if (!db.prepare('PRAGMA table_info(analysis_state)').all().some(column => column.name === 'followup_count'))
    db.exec('ALTER TABLE analysis_state ADD COLUMN followup_count INTEGER NOT NULL DEFAULT 0');
  if (!db.prepare('PRAGMA table_info(analysis_decisions)').all().some(column => column.name === 'followup_due'))
    db.exec('ALTER TABLE analysis_decisions ADD COLUMN followup_due INTEGER');
}
// Caller must already own the store's IMMEDIATE transaction.
export function requestAnalysis(store, { agentId, sessionKey, dueAt = store.now(), reason = 'activity', event, reviewId } = {}) {
  owner({ agentId, sessionKey });
  const time = store.now();
  check(Number.isSafeInteger(dueAt) && dueAt >= 0 && dueAt <= time + 86400000, 'invalid_review_time');
  dueAt = Math.max(dueAt, time);
  check(['activity', 'user_reply', 'agent_followup'].includes(reason), 'invalid_review_reason');
  const db = store.db;
  db.prepare('INSERT OR IGNORE INTO analysis_state(agent_id,session_key) VALUES (?,?)').run(agentId, sessionKey);
  const previous = event && db.prepare('SELECT generation FROM analysis_events WHERE source=? AND event_id=? AND agent_id=? AND session_key=?')
    .get(event.source, event.eventId, agentId, sessionKey);
  if (previous) return { scheduled: false, duplicate: true, generation: previous.generation };
  if (reason === 'agent_followup') {
    const decision = typeof reviewId === 'string' && db.prepare('SELECT a.followup_due,d.episode_id FROM analysis_decisions a JOIN decisions d ON d.id=a.decision_id JOIN episodes e ON e.id=d.episode_id WHERE a.review_id=? AND e.agent_id=?')
      .get(reviewId, agentId);
    if (!decision) return { scheduled: false, reason: 'record_review_decision_first' };
    store.ownedEpisode(decision.episode_id, agentId, sessionKey);
    if (decision.followup_due != null) return { scheduled: false, duplicate: true, due_at: new Date(decision.followup_due).toISOString() };
    if (db.prepare('SELECT followup_count FROM analysis_state WHERE agent_id=? AND session_key=?').get(agentId, sessionKey).followup_count >= 3)
      return { scheduled: false, reason: 'followup_budget_exhausted', resumes_on: 'fresh_activity_or_linked_user_report' };
    db.prepare('UPDATE analysis_state SET followup_count=followup_count+1 WHERE agent_id=? AND session_key=?').run(agentId, sessionKey);
    db.prepare('UPDATE analysis_decisions SET followup_due=? WHERE review_id=?').run(dueAt, reviewId);
  } else db.prepare('UPDATE analysis_state SET followup_count=0 WHERE agent_id=? AND session_key=?').run(agentId, sessionKey);
  const expired = db.prepare('SELECT * FROM analysis_jobs WHERE agent_id=? AND session_key=? AND deadline<=?').get(agentId, sessionKey, time);
  if (expired) {
    // A new current observation must not inherit an outage's expired deadline.
    // Settle all old obligations before adding this new generation.
    expired.target_generation = db.prepare('SELECT requested_generation AS n FROM analysis_state WHERE agent_id=? AND session_key=?').get(agentId, sessionKey).n;
    replaceAfterSettlement(store, expired, 'expired');
    db.prepare('UPDATE analysis_state SET pending_due=NULL,pending_reason=NULL WHERE agent_id=? AND session_key=?').run(agentId, sessionKey);
  }
  const generation = db.prepare('UPDATE analysis_state SET requested_generation=requested_generation+1,pending_due=MIN(COALESCE(pending_due,?),?) WHERE agent_id=? AND session_key=? RETURNING requested_generation')
    .get(dueAt, dueAt, agentId, sessionKey).requested_generation;
  db.prepare('UPDATE analysis_state SET pending_reason=CASE WHEN ?=\'user_reply\' THEN ? ELSE COALESCE(pending_reason,?) END WHERE agent_id=? AND session_key=?')
    .run(reason, reason, reason, agentId, sessionKey);
  if (event) db.prepare('INSERT INTO analysis_events VALUES (?,?,?,?,?)').run(event.source, event.eventId, agentId, sessionKey, generation);
  const existing = db.prepare('SELECT * FROM analysis_jobs WHERE agent_id=? AND session_key=?').get(agentId, sessionKey);
  if (!existing) {
    const id = randomUUID();
    db.prepare('INSERT INTO analysis_jobs(agent_id,session_key,id,created,updated,due,deadline,target_generation,status,attempts,lease_token,lease_until,run_id,last_error,reason,admission_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(agentId, sessionKey,
      id, time, time, dueAt, dueAt + REVIEW_DEFAULTS.maxAgeMs, null, 'queued', 0, null, null, null, null, reason, id);
  } else if (existing.target_generation == null) {
    // New activity never pushes an existing deadline away from the user.
    db.prepare('UPDATE analysis_jobs SET due=MIN(due,?),deadline=MIN(deadline,?),updated=?,reason=CASE WHEN ?=\'user_reply\' THEN ? ELSE reason END WHERE agent_id=? AND session_key=?')
      .run(dueAt, dueAt + REVIEW_DEFAULTS.maxAgeMs, time, reason, reason, agentId, sessionKey);
  }
  return { scheduled: true, generation, due_at: new Date(existing && existing.target_generation == null ? Math.min(existing.due, dueAt) : dueAt).toISOString() };
}
export function scheduleAnalysis(store, request) { return store.transaction(() => requestAnalysis(store, request)); }

const replaceAfterSettlement = (store, job, outcome) => {
  const db = store.db, time = store.now();
  db.prepare('UPDATE analysis_state SET completed_generation=MAX(completed_generation,?),last_completed=?,last_outcome=? WHERE agent_id=? AND session_key=?')
    .run(job.target_generation ?? 0, time, outcome, job.agent_id, job.session_key);
  const state = db.prepare('SELECT * FROM analysis_state WHERE agent_id=? AND session_key=?').get(job.agent_id, job.session_key);
  db.prepare('DELETE FROM analysis_jobs WHERE agent_id=? AND session_key=?').run(job.agent_id, job.session_key);
  if (state.requested_generation > state.completed_generation) {
    const due = state.pending_due ?? time;
    const id = randomUUID();
    db.prepare('INSERT INTO analysis_jobs(agent_id,session_key,id,created,updated,due,deadline,target_generation,status,attempts,lease_token,lease_until,run_id,last_error,reason,admission_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(job.agent_id, job.session_key,
      id, time, time, due, due + REVIEW_DEFAULTS.maxAgeMs, null, 'queued', 0, null, null, null, null, state.pending_reason ?? 'activity', id);
  }
};
export function claimAnalysis(store, { agentId, sessionKey, leaseMs = REVIEW_DEFAULTS.leaseMs } = {}) {
  owner({ agentId, sessionKey });
  check(Number.isInteger(leaseMs) && leaseMs >= 1000 && leaseMs <= 300000, 'invalid_review_lease');
  return store.transaction(() => {
    const time = store.now(), db = store.db;
    let job = db.prepare('SELECT * FROM analysis_jobs WHERE agent_id=? AND session_key=?').get(agentId, sessionKey);
    if (!job || job.due > time || (job.lease_until != null && job.lease_until > time)) return null;
    if (job.deadline <= time || (job.attempts >= REVIEW_DEFAULTS.maxAttempts && !job.run_id)) {
      if (job.target_generation == null) job.target_generation = db.prepare('SELECT requested_generation AS n FROM analysis_state WHERE agent_id=? AND session_key=?').get(agentId, sessionKey).n;
      replaceAfterSettlement(store, job, job.deadline <= time ? 'expired' : 'attempts_exhausted');
      return null;
    }
    const token = randomUUID();
    if (job.target_generation == null) {
      const target = db.prepare('SELECT requested_generation AS n FROM analysis_state WHERE agent_id=? AND session_key=?').get(agentId, sessionKey).n;
      db.prepare('UPDATE analysis_state SET pending_due=NULL,pending_reason=NULL WHERE agent_id=? AND session_key=?').run(agentId, sessionKey);
      db.prepare('UPDATE analysis_jobs SET target_generation=? WHERE agent_id=? AND session_key=?').run(target, agentId, sessionKey);
    }
    db.prepare('UPDATE analysis_jobs SET lease_token=?,lease_until=?,status=\'claimed\',updated=? WHERE agent_id=? AND session_key=?')
      .run(token, time + leaseMs, time, agentId, sessionKey);
    job = db.prepare('SELECT * FROM analysis_jobs WHERE agent_id=? AND session_key=?').get(agentId, sessionKey);
    return { ...job };
  });
}
export function ownedAnalysis(store, job) {
  const current = store.db.prepare('SELECT * FROM analysis_jobs WHERE agent_id=? AND session_key=? AND id=? AND lease_token=?')
    .get(job.agent_id, job.session_key, job.id, job.lease_token);
  check(current && current.lease_until > store.now() && current.deadline > store.now(), 'review_lease_unavailable');
  return current;
}
export function activeAnalysis(store, job) {
  const current = store.db.prepare('SELECT * FROM analysis_jobs WHERE agent_id=? AND session_key=? AND id=? AND admission_key=?')
    .get(job.agent_id, job.session_key, job.id, job.admission_key);
  check(current && current.deadline > store.now() && current.target_generation === job.target_generation
    && current.attempts > 0, 'review_lease_unavailable');
  return current;
}
export function beginAnalysisDispatch(store, job) {
  return store.transaction(() => {
    const current = ownedAnalysis(store, job);
    check(!current.run_id && current.attempts < REVIEW_DEFAULTS.maxAttempts, 'review_dispatch_unavailable');
    store.db.prepare('UPDATE analysis_jobs SET attempts=attempts+1,updated=? WHERE id=?').run(store.now(), job.id);
  });
}
export function saveAnalysisMessage(store, job, message) {
  check(typeof message === 'string' && Buffer.byteLength(message) <= 53248, 'review_context_unavailable');
  return store.transaction(() => {
    const current = ownedAnalysis(store, job);
    if (current.message != null) return current.message;
    store.db.prepare('UPDATE analysis_jobs SET message=? WHERE id=?').run(message, job.id);
    return message;
  });
}
export function attachAnalysisRun(store, job, runId) {
  check(typeof runId === 'string' && runId.length > 0 && runId.length <= 256, 'invalid_review_run');
  return store.transaction(() => {
    const current = ownedAnalysis(store, job);
    check(!current.run_id || current.run_id === runId, 'conflicting_review_run');
    store.db.prepare('UPDATE analysis_jobs SET run_id=?,status=\'running\',updated=? WHERE id=?').run(runId, store.now(), job.id);
  });
}
export function releaseAnalysis(store, job, { outcome = 'pending', error = null } = {}) {
  check(['ok', 'pending', 'error', 'admission_unknown'].includes(outcome), 'invalid_review_outcome');
  return store.transaction(() => {
    const current = ownedAnalysis(store, job), time = store.now();
    if (outcome === 'ok') {
      const recorded = Boolean(store.db.prepare('SELECT 1 FROM analysis_decisions WHERE review_id=?').get(current.id));
      // Successful native completion does not prove the model recorded a
      // choice. Settle the work without inventing silence or replaying a run.
      replaceAfterSettlement(store, current, recorded ? 'ok' : 'completed_without_decision');
      return { completed: true, decision_recorded: recorded };
    }
    if (outcome === 'error') {
      // A known failed run needs a fresh idempotency identity; its decisions and
      // delivery reservations remain in the evidence ledger to prevent repeats.
      if (current.attempts >= REVIEW_DEFAULTS.maxAttempts) { replaceAfterSettlement(store, current, 'attempts_exhausted'); return { completed: false, exhausted: true }; }
      store.db.prepare('UPDATE analysis_jobs SET run_id=NULL,admission_key=? WHERE id=?').run(randomUUID(), current.id);
    }
    const delay = outcome === 'pending' ? 15000 : Math.min(REVIEW_DEFAULTS.retryMaxMs,
      REVIEW_DEFAULTS.retryBaseMs * 2 ** Math.max(0, current.attempts - 1));
    store.db.prepare('UPDATE analysis_jobs SET due=?,lease_token=NULL,lease_until=NULL,status=\'queued\',last_error=?,updated=? WHERE agent_id=? AND session_key=?')
      .run(time + delay, error == null ? null : String(error).slice(0, 80), time, job.agent_id, job.session_key);
    return { completed: false, retry_at: new Date(time + delay).toISOString() };
  });
}
export function analysisEvidence(store, job) {
  ownedAnalysis(store, job);
  const state = store.db.prepare('SELECT completed_generation FROM analysis_state WHERE agent_id=? AND session_key=?').get(job.agent_id, job.session_key);
  const bind = [job.agent_id, job.session_key, state.completed_generation, job.target_generation];
  const count = store.db.prepare('SELECT COUNT(*) AS n FROM analysis_events WHERE agent_id=? AND session_key=? AND generation>? AND generation<=?').get(...bind).n;
  const rows = store.db.prepare(`SELECT e.event_id,e.start,e.end,e.expires,e.apps FROM analysis_events a
    JOIN events e ON e.source=a.source AND e.event_id=a.event_id WHERE a.agent_id=? AND a.session_key=?
    AND a.generation>? AND a.generation<=? ORDER BY a.generation DESC LIMIT 16`).all(...bind).reverse();
  return { review_id: job.id, reason: job.reason, observation_count: count, included_observations: rows.map(row => ({
    ...row, apps: JSON.parse(row.apps) })), presentation_limit: 16,
    limitation: 'Only the latest 16 admitted windows appear here; daily summaries include retained eligible windows. Activity is retrospective and may have stopped.' };
}
