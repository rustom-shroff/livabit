import test from 'node:test';
import assert from 'node:assert/strict';
import filter from '../integrations/openclaw/liveabit-activity.mjs';

function packet(apps) {
  const now = Date.now();
  return { message: 'liveabit activity data\n' + JSON.stringify({
    event_name: 'activity.observation', protocol_version: '0.2.0-draft.2',
    window: { start: new Date(now - 2000).toISOString(), end: new Date(now - 1000).toISOString() },
    expires_at: new Date(now + 3600_000).toISOString(),
    observation: { coverage: 'unknown', quality: 'unverified_estimate', apps }
  }) };
}

test('installed gateway transform preserves missing-message validation for non-admitting connection checks', () => {
  assert.deepEqual(filter({ payload: {} }), {});
});
test('gateway transform drops empty, unknown and transition-only activity before model dispatch', () => {
  for (const apps of [[], [null], [{foreground_duration_ms: null, transition_count: 7}],
    [{foreground_duration_ms: 0, transition_count: 2}], [{foreground_duration_ms: '10'}]]) {
    assert.equal(filter({ payload: packet(apps) }), null);
  }
});
test('gateway transform forwards original meaningful bytes when only one app has usage', () => {
  const payload = packet([{foreground_duration_ms: null}, {foreground_duration_ms: 100, transition_count: 0}]);
  assert.deepEqual(filter({ payload }), { message: payload.message });
});
test('gateway transform does not dispatch expired or malformed observations', () => {
  const payload = packet([{foreground_duration_ms: 100}]);
  const event = JSON.parse(payload.message.slice(payload.message.indexOf('{')));
  event.expires_at = new Date(Date.now() - 1).toISOString();
  assert.equal(filter({ payload: {message: JSON.stringify(event)} }), null);
  for (const message of ['operator text', '{', 'null', '{}']) assert.equal(filter({ payload: {message} }), null);
});
