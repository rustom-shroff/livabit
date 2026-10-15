// Read-only Android probes. Deliberately exclude notification text, logcat,
// account data, network addresses, and app preferences from the result.
export const COMPANION_PACKAGE = 'ai.openclaw.app';
const unknownBoolean = (raw, positive, negative) => positive.test(raw) ? true : negative.test(raw) ? false : null;

export function parseCompanionHealth({ packageInfo = '', serviceInfo = '', whitelist = '', notificationOp = '', sdk = '' }) {
  const installed = /Package \[ai\.openclaw\.app\]/.test(packageInfo);
  const permissionMatch = packageInfo.match(/android\.permission\.POST_NOTIFICATIONS:\s*granted=(true|false)/);
  const version = packageInfo.match(/^\s*versionName=([A-Za-z0-9.+_-]{1,80})\s*$/m)?.[1] ?? null;
  const userState = packageInfo.match(/^\s*User 0:[^\r\n]*/m)?.[0] ?? '';
  const serviceDeclared = /ai\.openclaw\.app\/(?:\.NodeForegroundService|ai\.openclaw\.app\.NodeForegroundService)/.test(serviceInfo);
  const foreground = serviceDeclared ? unknownBoolean(serviceInfo, /(?:isForeground|foreground)\s*=\s*true\b/, /(?:isForeground|foreground)\s*=\s*false\b/) : null;
  const appOp = notificationOp.match(/(?:POST_NOTIFICATION|POST_NOTIFICATIONS):\s*(allow|ignore|deny|default|foreground)\b/i)?.[1]?.toLowerCase() ?? null;
  const exemption = whitelist.trim() ? whitelist.split(/\r?\n/).some(line => /(?:^|,)ai\.openclaw\.app(?:,|$)/.test(line.trim())) : null;
  return {
    package: COMPANION_PACKAGE, installed, version: installed ? version : null,
    android_sdk: /^\d{1,3}$/.test(sdk.trim()) ? Number(sdk.trim()) : null,
    stopped: installed ? unknownBoolean(userState, /\bstopped=true\b/, /\bstopped=false\b/) : null,
    suspended: installed ? unknownBoolean(userState, /\bsuspended=true\b/, /\bsuspended=false\b/) : null,
    notification_permission: permissionMatch ? permissionMatch[1] === 'true' : null,
    notification_app_op: appOp,
    foreground_service_record: serviceDeclared,
    foreground_service_running: foreground,
    battery_optimization_exempt: exemption,
    interpretation: !installed ? 'companion_not_detected'
      : /\bstopped=true\b/.test(userState) ? 'android_force_stopped_requires_user_launch'
      : foreground === false || !serviceDeclared ? 'background_service_not_confirmed'
      : foreground === true ? 'foreground_service_observed_connection_still_requires_gateway_check'
      : 'service_state_unknown',
    limitations: [
      'A foreground service record does not prove a connected authenticated node or notification display.',
      'Battery exemption alone does not guarantee delivery and this inspection changes no settings.',
      'OEM restrictions, reboot recovery, process restoration and network loss require lifecycle tests.'
    ]
  };
}

export function inspectCompanionBackground(runAdb, serial) {
  const inventory = runAdb(['devices', '-l']);
  if (inventory.status !== 0) return { result: 'adb_unavailable', device_details_printed: false };
  const devices = inventory.stdout.split(/\r?\n/).map(line => line.match(/^(\S+)\s+(device|offline|unauthorized)(?:\s|$)/))
    .filter(Boolean).map(match => ({ serial: match[1], status: match[2] }));
  const eligible = devices.filter(device => device.status === 'device' && (!serial || device.serial === serial));
  if (eligible.length !== 1) return { result: eligible.length > 1 ? 'select_one_device' : 'no_authorized_device',
    attached_device_count: devices.length, device_details_printed: false };
  const probe = args => {
    const reply = runAdb(['-s', eligible[0].serial, 'shell', ...args]);
    return reply.status === 0 ? reply.stdout : '';
  };
  const report = parseCompanionHealth({
    packageInfo: probe(['dumpsys', 'package', COMPANION_PACKAGE]),
    serviceInfo: probe(['dumpsys', 'activity', 'services', COMPANION_PACKAGE]),
    whitelist: probe(['dumpsys', 'deviceidle', 'whitelist']),
    notificationOp: probe(['cmd', 'appops', 'get', COMPANION_PACKAGE, 'POST_NOTIFICATION']),
    sdk: probe(['getprop', 'ro.build.version.sdk'])
  });
  return { format: 'liveabit.companion-background-inspection.v1', result: 'read_only_inspection',
    ...report, commands_changed_device: false, notification_sent: false, device_details_printed: false };
}
