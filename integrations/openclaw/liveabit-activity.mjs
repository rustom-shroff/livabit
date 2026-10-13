// This runs inside the final OpenClaw gateway. It is not a relay or Android prototype.
export default function liveabitActivity({ payload }) {
  // Preserve OpenClaw's safe missing-message validation for the Android connection check.
  if (!payload || typeof payload.message !== 'string' || !payload.message.trim()) return {};
  const beginning = payload.message.indexOf('{');
  if (beginning < 0) return null;
  let event;
  try { event = JSON.parse(payload.message.slice(beginning)); } catch { return null; }
  if (!event || event.event_name !== 'activity.observation'
      || !['0.2.0-draft.1', '0.2.0-draft.2'].includes(event.protocol_version)
      || event.observation?.coverage !== 'unknown' || event.observation?.quality !== 'unverified_estimate'
      || !Array.isArray(event.observation.apps) || event.observation.apps.length > 32) return null;
  const start = Date.parse(event.window?.start), end = Date.parse(event.window?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 900_000
      || !Number.isFinite(Date.parse(event.expires_at)) || Date.parse(event.expires_at) <= Date.now()) return null;
  if (!event.observation.apps.some(app => Number.isSafeInteger(app?.foreground_duration_ms)
      && app.foreground_duration_ms > 0 && app.foreground_duration_ms <= end - start)) return null;
  // Keep the original observation/time/identity. The Skill interprets it as untrusted data.
  return { message: payload.message };
}
