import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCompanionBackground, parseCompanionHealth } from '../scripts/lib/companion-background-health.mjs';

const packageInfo = `Packages:\n  Package [ai.openclaw.app] (abc):\n    versionName=2026.9.80\n    User 0: installed=true stopped=false suspended=false\n      android.permission.POST_NOTIFICATIONS: granted=true`;
test('Android inspection distinguishes an installed app from a running foreground service', () => {
  const missing = parseCompanionHealth({ packageInfo });
  assert.equal(missing.installed, true);
  assert.equal(missing.version, '2026.9.80');
  assert.equal(missing.foreground_service_record, false);
  assert.equal(missing.foreground_service_running, null);
  assert.equal(missing.interpretation, 'background_service_not_confirmed');
  assert.equal(missing.notification_permission, true);
  const running = parseCompanionHealth({ packageInfo, serviceInfo: 'ServiceRecord{abc ai.openclaw.app/.NodeForegroundService}\n isForeground=true foregroundId=1',
    whitelist: 'system,other.app,1000\nuser,ai.openclaw.app,12345', notificationOp: 'POST_NOTIFICATION: allow', sdk: '36' });
  assert.equal(running.foreground_service_running, true);
  assert.equal(running.battery_optimization_exempt, true);
  assert.equal(running.notification_app_op, 'allow');
  assert.equal(running.android_sdk, 36);
  assert.match(running.interpretation, /connection_still_requires_gateway_check/);
});
test('force stop and denied notification permission remain explicit independent facts', () => {
  const report = parseCompanionHealth({ packageInfo: packageInfo.replace('stopped=false', 'stopped=true').replace('granted=true', 'granted=false'),
    serviceInfo: 'ServiceRecord{abc ai.openclaw.app/.NodeForegroundService}\n isForeground=false',
    whitelist: 'user,ai.openclaw.app.debug,12345', notificationOp: 'POST_NOTIFICATION: ignore' });
  assert.equal(report.stopped, true);
  assert.equal(report.notification_permission, false);
  assert.equal(report.foreground_service_running, false);
  assert.equal(report.battery_optimization_exempt, false);
  assert.equal(report.interpretation, 'android_force_stopped_requires_user_launch');
});
test('an absent, unauthorized, or ambiguous device performs no shell probes', () => {
  for (const inventory of ['', 'secret-serial unauthorized', 'one device\ntwo device']) {
    const calls = [];
    const reply = inspectCompanionBackground(args => { calls.push(args); return { status: 0, stdout: inventory }; });
    assert.equal(calls.length, 1);
    assert.equal(reply.device_details_printed, false);
    assert(!JSON.stringify(reply).includes('secret-serial'));
  }
});
test('all device commands are fixed read-only probes and raw private diagnostics are not emitted', () => {
  const calls = [], marker = 'private-address-token-notification';
  const report = inspectCompanionBackground(args => {
    calls.push(args);
    if (args[0] === 'devices') return { status: 0, stdout: `serial-secret device model:private` };
    if (args.includes('package')) return { status: 0, stdout: packageInfo + '\n' + marker };
    return { status: 0, stdout: marker };
  });
  assert.equal(calls.length, 6);
  assert.deepEqual(calls.slice(1).map(args => args.slice(3)), [
    ['dumpsys', 'package', 'ai.openclaw.app'], ['dumpsys', 'activity', 'services', 'ai.openclaw.app'],
    ['dumpsys', 'deviceidle', 'whitelist'], ['cmd', 'appops', 'get', 'ai.openclaw.app', 'POST_NOTIFICATION'],
    ['getprop', 'ro.build.version.sdk']
  ]);
  assert(!JSON.stringify(report).includes(marker));
  assert(!JSON.stringify(report).includes('serial-secret'));
  assert.equal(report.commands_changed_device, false);
  assert.equal(report.notification_sent, false);
});
