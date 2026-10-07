// Owned synthetic UI tests only. Every adb operation is pinned to the dedicated emulator.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const INSPECT = 'org.liveabit.inspect', FIXTURE = 'org.liveabit.fixture';
const allowedFocusedPackages = new Set([INSPECT, FIXTURE, 'com.android.settings', 'android', 'com.android.intentresolver']);
const viewportAttemptLimit = 3, viewportRetryDelayMillis = 250, hierarchyViewportPairLimit = 3;
const imeDiagnosticSources = [
  { kind: 'window_all', command: ['dumpsys', 'window', '-a'], suffix: 'window-all.txt' },
  { kind: 'input_method', command: ['dumpsys', 'input_method'], suffix: 'input-method.txt' },
  { kind: 'display_after', command: ['dumpsys', 'window', 'displays'], suffix: 'window-displays-after.txt' }
];
const launchImeSourceLimit = 7, launchImeRecordLimit = 20;
const launchImeSources = [
  { kind: 'display_before', command: ['dumpsys', 'window', 'displays'], suffix: 'window-displays-before.txt' },
  { kind: 'window_all', command: ['dumpsys', 'window', '-a'], suffix: 'window-all.txt' },
  { kind: 'input_method', command: ['dumpsys', 'input_method'], suffix: 'input-method.txt' },
  { kind: 'display_before_back', command: ['dumpsys', 'window', 'displays'], suffix: 'window-displays-before-back.txt' },
  { kind: 'input_method_after_back', command: ['dumpsys', 'input_method'], suffix: 'input-method-after-back.txt' },
  { kind: 'window_after_back', command: ['dumpsys', 'window', '-a'], suffix: 'window-all-after-back.txt' },
  { kind: 'display_after_back', command: ['dumpsys', 'window', 'displays'], suffix: 'window-displays-after-back.txt' }
];
const profiles = new Map([
  ['emulator-5580', { serial: 'emulator-5580', avd: 'liveabit-api35-test', api: 35,
    setup: 'docs/review/android-emulator-setup.json', setupScope: 'project_local_android_emulator_tool_setup_only',
    setupResult: 'pass_tool_setup_only', extension: 13 }],
  ['emulator-5582', { serial: 'emulator-5582', avd: 'liveabit-api36-test', api: 36,
    setup: 'docs/review/android-api36-emulator-setup.json', setupScope: 'project_local_api36_image_setup_only',
    setupResult: 'pass_image_setup_only', extension: 17 }]
]);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const validHash = value => /^[a-f0-9]{64}$/.test(value ?? '');
const normalizedLocalPath = value => path.resolve(value).toLowerCase();
function ownedProfile(targetSerial, avd) {
  const profile = profiles.get(targetSerial);
  assert(profile && (avd === undefined || avd === profile.avd),
    'Only the fixed owned pairs API 35/emulator-5580 or API 36/emulator-5582 are authorized. Physical devices, cross-pairs and API 37 are rejected.');
  return profile;
}
function validateStartupProfile(run, profile, avdPath) {
  assert(run.serial === profile.serial && run.name === profile.avd && run.api === profile.api
    && typeof run.avd_path === 'string' && normalizedLocalPath(run.avd_path) === normalizedLocalPath(avdPath)
    && run.image === `system-images;android-${profile.api};default;x86_64` && run.image_revision === 2
    && run.emulator_version === '37.2.12' && ['on', 'off'].includes(run.cpu_acceleration)
    && run.graphics === 'software' && run.os_settings_changed === false && run.contains_personal_data === false
    && Number.isInteger(run.pid) && run.pid > 0, 'Startup differs from the fixed owned profile or its local-only scope.');
  if (profile.api === 36) {
    assert(run.setup_report === profile.setup && validHash(run.setup_report_sha256)
      && run.cpu_acceleration === 'on' && run.acceleration_backend === 'WHPX' && run.memory_megabytes === 2048
      && validHash(run.config_sha256) && validHash(run.avd_registration_sha256)
      && Number.isInteger(run.owned_tree_entries_checked) && run.owned_tree_entries_checked >= 0
      && run.owned_tree_entries_checked <= 10000, 'API 36 startup lacks its fixed setup/configuration provenance.');
    for (const [field, filename] of [['writable_data_path', 'userdata-qemu.img'], ['writable_cache_path', 'cache.img'], ['writable_sdcard_path', 'sdcard.img']])
      assert(typeof run[field] === 'string' && path.isAbsolute(run[field])
        && normalizedLocalPath(run[field]) === normalizedLocalPath(path.join(avdPath, filename)),
      'API 36 recorded writable paths differ from their exact owned AVD files.');
  }
}
function validateSetupBinding(profile, run, setup, identities) {
  assert(setup.result === profile.setupResult && setup.scope === profile.setupScope
    && setup.license_file_created_or_modified === false && setup.emulator_started === false,
  'The fixed image setup report did not pass within its setup-only scope.');
  assert(['setup', 'image_properties', 'image_registration', 'emulator_properties'].every(field => validHash(identities[field])),
    'A bound SDK identity hash is malformed or missing.');
  const imageId = `system-images;android-${profile.api};default;x86_64`;
  if (profile.api === 35) {
    const image = setup.packages?.filter(pkg => pkg.package_id === imageId);
    const emulator = setup.packages?.filter(pkg => pkg.package_id === 'emulator');
    assert(image?.length === 1 && emulator?.length === 1 && image[0].revision === '2'
      && image[0].api === 35 && image[0].abi === 'x86_64' && image[0].tag === 'default'
      && image[0].layout?.source_properties_sha256 === identities.image_properties
      && image[0].layout?.registration?.sha256 === identities.image_registration
      && emulator[0].revision === '37.2.12' && emulator[0].layout?.source_properties_sha256 === identities.emulator_properties,
    'API 35 installed SDK identities differ from their verified setup report.');
  } else {
    assert(setup.pin?.package_id === imageId && setup.pin.api === 36 && setup.pin.revision === '2'
      && setup.pin.abi === 'x86_64' && setup.pin.tag === 'default' && setup.pin.extension_level === '17'
      && setup.pin.reused_emulator_revision === '37.2.12'
      && setup.layout?.directory === 'artifacts/android-sdk/system-images/android-36/default/x86_64'
      && setup.layout.source_properties_sha256 === identities.image_properties
      && setup.layout.registration_sha256 === identities.image_registration
      && Number.isInteger(setup.layout.files_verified_against_archive) && setup.layout.files_verified_against_archive > 0
      && setup.layout.file_sha256 && Object.keys(setup.layout.file_sha256).length === setup.layout.files_verified_against_archive
      && Object.values(setup.layout.file_sha256).every(validHash),
    'API 36 installed SDK identities differ from their archive-verified setup report.');
  }
  const startupHasSetup = run.setup_report !== undefined || run.setup_report_sha256 !== undefined;
  assert((profile.api === 35 && !startupHasSetup)
    || (run.setup_report === profile.setup && run.setup_report_sha256 === identities.setup),
  'The startup setup-report byte hash differs from the current bound setup record.');
  return { source: profile.setup, sha256: identities.setup, result: setup.result, scope: setup.scope,
    api: profile.api, image: imageId, image_revision: 2, emulator_version: '37.2.12',
    setup_bytes_match_startup_hash: startupHasSetup, legacy_startup_setup_binding_absent: !startupHasSetup,
    image_source_properties_sha256: identities.image_properties, image_registration_sha256: identities.image_registration,
    emulator_source_properties_sha256: identities.emulator_properties, actual_small_sdk_identity_files_hashed: true,
    large_image_files_rehashed_by_ui_harness: false, runtime_verified_by_setup: false };
}
async function readLocalIdentity(name) {
  const target = path.resolve(root, name);
  assert(normalizedLocalPath(target).startsWith(normalizedLocalPath(root) + path.sep)
    && normalizedLocalPath(await realpath(target)) === normalizedLocalPath(target), 'Owned provenance input is outside an ordinary project-local path.');
  const info = await stat(target);
  assert(info.isFile() && info.size > 0 && info.size <= 2 * 1024 * 1024, 'Owned provenance file size/type is unsupported.');
  const bytes = await readFile(target);
  assert(bytes.length === info.size, 'Owned provenance input changed during reading.');
  return bytes;
}
function profileSelfTests() {
  const h = 'a'.repeat(64), identities = { setup: h, image_properties: h, image_registration: h, emulator_properties: h };
  let passed = 0, rejected = 0;
  const fixture = api => {
    const profile = profiles.get(api === 35 ? 'emulator-5580' : 'emulator-5582');
    const avdPath = path.resolve(root, 'artifacts/android-emulator/avd', `${profile.avd}.avd`);
    const run = { serial: profile.serial, name: profile.avd, api, avd_path: avdPath,
      image: `system-images;android-${api};default;x86_64`, image_revision: 2, emulator_version: '37.2.12',
      cpu_acceleration: 'on', graphics: 'software', os_settings_changed: false, contains_personal_data: false, pid: 1 };
    const setup = { result: profile.setupResult, scope: profile.setupScope, license_file_created_or_modified: false, emulator_started: false };
    if (api === 35) setup.packages = [
      { package_id: run.image, revision: '2', api: 35, abi: 'x86_64', tag: 'default', layout: { source_properties_sha256: h, registration: { sha256: h } } },
      { package_id: 'emulator', revision: '37.2.12', layout: { source_properties_sha256: h } }
    ];
    else {
      Object.assign(run, { setup_report: profile.setup, setup_report_sha256: h, acceleration_backend: 'WHPX', memory_megabytes: 2048,
        config_sha256: h, avd_registration_sha256: h, owned_tree_entries_checked: 1,
        writable_data_path: path.join(avdPath, 'userdata-qemu.img'), writable_cache_path: path.join(avdPath, 'cache.img'), writable_sdcard_path: path.join(avdPath, 'sdcard.img') });
      setup.pin = { package_id: run.image, api: 36, revision: '2', abi: 'x86_64', tag: 'default', extension_level: '17', reused_emulator_revision: '37.2.12' };
      setup.layout = { directory: 'artifacts/android-sdk/system-images/android-36/default/x86_64', source_properties_sha256: h,
        registration_sha256: h, files_verified_against_archive: 1, file_sha256: { 'artifacts/android-sdk/system-images/android-36/default/x86_64/system.img': h } };
    }
    return { profile, avdPath, run, setup };
  };
  for (const api of [35, 36]) {
    const value = fixture(api); assert(ownedProfile(value.profile.serial).api === api, 'Default profile differs.');
    validateStartupProfile(value.run, value.profile, value.avdPath); validateSetupBinding(value.profile, value.run, value.setup, identities); passed++;
  }
  const reject = work => { let failed = false; try { work(); } catch { failed = true; } assert(failed, 'Invalid pure profile/binding self-test was accepted.'); rejected++; };
  for (const [target, avd] of [['phone', undefined], ['emulator-5584', 'liveabit-api37-test'], ['emulator-5580', 'liveabit-api36-test'], ['emulator-5582', 'liveabit-api35-test'], ['emulator-5582', 'liveabit-api37-test']]) reject(() => ownedProfile(target, avd));
  for (const mutate of [value => { value.run.serial = 'emulator-5580'; }, value => { value.run.image_revision = 3; },
    value => { value.run.writable_data_path = path.resolve(root, 'outside-avd.img'); }, value => { value.run.config_sha256 = 'bad'; },
    value => { value.run.acceleration_backend = 'other'; }, value => { value.run.contains_personal_data = true; }]) {
    const value = fixture(36); mutate(value); reject(() => validateStartupProfile(value.run, value.profile, value.avdPath));
  }
  for (const mutate of [value => { value.run.setup_report_sha256 = 'b'.repeat(64); }, value => { value.setup.result = 'pending'; },
    value => { value.setup.pin.package_id = 'system-images;android-35;default;x86_64'; }, value => { value.setup.layout.registration_sha256 = 'b'.repeat(64); },
    value => { value.setup.license_file_created_or_modified = true; }]) {
    const value = fixture(36); mutate(value); reject(() => validateSetupBinding(value.profile, value.run, value.setup, identities));
  }
  for (const field of ['setup', 'image_properties', 'image_registration', 'emulator_properties']) {
    const value = fixture(36), incomplete = { ...identities }; delete incomplete[field];
    reject(() => validateSetupBinding(value.profile, value.run, value.setup, incomplete));
  }
  return { result: 'pass_pure_owned_profile_checks', valid_profiles: passed, rejected_profiles_or_bindings: rejected,
    device_accessed: false, files_written: false, runtime_verified: false };
}
if (process.argv.length === 3 && process.argv[2] === '--self-test') {
  console.log(JSON.stringify({ ...profileSelfTests(), viewport_checks: await viewportSelfTests(),
    ime_diagnostic_checks: await imeDiagnosticSelfTests(), launch_ime_checks: await launchImeSelfTests() })); process.exit(0);
}
const options = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const name = process.argv[i], value = process.argv[i + 1];
  if (!['--serial', '--expected-avd', '--idle-ms', '--timeout-minutes'].includes(name) || value === undefined || options.has(name))
    throw new Error('Use --serial emulator-5580|emulator-5582 [--expected-avd matching owned AVD] [--idle-ms 30000] [--timeout-minutes 90], or --self-test.');
  options.set(name, value);
}
const serial = options.get('--serial');
const profile = ownedProfile(serial, options.get('--expected-avd'));
const expectedAvd = profile.avd, expectedApi = profile.api;
const idleMillis = Number(options.get('--idle-ms') ?? '30000');
if (!Number.isInteger(idleMillis) || idleMillis < 10000 || idleMillis > 60000) throw new Error('Idle window must be 10000–60000 milliseconds.');
const timeoutMinutes = Number(options.get('--timeout-minutes') ?? '90');
if (!Number.isInteger(timeoutMinutes) || timeoutMinutes < 45 || timeoutMinutes > 120)
  throw new Error('Overall emulator suite timeout must be an integer from 45 to 120 minutes.');
const adbPath = path.join(root, 'artifacts/android-sdk/platform-tools/adb.exe');
const outputDir = path.join(root, 'artifacts/android-emulator-test');
const reportPath = path.join(root, 'docs/review/android-emulator-validation.json');
const packages = new Set([INSPECT, FIXTURE]);
let identityVerified = false, evidenceWritable = false, shotCount = 0, windowCheckCount = 0, stage = 'identity';
let width = 1080, height = 1920;
let viewport;
const overallTimeoutMillis = timeoutMinutes * 60 * 1000;
let commandDeadline = Date.now() + overallTimeoutMillis;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = {
  result: 'running', generated_at: new Date().toISOString(), scope: 'dedicated_owned_emulator_runtime_ui',
  environment: { serial, expected_avd: expectedAvd }, overall_timeout_millis: overallTimeoutMillis,
  cases: [], measurements: [], input_navigation: [], home_transitions: [], fixture_timing_context_resets: [],
  permission_controls: [], window_state_retries: [], launch_ime_recoveries: [], unsupported: [
    'Physical phone/OEM behavior, battery, background collection and direct agent delivery.',
    'Credential-storage lock before first unlock; ordinary keyguard lock is a different state.',
    '24-hour expiry, 4096-record overflow, unavailable-source injection and deterministic OS-query races.',
    'Clock mutation, rotation and split-screen/multi-resume are not exercised by this initial UI harness.',
    'FLAG_SECURE screenshots may be blank; saved UI hierarchy is the primary UI assertion source.'
  ], limitations: [
    'Only owned synthetic fixture activity is inspected; usage source completeness remains unknown.',
    'Comparison values entered by this harness remain unauthenticated manual values in the app.',
    'Fixture timing details attest displayed current core anchors and projected records, not original OS-query batch clocks or source completeness.',
    'The app time zone and UTC offset describe formatting at the report clock, not source time-zone metadata at event time.',
    'Observed timing differences do not establish a production accuracy threshold or other-app accuracy.'
  ], physical_android_verified: false, measured_production_accuracy_verified: false,
  m2_verified: false, m3_verified: false
};
async function save() { if (evidenceWritable) await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n'); }
async function adb(...args) {
  // No host shell and no unscoped device operation. Arguments never contain private input.
  if (!identityVerified && !['emu', 'get-state', 'shell'].includes(args[0])) throw new Error('Emulator identity has not been verified.');
  const remaining = commandDeadline - Date.now();
  assert(remaining > 0, 'The bounded emulator test time budget expired.');
  const { stdout } = await exec(adbPath, ['-s', serial, ...args], {
    cwd: root, timeout: Math.min(45000, remaining), maxBuffer: 8 * 1024 * 1024, windowsHide: true
  });
  return stdout;
}
const shell = (...args) => adb('shell', ...args);
function assert(ok, message) { if (!ok) throw new Error(message); }
function decode(value) {
  return value.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#([0-9]+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function nodes(xml) {
  return [...xml.matchAll(/<node\b([^>]*?)\/?\s*>/g)].map(match => {
    const node = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], decode(a[2])]));
    const bounds = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(node.bounds ?? '');
    if (bounds) node.box = bounds.slice(1).map(Number);
    return node;
  });
}
function parseViewport(dump, displayWidth, displayHeight) {
  const normalized = dump.replaceAll('\r', '');
  const start = normalized.indexOf('WindowInsetsStateController');
  assert(start >= 0, 'The current display InsetsState controller is missing.');
  const end = normalized.indexOf('InsetsSourceProviders:', start);
  assert(end > start, 'The current display InsetsState cannot be separated from cached providers.');
  const state = normalized.slice(start, end);
  const display = /mDisplayFrame=Rect\((-?\d+),\s*(-?\d+)\s*-\s*(-?\d+),\s*(-?\d+)\)/.exec(state);
  assert(display && display.slice(1).map(Number).every((n, i) => n === [0, 0, displayWidth, displayHeight][i]),
    'Actual display InsetsState dimensions differ from the owned emulator display.');
  const sources = [...state.matchAll(/^\s*InsetsSource id=\S+ type=(statusBars|navigationBars|ime) frame=\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\][^\n]*?\bvisible=(true|false)\b/gm)]
    .map(match => ({ type: match[1], frame: match.slice(2, 6).map(Number), visible: match[6] === 'true' }));
  assert(sources.some(source => source.type === 'statusBars') && sources.some(source => source.type === 'navigationBars')
    && sources.some(source => source.type === 'ime'), 'Current system-bar/IME inset sources were not explicitly reported.');
  const safe = { left: 0, top: 0, right: displayWidth, bottom: displayHeight };
  // Resolve bars first; a visible IME may end at the navigation bar's top edge.
  const occluders = [...sources.filter(source => source.type !== 'ime'), ...sources.filter(source => source.type === 'ime')];
  for (const source of occluders) {
    // Hidden IME visibleFrame and provider/control hints are deliberately irrelevant.
    if (!source.visible) continue;
    const [x1, y1, x2, y2] = source.frame;
    assert(x1 >= 0 && y1 >= 0 && x2 <= displayWidth && y2 <= displayHeight && x2 > x1 && y2 > y1,
      'A visible occluding inset has invalid or empty bounds.');
    if (source.type === 'ime' && x1 === 0 && x2 === displayWidth && y2 >= safe.bottom) safe.bottom = Math.min(safe.bottom, y1);
    else if (x1 === 0 && x2 === displayWidth && y2 === displayHeight) safe.bottom = Math.min(safe.bottom, y1);
    else if (x1 === 0 && x2 === displayWidth && y1 === 0) safe.top = Math.max(safe.top, y2);
    else if (y1 === 0 && y2 === displayHeight && x1 === 0) safe.left = Math.max(safe.left, x2);
    else if (y1 === 0 && y2 === displayHeight && x2 === displayWidth) safe.right = Math.min(safe.right, x1);
    else throw new Error('A visible floating/interior occluder has no safe rectangular content viewport.');
  }
  assert(safe.right - safe.left >= 100 && safe.bottom - safe.top >= 100, 'Visible insets leave no usable content viewport.');
  const focusedPackage = /mCurrentFocus=Window\{[^}\n]*\bu\d+\s+([A-Za-z0-9_.]+)\/[^}\n]*\}/.exec(normalized)?.[1] ?? null;
  return { source: 'current_display_visible_insets', display: { width: displayWidth, height: displayHeight },
    safe_content: safe, sources, focused_package: focusedPackage };
}
function bottomImeObservation(dump, displayWidth, displayHeight) {
  if (typeof dump !== 'string') return null;
  const normalized = dump.replaceAll('\r', '');
  if ([...normalized.matchAll(/WindowInsetsStateController/g)].length !== 1) return null;
  const start = normalized.indexOf('WindowInsetsStateController'), end = normalized.indexOf('InsetsSourceProviders:', start);
  if (end <= start) return null;
  const state = normalized.slice(start, end);
  const display = /mDisplayFrame=Rect\((-?\d+),\s*(-?\d+)\s*-\s*(-?\d+),\s*(-?\d+)\)/.exec(state)?.slice(1).map(Number);
  if (!display?.every((n, i) => n === [0, 0, displayWidth, displayHeight][i])) return null;
  const focus = /mCurrentFocus=(Window\{[^}\n]*\bu\d+\s+([A-Za-z0-9_.]+)\/[^}\n]*\})/.exec(normalized);
  if (!focus) return null;
  const sources = [];
  for (const type of ['statusBars', 'navigationBars', 'ime']) {
    const lines = [...state.matchAll(new RegExp(`^\\s*InsetsSource id=(\\S+) type=${type} frame=\\[(-?\\d+),(-?\\d+)\\]\\[(-?\\d+),(-?\\d+)\\]([^\\n]*)`, 'gm'))];
    if (lines.length !== 1) return null;
    const line = lines[0], visibility = /\bvisible=(true|false)\b/.exec(line[6]);
    if (!visibility) return null;
    const visibleFrame = /\bvisibleFrame=\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(line[6]);
    sources.push({ id: line[1], type, frame: line.slice(2, 6).map(Number), visible: visibility[1] === 'true',
      visible_frame: visibleFrame ? visibleFrame.slice(1).map(Number) : null });
  }
  return { display, focus_window: focus[1], focused_package: focus[2], sources };
}
function exactBottomZeroImeTrigger(dump, displayWidth, displayHeight, failure) {
  if (failure !== 'A visible occluding inset has invalid or empty bounds.') return false;
  const observed = bottomImeObservation(dump, displayWidth, displayHeight);
  if (!observed || observed.focused_package !== INSPECT) return false;
  const [status, navigation, ime] = observed.sources, target = [0, displayHeight, displayWidth, displayHeight];
  return status.visible && navigation.visible && status.frame[0] === 0 && status.frame[1] === 0
    && status.frame[2] === displayWidth && status.frame[3] > 0 && status.frame[3] < navigation.frame[1]
    && navigation.frame[0] === 0 && navigation.frame[2] === displayWidth && navigation.frame[3] === displayHeight
    && navigation.frame[1] < displayHeight && ime.id === '3' && ime.visible
    && ime.frame.every((n, i) => n === target[i]) && Array.isArray(ime.visible_frame)
    && ime.visible_frame.every((n, i) => n === target[i]);
}
function imeSampleConsistency(before, after, displayWidth, displayHeight) {
  const first = bottomImeObservation(before, displayWidth, displayHeight), last = bottomImeObservation(after, displayWidth, displayHeight);
  if (!first || !last) return 'unknown';
  return JSON.stringify(first) === JSON.stringify(last) ? 'consistent_observed_geometry_and_focus' : 'changed_observed_geometry_or_focus';
}
async function captureImeDiagnosticSources(readSource, observe, clock = () => new Date().toISOString()) {
  for (const source of imeDiagnosticSources) {
    const metadata = { kind: source.kind, command: [...source.command], capture_started_at: clock() };
    let dump;
    try {
      dump = await readSource(source);
      assert(typeof dump === 'string' && Buffer.byteLength(dump, 'utf8') <= 8 * 1024 * 1024,
        'Complete diagnostic text is unavailable within the bounded output size.');
      metadata.raw_dump_available = true;
    } catch (error) { dump = null; metadata.raw_dump_available = false; metadata.unavailable_reason = error.message.slice(0, 1000); }
    metadata.capture_finished_at = clock();
    // Failure to persist an available source aborts; it cannot be relabeled unavailable.
    await observe({ metadata, dump, suffix: source.suffix });
  }
}
function uniqueImeMatch(text, expression, label) {
  const matches = [...text.matchAll(expression)];
  assert(matches.length === 1, `Launch IME recovery lacks a unique ${label}; no further gesture was authorized.`);
  return matches[0];
}
function exactInspectorFocus(dump) {
  assert(typeof dump === 'string', 'Launch IME recovery focus source is unavailable.');
  const focus = uniqueImeMatch(dump.replaceAll('\r', ''), /^\s*mCurrentFocus=(Window\{([a-f0-9]+) u(\d+) (org\.liveabit\.inspect\/org\.liveabit\.inspect\.MainActivity)\})$/gm, 'full inspector focus token');
  // A second focus line, including null/another owner, makes the sample ambiguous.
  assert([...dump.matchAll(/^\s*mCurrentFocus=/gm)].length === 1 && focus[3] === '0',
    'Launch IME recovery has ambiguous focus or a different user.');
  return focus[1];
}
function imeWindowBlocks(dump) {
  const normalized = dump.replaceAll('\r', '');
  const marker = 'WINDOW MANAGER WINDOWS (dumpsys window windows)';
  assert(normalized.split(marker).length === 2, 'Launch IME recovery lacks the full current window list.');
  const section = normalized.slice(normalized.indexOf(marker) + marker.length).split(/\nWINDOW MANAGER /)[0];
  const headers = [...section.matchAll(/^  Window #\d+ (Window\{[^}\n]+\}):$/gm)];
  assert(headers.length > 0 && headers.length <= 100, 'Launch IME recovery window list is absent or unbounded.');
  return headers.map((header, index) => ({ token: header[1], text: section.slice(header.index, headers[index + 1]?.index ?? section.length) }));
}
function imeWindowIdentity(block, expectedPackage) {
  const session = uniqueImeMatch(block.text, /^\s*mDisplayId=(\d+)(?: taskId=\d+)? mSession=Session\{[a-f0-9]+ (\d+):u(\d+)a(\d+)\} mClient=(android\.os\.BinderProxy@[a-f0-9]+)$/gm, 'window display/session/client');
  const owner = uniqueImeMatch(block.text, /^\s*mOwnerUid=(\d+) showForAllUsers=false package=([A-Za-z0-9_.]+) appop=NONE$/gm, 'window owner');
  const uid = Number(owner[1]), pid = Number(session[2]);
  assert(session[1] === '0' && session[3] === '0' && uid > 10000 && pid > 0
    && uid === Number(session[4]) && owner[2] === expectedPackage,
  'Launch IME recovery window owner/session identity differs from the owned display/user/package.');
  return { window: block.token, client_binder: session[5], uid, pid, display: 0, user: 0 };
}
function checkedLaunchImeBinding(displayDump, windowDump, inputDump, displayWidth, displayHeight, { hidden = false, prior = null } = {}) {
  assert([displayDump, windowDump, inputDump].every(value => typeof value === 'string' && value.length > 0),
    'Launch IME recovery lacks complete current source text.');
  const focus = exactInspectorFocus(displayDump), wm = windowDump.replaceAll('\r', ''), im = inputDump.replaceAll('\r', '');
  assert(exactInspectorFocus(wm) === focus, 'Launch IME recovery full window focus differs from the display sample.');
  assert(uniqueImeMatch(wm, /^\s*mCurrentUserId=(\d+)$/gm, 'window-manager current user')[1] === '0',
    'Launch IME recovery is outside the owned user.');
  const observed = bottomImeObservation(displayDump, displayWidth, displayHeight);
  assert(observed?.focus_window === focus, 'Launch IME recovery cannot bind current source geometry to focus.');
  const blocks = imeWindowBlocks(wm), focused = blocks.filter(block => block.token === focus);
  const imes = blocks.filter(block => /\bty=INPUT_METHOD\b/.test(block.text));
  assert(focused.length === 1 && imes.length === 1 && /^Window\{[a-f0-9]+ u0 InputMethod\}$/.test(imes[0].token),
    'Launch IME recovery has ambiguous inspector or IME windows.');
  const owner = imeWindowIdentity(focused[0], INSPECT), keyboard = imeWindowIdentity(imes[0], 'com.android.inputmethod.latin');
  assert(/^\s*mHasSurface=true isReadyForDisplay\(\)=true /m.test(focused[0].text)
    && /^\s*Surface: shown=true\s+mDrawState=HAS_DRAWN\b/m.test(focused[0].text)
    && /^\s*isOnScreen=true$/m.test(focused[0].text) && /^\s*isVisible=true$/m.test(focused[0].text),
  'Launch IME recovery inspector window is not visibly drawn.');
  const attrs = uniqueImeMatch(imes[0].text, /^\s*fl=([^\n]+)$/gm, 'IME window flags')[1].split(/\s+/);
  assert(attrs.includes('NOT_FOCUSABLE'), 'Launch IME recovery IME modality is not the observed stock nonfocusable state.');
  const imeToken = uniqueImeMatch(imes[0].text, /\bmToken=WindowToken\{[a-f0-9]+ type=2011 (android\.os\.Binder@[a-f0-9]+)\}/g, 'IME system-server token')[1];
  const userHeaders = [...im.matchAll(/^  UserId=(\d+)$/gm)];
  const clientMarker = im.indexOf('\nInput method client state for '), serviceMarker = im.indexOf('\nInput method service state for ');
  assert(userHeaders.length === 1 && userHeaders[0][1] === '0' && clientMarker > userHeaders[0].index && serviceMarker > clientMarker
    && [...im.matchAll(/^Input method service state for /gm)].length === 1,
  'Launch IME recovery current manager/service sections are absent or ambiguous.');
  const manager = im.slice(userHeaders[0].index, clientMarker), service = im.slice(serviceMarker);
  assert(/^\nInput method service state for com\.android\.inputmethod\.latin\.LatinIME@[a-f0-9]+:/m.test(service),
    'Launch IME recovery service is not the connected stock LatinIME.');
  for (const field of ['mSelectedMethodId', 'mCurId'])
    assert(uniqueImeMatch(manager, new RegExp(`^\\s*${field}=(\\S+)$`, 'gm'), `manager ${field}`)[1] === 'com.android.inputmethod.latin/.LatinIME',
      'Launch IME recovery selected/connected IME differs.');
  for (const field of ['mHasMainConnection', 'mBoundToMethod'])
    assert(uniqueImeMatch(manager, new RegExp(`^\\s*${field}=(true|false)$`, 'gm'), `manager ${field}`)[1] === 'true',
      'Launch IME recovery IME is disconnected.');
  assert(uniqueImeMatch(manager, /^\s*mCurMethod=(com\.android\.server\.inputmethod\.IInputMethodInvoker@[a-f0-9]+)$/gm, 'connected manager method')
    && uniqueImeMatch(manager, /^\s*mCurToken=(android\.os\.Binder@[a-f0-9]+)$/gm, 'connected manager token')[1] === imeToken,
  'Launch IME recovery manager token differs from the IME window.');
  for (const field of ['mCurTokenDisplayId', 'mDisplayIdToShowIme', 'mBackDisposition'])
    assert(uniqueImeMatch(manager, new RegExp(`^\\s*${field}=(\\d+)$`, 'gm'), `manager ${field}`)[1] === '0',
      'Launch IME recovery IME display/back disposition differs from the observed owned state.');
  const clientExpressions = [/^\s*mCurClient=(ClientState\{[a-f0-9]+ mUid=(\d+) mPid=(\d+) mSelfReportedDisplayId=(\d+)\})$/gm,
    /^\s*mFocusedWindowClient=(ClientState\{[a-f0-9]+ mUid=(\d+) mPid=(\d+) mSelfReportedDisplayId=(\d+)\})$/gm];
  const clients = clientExpressions.map((expression, index) => uniqueImeMatch(manager, expression, `focused manager client ${index}`));
  assert(clients.every(client => Number(client[2]) === owner.uid && Number(client[3]) === owner.pid && client[4] === '0')
    && clients[0][1] === clients[1][1]
    && uniqueImeMatch(manager, /^\s*mFocusedWindow=(android\.os\.BinderProxy@[a-f0-9]+)$/gm, 'manager focused window')[1] === owner.client_binder,
  'Launch IME recovery manager focus/client differs from the inspector window.');
  const binding = uniqueImeMatch(service, /^\s*mInputBinding=InputBinding\{android\.os\.BinderProxy@[a-f0-9]+ \/ uid (\d+) \/ pid (\d+)\}$/gm, 'service input binding');
  const editor = uniqueImeMatch(service, /^\s*packageName=([A-Za-z0-9_.]+) autofillId=\S+ fieldId=\S+ fieldName=\S+$/gm, 'service editor package');
  assert(Number(binding[1]) === owner.uid && Number(binding[2]) === owner.pid && editor[1] === INSPECT,
    'Launch IME recovery service input/editor differs from the inspector owner.');
  const shown = uniqueImeMatch(manager, /^\s*mInputShown=(true|false)$/gm, 'manager input shown')[1] === 'true';
  const visibleBits = Number(uniqueImeMatch(manager, /^\s*mImeWindowVis=(\d+)$/gm, 'manager IME window visibility')[1]);
  const serviceVisible = uniqueImeMatch(service, /^\s*mDecorViewVisible=(true|false) mDecorViewWasVisible=(true|false) mWindowVisible=(true|false) mInShowWindow=(true|false)$/gm, 'service window visibility');
  const requested = uniqueImeMatch(service, /^\s*mShowInputRequested=(true|false) mLastShowInputRequested=(true|false) mShowInputFlags=0x[a-f0-9]+$/gm, 'service input request')[1] === 'true';
  const fullscreen = uniqueImeMatch(service, /^\s*mCandidatesVisibility=\d+ mFullscreenApplied=(true|false) mIsFullscreen=(true|false) mExtractViewHidden=(true|false)$/gm, 'service fullscreen state');
  assert(fullscreen[2] === 'false' && serviceVisible[4] === 'false', 'Launch IME recovery service is fullscreen or transitioning.');
  if (hidden) {
    assert(prior && focus === prior.owner.window && JSON.stringify(owner) === JSON.stringify(prior.owner)
      && JSON.stringify(keyboard) === JSON.stringify(prior.keyboard) && imeToken === prior.ime_token,
    'Launch IME recovery post-dismissal window/client identity changed.');
    assert(!shown && !requested && !(visibleBits & 2) && serviceVisible[1] === 'false' && serviceVisible[3] === 'false'
      && /^\s*isVisible=false$/m.test(imes[0].text) && /^\s*isOnScreen=false$/m.test(imes[0].text)
      && (/^\s*mHasSurface=false /m.test(imes[0].text) || /^\s*Surface: shown=false\s/m.test(imes[0].text))
      && observed.sources[2].visible === false,
    'Launch IME recovery did not confirm the keyboard hidden across current window/manager/service/source observations.');
  } else {
    assert(exactBottomZeroImeTrigger(displayDump, displayWidth, displayHeight, 'A visible occluding inset has invalid or empty bounds.')
      && shown && requested && visibleBits === 3 && serviceVisible[1] === 'true' && serviceVisible[3] === 'true'
      && /^\s*mHasSurface=true isReadyForDisplay\(\)=true /m.test(imes[0].text)
      && /^\s*Surface: shown=true\s+mDrawState=HAS_DRAWN\b/m.test(imes[0].text)
      && /^\s*isOnScreen=true$/m.test(imes[0].text) && /^\s*isVisible=true$/m.test(imes[0].text),
    'Launch IME recovery does not have the exact current shown-IME/requested-input state.');
  }
  return { owner, keyboard, ime_token: imeToken };
}
async function recoverInspectorLaunchIme({ api, packageName, record, readSource, observeSource, observeState,
  sendBack, invalidate, delay, readHierarchy, observeHierarchy, displayWidth, displayHeight, clock = () => new Date().toISOString() }) {
  if (api !== 36 || packageName !== INSPECT) return { result: 'outside_scope' };
  invalidate();
  const read = async index => {
    const source = launchImeSources[index], metadata = { kind: source.kind, command: [...source.command], capture_started_at: clock() };
    let dump;
    try {
      dump = await readSource(source);
      assert(typeof dump === 'string' && Buffer.byteLength(dump, 'utf8') <= 8 * 1024 * 1024, 'Launch IME source is not complete bounded text.');
      metadata.raw_dump_available = true;
    } catch (error) { dump = null; metadata.raw_dump_available = false; metadata.unavailable_reason = error.message.slice(0, 1000); }
    metadata.capture_finished_at = clock();
    await observeSource({ metadata, dump, suffix: source.suffix });
    record.sources.push(metadata); await observeState();
    assert(dump !== null, 'Launch IME recovery source unavailable; no further gesture was authorized.');
    return dump;
  };
  try {
    const before = await read(0);
    let failure;
    try { requireInteractionFocus(parseViewport(before, displayWidth, displayHeight), INSPECT); exactInspectorFocus(before); }
    catch (error) { failure = error.message; }
    if (!failure) { record.result = 'not_required'; record.finished_at = clock(); await observeState(); return { result: record.result }; }
    assert(exactBottomZeroImeTrigger(before, displayWidth, displayHeight, failure), 'Inspector launch window state does not permit the narrow IME dismissal recovery.');
    const window = await read(1), input = await read(2);
    const binding = checkedLaunchImeBinding(before, window, input, displayWidth, displayHeight);
    record.preconditions_verified = true;
    const beforeBack = await read(3);
    assert(exactBottomZeroImeTrigger(beforeBack, displayWidth, displayHeight, failure)
      && exactInspectorFocus(beforeBack) === binding.owner.window,
    'Inspector focus/IME geometry changed before dismissal; no BACK was sent.');
    record.same_focus_verified = true; record.back_send_attempted = true; record.back_started_at = clock();
    invalidate(); await observeState();
    let output;
    try { output = await sendBack(); }
    catch (error) { record.result = 'back_command_uncertain'; throw new Error(`Single IME dismissal command was uncertain; no retry: ${error.message}`); }
    record.back_finished_at = clock();
    if (typeof output !== 'string' || output.trim() !== '') {
      record.result = 'back_command_uncertain'; throw new Error('Single IME dismissal command returned unexpected output; no retry.');
    }
    record.back_command_completed = true; await observeState(); await delay(250);
    const afterInput = await read(4), xml = await readHierarchy(), afterWindow = await read(5), after = await read(6);
    const candidate = parseViewport(after, displayWidth, displayHeight);
    requireInteractionFocus(candidate, INSPECT);
    checkedLaunchImeBinding(after, afterWindow, afterInput, displayWidth, displayHeight, { hidden: true, prior: binding });
    requireInspectorLaunchHierarchy(xml, candidate);
    const saved = await observeHierarchy({ xml, viewport: candidate });
    record.post_launch_ui = saved.artifact; record.post_launch_viewport = saved.viewport_artifact;
    record.hierarchy_verified = true; record.ime_hidden_verified = true; record.result = 'recovered'; record.finished_at = clock();
    invalidate(); await observeState();
    return { result: record.result, viewport: candidate };
  } catch (error) {
    invalidate();
    record.result = record.back_send_attempted
      ? record.back_command_completed ? 'rejected_after_back' : 'back_command_uncertain' : 'rejected_before_back';
    record.finished_at = clock(); record.reason = error.message.slice(0, 1000); await observeState(); throw error;
  }
}
function requireInspectorLaunchHierarchy(xml, candidate) {
  assert(typeof xml === 'string' && xml.includes('<hierarchy'), 'Inspector launch recovery lacks a fresh hierarchy.');
  requireInteractionFocus(candidate, INSPECT);
  const buttons = new Set(['Add app', 'Open usage access settings', 'Start local session', 'Inspect now',
    'Stop and clear observations', 'Clear local data and selection', 'Compare a controlled test (optional)',
    'Hide controlled-test comparison', 'Compare retained records', 'Show fixture timing details', 'Hide fixture timing details']);
  const fields = new Set(['App identifiers, for example com.example.fixture', 'Fixture start time code',
    'Fixture end time code', 'Fixture callback duration (milliseconds)']);
  const expected = nodes(xml).filter(node => node.package === INSPECT && node.box?.[2] > node.box?.[0] && node.box?.[3] > node.box?.[1]
    && (node.class === 'android.widget.Button' && buttons.has(node.text)
      || node.class === 'android.widget.EditText' && fields.has(node.hint)));
  assert(new Set(expected.map(node => `${node.class}:${node.text || node.hint}`)).size >= 2
    && expected.some(node => node.class === 'android.widget.Button'),
  'Inspector launch recovery hierarchy lacks the expected owned MainActivity controls.');
}
async function recoverImeAfterInspectorLaunch() {
  assert(identityVerified && evidenceWritable && expectedApi === 36, 'Launch IME recovery is outside the verified owned API36 run.');
  assert(report.launch_ime_recoveries.length < launchImeRecordLimit, 'Inspector launch IME evidence exceeded its fixed record count.');
  const record = { id: report.launch_ime_recoveries.length + 1, scope: 'owned_api36_inspector_launch_ime_dismissal',
    device: { serial, api: expectedApi, avd: expectedAvd }, launched_package: INSPECT, stage, attempt_limit: 1,
    back_command: ['input', 'keyevent', '4'], geometry_accepted: false, cached_ui_invalidated: true,
    result: 'reading', back_send_attempted: false, back_command_completed: false,
    preconditions_verified: false, same_focus_verified: false, ime_hidden_verified: false, hierarchy_verified: false,
    started_at: new Date().toISOString(), sources: [] };
  report.launch_ime_recoveries.push(record); await save();
  await recoverInspectorLaunchIme({ api: expectedApi, packageName: INSPECT, record,
    displayWidth: width, displayHeight: height, readSource: source => shell(...source.command),
    observeSource: async ({ metadata, dump, suffix }) => {
      if (dump === null) return;
      const bytes = Buffer.from(dump, 'utf8');
      const name = `${String(record.id).padStart(4, '0')}-launch-ime-${sha256(report.generated_at).slice(0, 12)}-${suffix}`;
      await writeFile(path.join(outputDir, name), bytes, { flag: 'wx' });
      metadata.artifact = `artifacts/android-emulator-test/${name}`;
      metadata.sha256 = sha256(bytes); metadata.size_bytes = bytes.length;
    }, observeState: save, sendBack: () => shell('input', 'keyevent', '4'), invalidate: () => { viewport = undefined; }, delay: wait,
    readHierarchy: freshHierarchy,
    observeHierarchy: async ({ xml, viewport: candidate }) => {
      const name = `${String(++shotCount).padStart(4, '0')}-inspector-launch-after-ime-dismissal.xml`;
      const sidecar = name.replace(/\.xml$/, '.viewport.json');
      await writeFile(path.join(outputDir, name), xml);
      await writeFile(path.join(outputDir, sidecar), JSON.stringify(candidate, null, 2) + '\n');
      return { artifact: `artifacts/android-emulator-test/${name}`, viewport_artifact: `artifacts/android-emulator-test/${sidecar}` };
    } });
}
function requireInteractionFocus(candidate, expectedPackage = null) {
  assert(candidate && allowedFocusedPackages.has(candidate.focused_package),
    'A permitted owned app or stock Settings/picker is not focused; no UI gesture was sent.');
  assert(expectedPackage === null || candidate.focused_package === expectedPackage,
    'The focused package differs from the selected node package; no UI gesture was sent.');
}
async function collectValidatedViewport({ readDump, observe, delay, displayWidth, displayHeight, requireFocus = false }) {
  for (let attempt = 1; attempt <= viewportAttemptLimit; attempt++) {
    let dump, candidate, failure;
    try {
      dump = await readDump();
      assert(typeof dump === 'string', 'Window-state output is not text.');
      candidate = parseViewport(dump, displayWidth, displayHeight);
      if (requireFocus) requireInteractionFocus(candidate);
    } catch (error) { failure = error.message; }
    // Observation failures abort immediately rather than lose the rejected source evidence.
    await observe({ attempt, dump: typeof dump === 'string' ? dump : null, candidate: failure ? null : candidate, failure });
    if (!failure) return { viewport: candidate, attempts: attempt };
    if (attempt === viewportAttemptLimit)
      throw new Error(`Window state rejected after ${viewportAttemptLimit} read-only attempts: ${failure}`);
    await delay(viewportRetryDelayMillis);
  }
}
async function refreshViewport({ requireFocus = false } = {}) {
  // Never retain a previous safe rectangle while a new state is unknown or invalid.
  viewport = undefined;
  const check = { id: ++windowCheckCount, stage, require_permitted_focus: requireFocus,
    attempt_limit: viewportAttemptLimit, retry_delay_millis: viewportRetryDelayMillis, attempts: [] };
  let recorded = false;
  const observation = await collectValidatedViewport({
    readDump: () => shell('dumpsys', 'window', 'displays'), delay: wait, displayWidth: width, displayHeight: height, requireFocus,
    observe: async ({ attempt, dump, candidate, failure }) => {
      if (!failure && !recorded) return;
      assert(identityVerified && evidenceWritable, 'Rejected window-state evidence cannot be saved before owned runtime preflight.');
      const item = { attempt, observed_at: new Date().toISOString(), result: failure ? 'rejected' : 'accepted',
        raw_dump_available: dump !== null };
      if (dump !== null) {
        const bytes = Buffer.from(dump, 'utf8');
        assert(bytes.length <= 8 * 1024 * 1024, 'Window-state diagnostic exceeds the bounded command output size.');
        const name = `${String(check.id).padStart(4, '0')}-window-state-${sha256(report.generated_at).slice(0, 12)}-attempt-${attempt}.window-displays.txt`;
        await writeFile(path.join(outputDir, name), bytes, { flag: 'wx' });
        item.artifact = `artifacts/android-emulator-test/${name}`;
        item.sha256 = sha256(bytes); item.size_bytes = bytes.length;
      }
      if (failure) item.reason = failure;
      else item.validated_viewport = candidate;
      if (!recorded) { report.window_state_retries.push(check); recorded = true; }
      check.attempts.push(item);
      check.result = failure ? (attempt === viewportAttemptLimit ? 'exhausted' : 'retrying') : 'recovered';
      await save();
      if (exactBottomZeroImeTrigger(dump, width, height, failure)) {
        const evidence = { scope: 'diagnostic_only_visible_bottom_zero_ime',
          trigger_window_displays_sha256: item.sha256, trigger_observed_at: item.observed_at,
          device: { serial, api: expectedApi, avd: expectedAvd }, source_read_limit: imeDiagnosticSources.length,
          sequential_after_trigger: true, simultaneous_with_trigger: false, before_cleanup: true,
          geometry_accepted: false, gestures_sent_by_capture: 0, capture_complete: false, sampled_consistency_not_atomic_attestation: true,
          sampled_consistency: 'unknown', sources: [] };
        item.ime_supplemental_evidence = evidence; await save();
        await captureImeDiagnosticSources(source => shell(...source.command), async ({ metadata, dump: sourceDump, suffix }) => {
          if (sourceDump !== null) {
            const bytes = Buffer.from(sourceDump, 'utf8');
            const name = `${String(check.id).padStart(4, '0')}-window-state-${sha256(report.generated_at).slice(0, 12)}-attempt-${attempt}.${suffix}`;
            await writeFile(path.join(outputDir, name), bytes, { flag: 'wx' });
            metadata.artifact = `artifacts/android-emulator-test/${name}`;
            metadata.sha256 = sha256(bytes); metadata.size_bytes = bytes.length;
          }
          evidence.sources.push(metadata);
          if (metadata.kind === 'display_after') evidence.sampled_consistency = imeSampleConsistency(dump, sourceDump, width, height);
          await save();
        });
        evidence.capture_complete = true; await save();
      }
    }
  });
  viewport = observation.viewport;
  return observation;
}
function interactionViewport() {
  requireInteractionFocus(viewport);
  return viewport.safe_content;
}
async function freshHierarchy() {
  const ownedDump = '/sdcard/liveabit-owned-test-ui.xml';
  let xml;
  for (let attempt = 0; attempt < 3; attempt++) {
    // A failed/idle-timeout dump can exit successfully. Never accept an older XML file.
    await shell('rm', '-f', ownedDump);
    let confirmation;
    try { confirmation = await shell('uiautomator', 'dump', ownedDump); }
    catch { if (attempt < 2) { await wait(500); continue; } throw new Error('Fresh UI hierarchy command failed after bounded retries.'); }
    if (!confirmation.includes(`dumped to: ${ownedDump}`)) {
      if (attempt < 2) { await wait(500); continue; }
      throw new Error('UI hierarchy dump did not confirm fresh output after bounded retries.');
    }
    try { xml = await adb('exec-out', 'cat', ownedDump); }
    catch { if (attempt < 2) { await wait(500); continue; } throw new Error('Fresh UI hierarchy file was unavailable.'); }
    if (xml.includes('<hierarchy')) break;
    xml = undefined;
    if (attempt < 2) await wait(500);
  }
  assert(xml?.includes('<hierarchy'), 'Fresh UI hierarchy was not returned.');
  return xml;
}
async function captureHierarchyWithViewport(readHierarchy, readViewport) {
  for (let pair = 1; pair <= hierarchyViewportPairLimit; pair++) {
    const xml = await readHierarchy();
    const observed = await readViewport();
    if (observed.attempts === 1) return { xml, viewport: observed.viewport, hierarchy_captures: pair };
    // A retry may outlive the hierarchy's node coordinates. Recapture instead of using them.
    if (pair === hierarchyViewportPairLimit)
      throw new Error('Fresh hierarchy could not be paired with a valid first-read viewport after bounded recapture.');
  }
}
async function snapshot(label = stage) {
  const captured = await captureHierarchyWithViewport(freshHierarchy, () => refreshViewport());
  const xml = captured.xml, capturedViewport = captured.viewport;
  const name = `${String(++shotCount).padStart(4, '0')}-${label.replace(/[^a-z0-9-]/gi, '-').slice(0, 70)}.xml`;
  await writeFile(path.join(outputDir, name), xml);
  const sidecarName = name.replace(/\.xml$/, '.viewport.json');
  await writeFile(path.join(outputDir, sidecarName), JSON.stringify(capturedViewport, null, 2) + '\n');
  return { nodes: nodes(xml), xml, artifact: `artifacts/android-emulator-test/${name}`,
    viewport_artifact: `artifacts/android-emulator-test/${sidecarName}`, viewport: capturedViewport,
    hierarchy_captures: captured.hierarchy_captures };
}
function visibleInViewport(node, candidate, requireEnabled = true) {
  if (!node.box || !candidate || (requireEnabled && node.enabled === 'false')) return false;
  const [x1, y1, x2, y2] = node.box;
  const safe = candidate.safe_content;
  return x2 > x1 && y2 > y1 && x1 >= safe.left && x2 <= safe.right
    && y1 >= safe.top + 4 && y2 <= safe.bottom - 4;
}
function visible(node, requireEnabled = true) { return visibleInViewport(node, viewport, requireEnabled); }
function rebindRecoveredNode(original, freshNodes, candidate) {
  requireInteractionFocus(candidate, original.package);
  const semanticFields = ['package', 'class', 'resource-id', 'text', 'content-desc', 'hint', 'checkable', 'checked',
    'clickable', 'long-clickable', 'password', 'scrollable', 'selected'];
  const matches = freshNodes.filter(node => node.enabled === 'true' && visibleInViewport(node, candidate)
    && semanticFields.every(field => (node[field] ?? '') === (original[field] ?? '')));
  assert(matches.length === 1, 'Recovered viewport has no unique semantically identical enabled node; no UI gesture was sent.');
  return matches[0];
}
async function tap(node) {
  const observed = await refreshViewport({ requireFocus: true });
  requireInteractionFocus(viewport, node.package);
  if (observed.attempts > 1) {
    const recovered = await snapshot('tap-after-window-state-recovery');
    node = rebindRecoveredNode(node, recovered.nodes, recovered.viewport);
  }
  interactionViewport();
  requireInteractionFocus(viewport, node.package);
  assert(visible(node), 'The selected UI element is not safely visible and enabled.');
  const [x1, y1, x2, y2] = node.box;
  await shell('input', 'tap', String(Math.floor((x1 + x2) / 2)), String(Math.floor((y1 + y2) / 2)));
  await wait(250);
}
async function viewportSelfTests() {
  const makeDump = ({ focus = INSPECT, ime = '[0,0][0,0]', imeVisible = false,
    status = '[0,0][1080,63]', navigation = '[0,1794][1080,1920]' } = {}) => [
    focus === null ? 'mCurrentFocus=null' : `mCurrentFocus=Window{abc u0 ${focus}/.OwnedActivity}`,
    'WindowInsetsStateController', '  mDisplayFrame=Rect(0, 0 - 1080, 1920)',
    `  InsetsSource id=1 type=statusBars frame=${status} visible=true`,
    `  InsetsSource id=2 type=navigationBars frame=${navigation} visible=true`,
    `  InsetsSource id=3 type=ime frame=${ime} visibleFrame=[0,1920][1080,1920] visible=${imeVisible}`,
    'InsetsSourceProviders:',
    '  mSource=InsetsSource id=3 type=ime frame=[0,900][1080,1920] visible=true'
  ].join('\n');
  const valid = makeDump(), emptyVisibleIme = makeDump({ imeVisible: true });
  let validParses = 0, rejectedParses = 0, rejectedFocus = 0, retryScenarios = 0, rejectedRebindings = 0;
  const rejection = async (work, fragment) => {
    let message;
    try { await work(); } catch (error) { message = error.message; }
    assert(message && (!fragment || message.includes(fragment)), 'A pure viewport rejection did not fail for the expected reason.');
  };
  const hidden = parseViewport(valid.replaceAll('\n', '\r\n'), 1080, 1920);
  assert(hidden.safe_content.top === 63 && hidden.safe_content.bottom === 1794
    && hidden.focused_package === INSPECT, 'Hidden IME or cached providers changed current visible bounds.'); validParses++;
  const shown = parseViewport(makeDump({ ime: '[0,1000][1080,1794]', imeVisible: true }), 1080, 1920);
  assert(shown.safe_content.bottom === 1000, 'Visible docked IME bounds were not excluded.'); validParses++;
  const side = parseViewport(makeDump({ status: '[0,0][63,1920]', navigation: '[1017,0][1080,1920]' }), 1080, 1920);
  assert(side.safe_content.left === 63 && side.safe_content.right === 1017, 'Visible side bars were not excluded.'); validParses++;
  const invalidDumps = [
    emptyVisibleIme, makeDump({ status: '[0,0][0,0]' }), makeDump({ navigation: '[0,0][0,0]' }),
    makeDump({ ime: '[100,100][980,900]', imeVisible: true }),
    makeDump({ status: '[-1,0][1080,63]' }), makeDump({ navigation: '[0,1794][1081,1920]' }),
    makeDump({ ime: '[0,63][1080,1794]', imeVisible: true }),
    valid.replace('Rect(0, 0 - 1080, 1920)', 'Rect(0, 0 - 720, 1280)'),
    valid.replace('type=ime', 'type=unknown'), valid.replace('WindowInsetsStateController', 'MissingController'),
    valid.replace('InsetsSourceProviders:', 'MissingProviders:'), valid.replace('mDisplayFrame=', 'missingDisplayFrame=')
  ];
  for (const dump of invalidDumps) { await rejection(() => parseViewport(dump, 1080, 1920)); rejectedParses++; }
  for (const focus of [null, 'org.unowned.app', 'com.android.launcher3']) {
    const candidate = parseViewport(makeDump({ focus }), 1080, 1920);
    await rejection(() => requireInteractionFocus(candidate), 'not focused'); rejectedFocus++;
  }
  const simulate = async (entries, requireFocus = false, observeOverride = null) => {
    const observed = [], delays = []; let reads = 0, result, failure;
    try {
      result = await collectValidatedViewport({ displayWidth: 1080, displayHeight: 1920, requireFocus,
        readDump: async () => { const item = entries[Math.min(reads++, entries.length - 1)]; if (item instanceof Error) throw item; return item; },
        observe: async item => { observed.push(item); if (observeOverride) await observeOverride(item); },
        delay: async millis => { delays.push(millis); } });
    } catch (error) { failure = error.message; }
    return { observed, delays, reads, result, failure };
  };
  const recovered = await simulate([emptyVisibleIme, valid], true);
  assert(recovered.result?.attempts === 2 && recovered.reads === 2 && recovered.delays.join() === '250'
    && recovered.observed[0].dump === emptyVisibleIme && recovered.observed[0].candidate === null
    && recovered.observed[1].dump === valid && recovered.observed[1].candidate.safe_content.bottom === 1794,
  'Retry did not preserve the rejected raw source and accept only the later valid source.'); retryScenarios++;
  for (const dump of [emptyVisibleIme, makeDump({ ime: '[100,100][980,900]', imeVisible: true }),
    makeDump({ focus: null }), makeDump({ focus: 'org.unowned.app' })]) {
    const failed = await simulate([dump], true);
    assert(failed.failure?.includes('after 3 read-only attempts') && failed.result === undefined
      && failed.reads === 3 && failed.delays.join() === '250,250'
      && failed.observed.length === 3 && failed.observed.every(item => item.candidate === null && item.dump === dump),
    'Persistent invalid geometry/focus was accepted or exceeded the finite retry budget.'); retryScenarios++;
  }
  const missing = await simulate([new Error('synthetic dump unavailable'), valid], true);
  assert(missing.result?.attempts === 2 && missing.observed[0].dump === null
    && missing.observed[0].failure === 'synthetic dump unavailable', 'An unavailable dump was falsely recorded as raw evidence.'); retryScenarios++;
  const unavailable = await simulate([new Error('synthetic persistent unavailable')], true);
  assert(unavailable.result === undefined && unavailable.reads === 3 && unavailable.delays.join() === '250,250'
    && unavailable.observed.every(item => item.dump === null && item.candidate === null),
    'Persistent command failure escaped the finite read-only retry budget or claimed source data.'); retryScenarios++;
  const noEvidence = await simulate([emptyVisibleIme, valid], true, async () => { throw new Error('synthetic preservation failure'); });
  assert(noEvidence.failure === 'synthetic preservation failure' && noEvidence.reads === 1 && noEvidence.delays.length === 0,
    'Diagnostic preservation failure was retried or ignored.'); retryScenarios++;
  let hierarchyReads = 0, viewportReads = 0;
  const recaptured = await captureHierarchyWithViewport(async () => `hierarchy-${++hierarchyReads}`,
    async () => ({ viewport: hidden, attempts: ++viewportReads === 1 ? 2 : 1 }));
  assert(recaptured.xml === 'hierarchy-2' && recaptured.hierarchy_captures === 2,
    'A pre-recovery hierarchy was reused.'); retryScenarios++;
  hierarchyReads = 0;
  await rejection(() => captureHierarchyWithViewport(async () => `hierarchy-${++hierarchyReads}`,
    async () => ({ viewport: hidden, attempts: 2 })), 'bounded recapture');
  assert(hierarchyReads === 3, 'Hierarchy recapture was not bounded.'); retryScenarios++;
  const original = { package: INSPECT, class: 'android.widget.Button', text: 'Owned control',
    'resource-id': 'owned/control', enabled: 'true', box: [100,100,300,200] };
  const fresh = { ...original, box: [100,300,300,400] };
  assert(rebindRecoveredNode(original, [fresh], hidden) === fresh, 'A recovered target retained stale node coordinates.');
  for (const list of [[], [fresh, { ...fresh }], [{ ...fresh, enabled: 'false' }], [{ ...fresh, enabled: undefined }],
    [{ ...fresh, text: 'Changed control' }], [{ ...fresh, package: FIXTURE }], [{ ...fresh, box: [0,0,100,40] }]]) {
    await rejection(() => rebindRecoveredNode(original, list, hidden), 'no unique'); rejectedRebindings++;
  }
  await rejection(() => rebindRecoveredNode(original, [fresh], { ...hidden, focused_package: FIXTURE }), 'selected node package');
  rejectedRebindings++;
  return { result: 'pass_pure_strict_viewport_and_recovery_checks', valid_parses: validParses,
    invalid_geometry_or_source_rejections: rejectedParses, unsafe_focus_rejections: rejectedFocus,
    retry_and_recapture_scenarios: retryScenarios, stale_or_ambiguous_node_rejections: rejectedRebindings,
    attempt_limit: viewportAttemptLimit, retry_delay_millis: viewportRetryDelayMillis, hierarchy_pair_limit: hierarchyViewportPairLimit,
    gestures_sent: 0, device_accessed: false, files_written: false, runtime_verified: false };
}
async function imeDiagnosticSelfTests() {
  const dump = [
    `mCurrentFocus=Window{owned u0 ${INSPECT}/.MainActivity}`, 'WindowInsetsStateController',
    'mDisplayFrame=Rect(0, 0 - 1080, 1920)',
    'InsetsSource id=1 type=statusBars frame=[0,0][1080,63] visible=true',
    'InsetsSource id=2 type=navigationBars frame=[0,1794][1080,1920] visible=true',
    'InsetsSource id=3 type=ime frame=[0,1920][1080,1920] visibleFrame=[0,1920][1080,1920] visible=true',
    'InsetsSourceProviders:'
  ].join('\n');
  const reason = 'A visible occluding inset has invalid or empty bounds.';
  assert(exactBottomZeroImeTrigger(dump, 1080, 1920, reason) === true
    && exactBottomZeroImeTrigger(dump.replaceAll('\n', '\r\n'), 1080, 1920, reason) === true,
  'Exact observed zero-bottom IME did not select diagnostic-only capture.');
  const negatives = [
    [dump, 'other failure'], [dump, undefined], [null, reason], [dump.replace(INSPECT, FIXTURE), reason],
    [dump.replace(INSPECT, 'org.unowned.app'), reason], [dump.replace('id=3', 'id=4'), reason],
    [dump.replace('visibleFrame=[0,1920][1080,1920] visible=true', 'visibleFrame=[0,1920][1080,1920] visible=false'), reason],
    [dump.replace('frame=[0,1920][1080,1920]', 'frame=[100,100][980,900]'), reason],
    [dump.replace('visibleFrame=[0,1920][1080,1920]', 'visibleFrame=[0,1000][1080,1920]'), reason],
    [dump.replace(' visibleFrame=[0,1920][1080,1920]', ''), reason],
    [dump.replace('frame=[0,1920][1080,1920]', 'frame=[0,0][0,0]'), reason],
    [dump.replace('frame=[0,0][1080,63]', 'frame=[0,0][0,0]'), reason],
    [dump.replace('frame=[0,1794][1080,1920]', 'frame=[0,0][0,0]'), reason],
    [dump.replace('Rect(0, 0 - 1080, 1920)', 'Rect(0, 0 - 720, 1280)'), reason],
    [dump.replace('InsetsSourceProviders:', 'MissingProviders:'), reason],
    [dump.replace('InsetsSourceProviders:', 'InsetsSource id=3 type=ime frame=[0,1920][1080,1920] visibleFrame=[0,1920][1080,1920] visible=true\nInsetsSourceProviders:'), reason]
  ];
  for (const [source, failure] of negatives)
    assert(exactBottomZeroImeTrigger(source, 1080, 1920, failure) === false, 'A broader source/failure selected supplemental capture.');
  assert(imeSampleConsistency(dump, dump, 1080, 1920) === 'consistent_observed_geometry_and_focus'
    && imeSampleConsistency(dump, dump.replace('Window{owned', 'Window{changed'), 1080, 1920) === 'changed_observed_geometry_or_focus'
    && imeSampleConsistency(dump, dump.replace(INSPECT, FIXTURE), 1080, 1920) === 'changed_observed_geometry_or_focus'
    && imeSampleConsistency(dump, null, 1080, 1920) === 'unknown', 'Non-atomic bracket consistency is overclaimed.');
  const captured = [], commands = []; let ticks = 0;
  await captureImeDiagnosticSources(async source => {
    commands.push(source.command);
    if (source.kind === 'input_method') throw new Error('synthetic source unavailable');
    return source.kind === 'window_all' ? '' : dump;
  }, async item => { captured.push(item); }, () => new Date(1700000000000 + ticks++).toISOString());
  assert(commands.length === 3 && JSON.stringify(commands) === JSON.stringify(imeDiagnosticSources.map(source => source.command))
    && ticks === 6 && captured[0].metadata.raw_dump_available && captured[0].dump === ''
    && !captured[1].metadata.raw_dump_available && captured[1].dump === null
    && captured[1].metadata.unavailable_reason === 'synthetic source unavailable'
    && captured[2].dump === dump && captured.every(item => Date.parse(item.metadata.capture_finished_at) >= Date.parse(item.metadata.capture_started_at)),
  'Fixed source commands, availability, empty raw output or per-source times were mislabeled.');
  let reads = 0, observations = 0;
  await captureImeDiagnosticSources(async () => (++reads === 1 ? 42 : 'x'), async item => {
    if (++observations === 1) assert(!item.metadata.raw_dump_available && item.dump === null, 'Non-text output was preserved as complete raw evidence.');
  });
  assert(reads === 3 && observations === 3, 'Supplemental source capture escaped its finite read count.');
  reads = 0; observations = 0;
  await captureImeDiagnosticSources(async () => (++reads === 1 ? '\u00e9'.repeat(4 * 1024 * 1024 + 1) : 'bounded'), async item => {
    if (++observations === 1) assert(!item.metadata.raw_dump_available && item.dump === null,
      'Oversized UTF-8 output was mislabeled a complete available source.');
  });
  assert(reads === 3 && observations === 3, 'Oversized output changed the fixed source read count.');
  reads = 0; let preservationFailed = false;
  try { await captureImeDiagnosticSources(async () => { reads++; return 'raw'; }, async () => { throw new Error('synthetic persistence failure'); }); }
  catch (error) { preservationFailed = error.message === 'synthetic persistence failure'; }
  assert(preservationFailed && reads === 1, 'Persistence failure was relabeled unavailable or ignored.');
  return { result: 'pass_pure_ime_diagnostic_capture_checks', exact_trigger_cases: 2, broader_trigger_rejections: negatives.length,
    bracket_consistency_cases: 4, fixed_read_commands: 3, availability_and_persistence_scenarios: 4,
    device_accessed: false, files_written: false, geometry_accepted: false, gestures_sent: 0 };
}
function launchImeFixture() {
  const focus = `Window{abc123 u0 ${INSPECT}/${INSPECT}.MainActivity}`;
  const display = [`mCurrentFocus=${focus}`, 'WindowInsetsStateController', 'mDisplayFrame=Rect(0, 0 - 1080, 1920)',
    'InsetsSource id=1 type=statusBars frame=[0,0][1080,63] visible=true',
    'InsetsSource id=2 type=navigationBars frame=[0,1794][1080,1920] visible=true',
    'InsetsSource id=3 type=ime frame=[0,1920][1080,1920] visibleFrame=[0,1920][1080,1920] visible=true',
    'InsetsSourceProviders:'].join('\n');
  const imeBlock = ['  Window #0 Window{def456 u0 InputMethod}:',
    '    mDisplayId=0 mSession=Session{aba123 8000:u0a10100} mClient=android.os.BinderProxy@111abc',
    '    mOwnerUid=10100 showForAllUsers=false package=com.android.inputmethod.latin appop=NONE',
    '    mAttrs={ty=INPUT_METHOD', '      fl=NOT_FOCUSABLE LAYOUT_IN_SCREEN}',
    '    mToken=WindowToken{ffe123 type=2011 android.os.Binder@222abc}',
    '    mHasSurface=true isReadyForDisplay()=true mWindowRemovalAllowed=false',
    '      Surface: shown=true mDrawState=HAS_DRAWN mLastHidden=false', '    isOnScreen=true', '    isVisible=true'].join('\n');
  const ownerBlock = [`  Window #1 ${focus}:`,
    '    mDisplayId=0 taskId=3 mSession=Session{bba123 9000:u0a10150} mClient=android.os.BinderProxy@333abc',
    `    mOwnerUid=10150 showForAllUsers=false package=${INSPECT} appop=NONE`,
    '    mAttrs={ty=BASE_APPLICATION', '      fl=SECURE}',
    '    mHasSurface=true isReadyForDisplay()=true mWindowRemovalAllowed=false',
    '      Surface: shown=true mDrawState=HAS_DRAWN mLastHidden=false', '    isOnScreen=true', '    isVisible=true'].join('\n');
  const window = ['mCurrentUserId=0', display, 'WINDOW MANAGER WINDOWS (dumpsys window windows)', imeBlock, ownerBlock,
    'WINDOW MANAGER TRACE (dumpsys window trace)'].join('\n');
  const input = ['  UserId=0', '    mSelectedMethodId=com.android.inputmethod.latin/.LatinIME',
    '    mCurId=com.android.inputmethod.latin/.LatinIME', '    mHasMainConnection=true', '    mBoundToMethod=true',
    '    mCurMethod=com.android.server.inputmethod.IInputMethodInvoker@111aaa', '    mCurToken=android.os.Binder@222abc',
    '    mCurTokenDisplayId=0', '    mDisplayIdToShowIme=0', '    mBackDisposition=0',
    '    mCurClient=ClientState{aaa123 mUid=10150 mPid=9000 mSelfReportedDisplayId=0}',
    '    mFocusedWindowClient=ClientState{aaa123 mUid=10150 mPid=9000 mSelfReportedDisplayId=0}',
    '    mFocusedWindow=android.os.BinderProxy@333abc', '    mInputShown=true', '    mImeWindowVis=3',
    'Input method client state for android.view.inputmethod.InputMethodManager@abc:',
    'Input method service state for com.android.inputmethod.latin.LatinIME@abc:',
    '  mDecorViewVisible=true mDecorViewWasVisible=true mWindowVisible=true mInShowWindow=false',
    '  mInputBinding=InputBinding{android.os.BinderProxy@aaa111 / uid 10150 / pid 9000}',
    `  packageName=${INSPECT} autofillId=1 fieldId=-1 fieldName=null`,
    '  mShowInputRequested=true mLastShowInputRequested=true mShowInputFlags=0x1',
    '  mCandidatesVisibility=4 mFullscreenApplied=true mIsFullscreen=false mExtractViewHidden=false',
    '  mIsInputViewShown=false mStatusIcon=0'].join('\n');
  const hiddenIme = imeBlock.replace('mHasSurface=true isReadyForDisplay()=true', 'mHasSurface=false isReadyForDisplay()=false')
    .replace('Surface: shown=true', 'Surface: shown=false').replace('isOnScreen=true', 'isOnScreen=false').replace('isVisible=true', 'isVisible=false');
  const hiddenDisplay = display.replace('visibleFrame=[0,1920][1080,1920] visible=true', 'visibleFrame=[0,1920][1080,1920] visible=false');
  const hiddenWindow = window.replace(display, hiddenDisplay).replace(imeBlock, hiddenIme);
  const hiddenInput = input.replace('mInputShown=true', 'mInputShown=false').replace('mImeWindowVis=3', 'mImeWindowVis=1')
    .replace('mDecorViewVisible=true', 'mDecorViewVisible=false').replace('mWindowVisible=true', 'mWindowVisible=false')
    .replace('mShowInputRequested=true', 'mShowInputRequested=false');
  const xml = `<hierarchy><node package="${INSPECT}" class="android.widget.Button" text="Inspect now" bounds="[0,100][400,200]"/><node package="${INSPECT}" class="android.widget.Button" text="Stop and clear observations" bounds="[0,300][400,400]"/></hierarchy>`;
  return { display, window, input, hiddenDisplay, hiddenWindow, hiddenInput, xml };
}
async function launchImeSelfTests() {
  const fixture = launchImeFixture(), binding = checkedLaunchImeBinding(fixture.display, fixture.window, fixture.input, 1080, 1920);
  checkedLaunchImeBinding(fixture.hiddenDisplay, fixture.hiddenWindow, fixture.hiddenInput, 1080, 1920, { hidden: true, prior: binding });
  checkedLaunchImeBinding(fixture.display.replaceAll('\n', '\r\n'), fixture.window.replaceAll('\n', '\r\n'), fixture.input.replaceAll('\n', '\r\n'), 1080, 1920);
  const invalidBindings = [
    ['display', text => text.replace('abc123', 'aaa111')], ['display', text => `${text}\nmCurrentFocus=null`],
    ['window', text => text.replace('mCurrentUserId=0', 'mCurrentUserId=1')], ['window', text => text.replace('10150', '10151')],
    ['window', text => text.replace('9000:u0a10150', '9001:u0a10150')], ['window', text => text.replace('333abc', '444abc')],
    ['window', text => text.replace('8000:u0a10100', '8000:u1a10100')], ['window', text => text.replace('com.android.inputmethod.latin', 'org.unowned.keyboard')],
    ['window', text => text.replace('fl=NOT_FOCUSABLE', 'fl=LAYOUT_IN_SCREEN')], ['window', text => text.replace('222abc', '555abc')],
    ['window', text => text.replace('mHasSurface=true', 'mHasSurface=false')], ['window', text => text.replace('isVisible=true', 'isVisible=false')],
    ['window', text => text.replace('WINDOW MANAGER TRACE', '  Window #2 Window{fff111 u0 InputMethod}:\n    mAttrs={ty=INPUT_METHOD}\nWINDOW MANAGER TRACE')],
    ['input', text => text.replace('  UserId=0', '  UserId=1')], ['input', text => text.replace('mCurId=com.android.inputmethod.latin/.LatinIME', 'mCurId=org.other/.IME')],
    ['input', text => text.replace('mHasMainConnection=true', 'mHasMainConnection=false')], ['input', text => text.replace('mBoundToMethod=true', 'mBoundToMethod=false')],
    ['input', text => text.replace('mCurTokenDisplayId=0', 'mCurTokenDisplayId=1')], ['input', text => text.replace('mDisplayIdToShowIme=0', 'mDisplayIdToShowIme=1')],
    ['input', text => text.replace('mBackDisposition=0', 'mBackDisposition=2')], ['input', text => text.replace('mCurToken=android.os.Binder@222abc', 'mCurToken=android.os.Binder@555abc')],
    ['input', text => text.replace('mFocusedWindow=android.os.BinderProxy@333abc', 'mFocusedWindow=android.os.BinderProxy@666abc')],
    ['input', text => text.replace('mCurClient=ClientState{aaa123 mUid=10150', 'mCurClient=ClientState{aaa123 mUid=10151')],
    ['input', text => text.replace('mFocusedWindowClient=ClientState{aaa123 mUid=10150 mPid=9000', 'mFocusedWindowClient=ClientState{aaa123 mUid=10150 mPid=9001')],
    ['input', text => text.replace('/ uid 10150 / pid 9000', '/ uid 10151 / pid 9000')], ['input', text => text.replace(`packageName=${INSPECT}`, 'packageName=org.unowned.app')],
    ['input', text => text.replace('mShowInputRequested=true', 'mShowInputRequested=false')], ['input', text => text.replace('mInputShown=true', 'mInputShown=false')],
    ['input', text => text.replace('mImeWindowVis=3', 'mImeWindowVis=1')], ['input', text => text.replace('mWindowVisible=true', 'mWindowVisible=false')],
    ['input', text => text.replace('mIsFullscreen=false', 'mIsFullscreen=true')], ['input', text => text.replace('mInShowWindow=false', 'mInShowWindow=true')],
    ['input', text => text.replace('Input method service state for com.android.inputmethod.latin.LatinIME', 'Input method service state for org.other.IME')],
    ['input', text => `${text}\n  mShowInputRequested=true mLastShowInputRequested=true mShowInputFlags=0x1`]
  ];
  for (const [field, change] of invalidBindings) {
    const value = { ...fixture, [field]: change(fixture[field]) }; let rejected = false;
    try { checkedLaunchImeBinding(value.display, value.window, value.input, 1080, 1920); } catch { rejected = true; }
    assert(rejected, `An unsafe launch IME ${field} binding was accepted.`);
  }
  const run = async ({ api = 36, packageName = INSPECT, changes = {}, commandOutput = '', commandThrows = false,
    unavailable = null, persistenceFails = false, backIntentPersistenceFails = false, xml = fixture.xml } = {}) => {
    const record = { result: 'reading', sources: [], preconditions_verified: false, same_focus_verified: false,
      ime_hidden_verified: false, hierarchy_verified: false, back_send_attempted: false, back_command_completed: false };
    let backCalls = 0, invalidations = 0, hierarchyReads = 0, ticks = 0, failure; const commands = [], delays = [], events = [];
    const values = { display_before: fixture.display, window_all: fixture.window, input_method: fixture.input,
      display_before_back: fixture.display, window_after_back: fixture.hiddenWindow, input_method_after_back: fixture.hiddenInput,
      display_after_back: fixture.hiddenDisplay, ...changes };
    try { await recoverInspectorLaunchIme({ api, packageName, record, displayWidth: 1080, displayHeight: 1920,
      readSource: async source => { commands.push(source.kind); events.push(`read:${source.kind}`); if (source.kind === unavailable) throw new Error('synthetic read unavailable'); return values[source.kind]; },
      observeSource: async () => { if (persistenceFails) throw new Error('synthetic persistence failure'); }, observeState: async () => {
        if (backIntentPersistenceFails && record.back_send_attempted && !record.finished_at) throw new Error('synthetic Back intent persistence failure');
      },
      sendBack: async () => { backCalls++; events.push('back'); if (commandThrows) throw new Error('synthetic command ambiguity'); return commandOutput; },
      invalidate: () => { invalidations++; }, delay: async ms => { delays.push(ms); },
      readHierarchy: async () => { hierarchyReads++; events.push('hierarchy'); return xml; },
      observeHierarchy: async () => ({ artifact: 'owned.xml', viewport_artifact: 'owned.viewport.json' }),
      clock: () => new Date(1700000000000 + ticks++).toISOString() }); } catch (error) { failure = error.message; }
    return { record, backCalls, invalidations, hierarchyReads, commands, delays, events, failure };
  };
  const recovered = await run();
  assert(!recovered.failure && recovered.record.result === 'recovered' && recovered.backCalls === 1 && recovered.commands.length === launchImeSourceLimit
    && JSON.stringify(recovered.commands) === JSON.stringify(launchImeSources.map(source => source.kind))
    && recovered.record.sources.every(source => source.raw_dump_available) && recovered.record.ime_hidden_verified && recovered.record.hierarchy_verified
    && recovered.invalidations === 3 && recovered.hierarchyReads === 1 && JSON.stringify(recovered.delays) === '[250]',
  'Launch-only IME dismissal did not use exactly one command, fresh hidden state and fresh owned hierarchy.');
  assert(JSON.stringify(recovered.events) === JSON.stringify([
    'read:display_before', 'read:window_all', 'read:input_method', 'read:display_before_back', 'back',
    'read:input_method_after_back', 'hierarchy', 'read:window_after_back', 'read:display_after_back'
  ]), 'Post-dismissal full window was sampled before the fresh hierarchy or separated from the final display.');
  let orchestrationCases = 2;
  for (const settings of [{ api: 35 }, { packageName: FIXTURE }]) {
    const value = await run(settings);
    assert(!value.failure && value.commands.length === 0 && value.backCalls === 0 && value.invalidations === 0, 'IME recovery escaped its API36 inspector-launch scope.'); orchestrationCases++;
  }
  const unnecessary = await run({ changes: { display_before: fixture.hiddenDisplay } });
  assert(!unnecessary.failure && unnecessary.record.result === 'not_required' && unnecessary.commands.length === 1 && unnecessary.backCalls === 0,
    'A strictly valid inspector launch sent a recovery BACK.'); orchestrationCases++;
  for (const [field, change] of invalidBindings) {
    const kind = { display: 'display_before', window: 'window_all', input: 'input_method' }[field];
    const value = await run({ changes: { [kind]: change(fixture[field]) } });
    assert(value.failure && value.backCalls === 0 && value.record.result === 'rejected_before_back', 'Invalid cross-source identity sent a BACK.'); orchestrationCases++;
  }
  for (const changes of [{ display_before_back: fixture.display.replace('abc123', 'abc124') },
    { display_before_back: fixture.hiddenDisplay }, { display_before: fixture.display.replace('[0,1920][1080,1920]', '[100,100][900,1000]') }]) {
    const value = await run({ changes }); assert(value.failure && value.backCalls === 0, 'Changed focus/source geometry authorized a BACK.'); orchestrationCases++;
  }
  for (const settings of [{ commandThrows: true }, { commandOutput: 'ambiguous output' }, { commandOutput: 0 }]) {
    const value = await run(settings);
    assert(value.failure && value.backCalls === 1 && value.commands.length === 4 && value.record.result === 'back_command_uncertain'
      && !value.record.back_command_completed && value.invalidations >= 3, 'An uncertain BACK was repeated or permitted further source/gesture use.'); orchestrationCases++;
  }
  const unpersistedIntent = await run({ backIntentPersistenceFails: true });
  assert(unpersistedIntent.failure && unpersistedIntent.backCalls === 0 && unpersistedIntent.record.result === 'back_command_uncertain'
    && unpersistedIntent.record.back_send_attempted && !unpersistedIntent.record.back_command_completed,
  'A failed Back intent audit sent or falsely completed the command.'); orchestrationCases++;
  for (const settings of [{ unavailable: 'window_all' }, { persistenceFails: true }]) {
    const value = await run(settings); assert(value.failure && value.backCalls === 0, 'Unavailable/unpreserved source authorized a BACK.'); orchestrationCases++;
  }
  for (const settings of [
    { unavailable: 'window_after_back' }, { changes: { display_after_back: fixture.display } },
    { changes: { display_after_back: fixture.hiddenDisplay.replace('abc123', 'abc124') } },
    { changes: { input_method_after_back: fixture.input } }, { changes: { window_after_back: fixture.window } },
    { xml: fixture.xml.replaceAll(INSPECT, FIXTURE) }, { xml: '<hierarchy><node package="org.liveabit.inspect" class="android.widget.Button" text="Unknown screen" bounds="[0,100][100,200]"/></hierarchy>' }
  ]) {
    const value = await run(settings);
    assert(value.failure && value.backCalls === 1 && value.record.result === 'rejected_after_back' && !value.record.hierarchy_verified,
      'Unconfirmed hidden state/focus/fresh hierarchy was accepted or BACK was repeated.'); orchestrationCases++;
  }
  return { result: 'pass_pure_launch_only_ime_recovery_checks', valid_parser_cases: 3,
    rejected_binding_cases: invalidBindings.length, orchestration_cases: orchestrationCases,
    source_read_limit: launchImeSourceLimit, back_attempt_limit: 1, record_limit: launchImeRecordLimit,
    cached_state_invalidation_verified: true, fresh_hierarchy_required: true, generic_geometry_parser_unchanged: true,
    device_accessed: false, files_written: false, actual_runtime_verified: false };
}
async function swipe(direction, distance = 'search') {
  await refreshViewport({ requireFocus: true });
  const safe = interactionViewport();
  // Short, slow, overlapping search steps avoid skipping a control through a fling.
  const x = Math.floor((safe.left + safe.right) / 2), span = safe.bottom - safe.top;
  const top = Math.floor(safe.top + span * (distance === 'top' ? 0.25 : distance === 'nudge' ? 0.47 : 0.39));
  const bottom = Math.floor(safe.top + span * (distance === 'top' ? 0.78 : distance === 'nudge' ? 0.57 : 0.67));
  await shell('input', 'swipe', String(x), String(direction === 'down' ? bottom : top),
    String(x), String(direction === 'down' ? top : bottom), '500');
  await wait(250);
}
async function top() { for (let i = 0; i < 7; i++) await swipe('up', 'top'); }
async function locate(predicate, label, { scroll = true, requireEnabled = true } = {}) {
  let ui = await snapshot(label);
  let match = ui.nodes.find(n => predicate(n) && visible(n, requireEnabled));
  if (match || !scroll) return { node: match, ui };
  await top();
  for (let i = 0; i < 20; i++) {
    ui = await snapshot(label);
    match = ui.nodes.find(n => predicate(n) && visible(n, requireEnabled));
    if (match) return { node: match, ui };
    const partial = ui.nodes.find(n => predicate(n) && n.box
      && (!requireEnabled || n.enabled !== 'false')
      && n.box[2] > n.box[0] && n.box[3] > n.box[1]);
    if (partial && (partial.box[1] < viewport.safe_content.top + 4 || partial.box[3] > viewport.safe_content.bottom - 4)) {
      // A clipped match proves its position. Move it into the viewport rather than past it.
      await swipe(partial.box[1] < viewport.safe_content.top + 4 ? 'up' : 'down', 'nudge');
      ui = await snapshot(`${label}-partial-nudge`);
      match = ui.nodes.find(n => predicate(n) && visible(n, requireEnabled));
      if (match) return { node: match, ui };
    }
    await swipe('down');
  }
  return { node: undefined, ui };
}
async function click(text) {
  const { node } = await locate(n => n.text === text, `click-${text}`);
  assert(node, `Enabled visible control was not found: ${text}`);
  await tap(node);
}
async function imeVisibility() {
  const dump = await shell('dumpsys', 'input_method');
  // Use the actual pinned AOSP manager state. The IME service's cached
  // mIsInputViewShown can remain true while its window is hidden.
  const states = [...dump.matchAll(/^\s*mInputShown=(true|false)\s*$/gm)].map(match => match[1]);
  assert(states.length === 1, 'The actual input-method manager visibility could not be uniquely verified; no Back key was sent.');
  return { shown: states[0] === 'true', basis: 'current_input_method_manager_mInputShown' };
}
async function hideImeOnlyWhenShown(field) {
  let visibility = await imeVisibility();
  if (visibility.shown) {
    await wait(150);
    visibility = await imeVisibility();
  }
  if (visibility.shown) {
    await shell('input', 'keyevent', 'KEYCODE_BACK');
    await wait(250);
  }
  report.input_navigation.push({ field, ime_shown_before_back: visibility.shown,
    observation_basis: visibility.basis, back_sent: visibility.shown });
  const after = await snapshot('owned-ui-after-input');
  assert(after.nodes.some(node => node.package === INSPECT), 'Typing unexpectedly left the owned inspector screen.');
}
async function input(hint, value, fallbackIndex = null) {
  assert(/^[A-Za-z0-9_.-]{1,128}$/.test(value), 'Only bounded owned synthetic text is allowed.');
  const found = await locate(n => n.package === INSPECT && n.class === 'android.widget.EditText'
    && (hint.startsWith('App identifiers,') || n.text === hint || n.hint === hint || n['content-desc'] === hint), `input-${hint}`);
  let node = found.node;
  if (!node && fallbackIndex !== null) {
    const fields = found.ui.nodes.filter(n => n.package === INSPECT && n.class === 'android.widget.EditText' && visible(n));
    node = fields[fallbackIndex];
  }
  assert(node, `Input was not found: ${hint}`);
  await tap(node);
  await shell('input', 'keyevent', 'KEYCODE_MOVE_END');
  // Delete only bounded synthetic existing contents; hints on an empty field are harmless.
  await shell('input', 'keyevent', ...Array(Math.min((node.text ?? '').length + 1, 160)).fill('KEYCODE_DEL'));
  await shell('input', 'text', value);
  await hideImeOnlyWhenShown(hint);
  await wait(150);
}
async function collect(label = stage) {
  await top();
  const text = new Set(), blocks = new Set(), artifacts = [];
  let prior = '';
  for (let i = 0; i < 20; i++) {
    const ui = await snapshot(label); artifacts.push(ui.artifact);
    const current = ui.nodes.map(n => n.text ?? '').filter(Boolean).join('\n');
    ui.nodes.map(n => n.text ?? '').filter(Boolean).forEach(block => blocks.add(block));
    current.split('\n').forEach(line => text.add(line));
    // Text can stay identical while a large TextView moves. Bounds must also stop
    // changing before treating the end as reached; retain overlapping page text.
    if (i > 0 && ui.xml === prior) break;
    prior = ui.xml;
    await swipe('down');
  }
  return { text: [...text].join('\n'), blocks: [...blocks], artifacts };
}
async function launch(pkg) {
  assert(packages.has(pkg), 'Only an owned app may be launched.');
  const output = await shell('am', 'start', '-W', '-n', `${pkg}/.MainActivity`);
  assert(!/Error:|Exception|unable to resolve/i.test(output), `Owned app did not launch: ${pkg}`);
  await wait(350);
  if (pkg === INSPECT && expectedApi === 36) await recoverImeAfterInspectorLaunch();
}
async function homeAndReturn(reason) {
  await shell('input', 'keyevent', 'KEYCODE_HOME');
  let home;
  for (let attempt = 0; attempt < 6; attempt++) {
    const ui = await snapshot('confirmed-home-transition');
    if (ui.viewport.focused_package === 'com.android.launcher3'
      && ui.nodes.some(node => node.package === 'com.android.launcher3')
      && !ui.nodes.some(node => node.package === INSPECT)) {
      home = ui;
      break;
    }
    if (attempt < 5) await wait(250);
  }
  assert(home, 'Home did not produce a verified launcher focus and hierarchy with the inspector absent; no immediate relaunch was attempted.');
  const transition = { reason, launcher_focus_verified: true, inspector_absent_from_home_hierarchy: true,
    launcher_ui: home.artifact, launcher_viewport: home.viewport_artifact,
    owned_inspector_return_verified: false };
  report.home_transitions.push(transition);
  await launch(INSPECT);
  const returned = await snapshot('confirmed-inspector-return');
  assert(returned.viewport.focused_package === INSPECT && returned.nodes.some(node => node.package === INSPECT),
    'The inspector did not regain actual focus and its own hierarchy after the confirmed Home transition.');
  transition.owned_inspector_return_verified = true;
  transition.returned_ui = returned.artifact;
  transition.returned_viewport = returned.viewport_artifact;
  assertTimingDetailsAbsent(returned.nodes.map(node => node.text ?? '').join('\n'), `${reason}_home`, [returned.artifact]);
}
async function forceStop(pkg) {
  assert(packages.has(pkg), 'Only an owned app may be stopped.');
  await shell('am', 'force-stop', pkg);
}
async function clearApp(pkg) {
  assert(packages.has(pkg), 'Only an owned app may be reset.');
  assert((await shell('pm', 'clear', pkg)).includes('Success'), `Owned app reset failed: ${pkg}`);
}
async function mode(value, reason) {
  assert(['ignore', 'allow'].includes(value), 'Unexpected emulator-only permission control.');
  await shell('cmd', 'appops', 'set', INSPECT, 'GET_USAGE_STATS', value);
  report.permission_controls.push({ control: 'emulator_only_shell_appops', value, reason });
  await wait(350);
}
async function state(expected, label = stage) {
  const ui = await collect(label);
  assert(ui.text.includes(expected), `Expected UI state is missing: ${expected}`);
  return ui;
}
async function stopped(label = stage) {
  const ui = await state('Stopped', label);
  assert(ui.text.includes('No observations retained.'), 'Stopped inspection retained rendered observations.');
  assert(!ui.text.includes('Sum of retained inferred intervals'), 'Stopped inspection retained an interval sum.');
  assertTimingDetailsAbsent(ui.text, `${label}_stopped`, ui.artifacts);
  const control = (await locate(n => n.text === 'Inspect now', `${label}-inspect-control`, { requireEnabled: false })).node;
  assert(control?.enabled === 'false', 'Inspect now must be disabled while stopped.');
  return ui;
}
async function inspect() {
  await click('Inspect now');
  await wait(550);
  for (let i = 0; i < 5; i++) {
    const ui = await collect('inspection-result');
    if (!ui.text.includes('Reading selected transitions on this device…')) return ui;
    await wait(500);
  }
  throw new Error('A bounded manual inspection did not finish.');
}
function retainedCount(text) {
  const match = /Showing (?:latest |all )?(\d+) of (\d+) retained activity transitions\./.exec(text);
  return match ? Number(match[2]) : 0;
}
function fixtureValues(text) {
  const number = regex => { const match = regex.exec(text); assert(match, 'Finished fixture values are absent.'); return Number(match[1]); };
  return { start: number(/Start time code: (\d+)/), end: number(/End time code: (\d+)/),
    duration: number(/Finished own resumed union: (\d+) ms/),
    callbacks: number(/Retained callbacks: (\d+) of 128/) };
}
function assertTimingDetailsAbsent(text, reason, artifacts) {
  assert(!text.includes('Fixture timing details v1') && !text.includes('Hide fixture timing details')
    && !/^(?:Session start (?:wall|elapsed) code:|Query cursor wall code \(exclusive\):|Report clock (?:wall|elapsed) code:|Event: \d+ (?:RESUME|PAUSE)|Interval: \d+ \d+)/m.test(text),
  'Hidden or stopped fixture timing details retained their disclosure or numeric fields.');
  report.fixture_timing_context_resets.push({ reason, detail_disclosure_absent: true,
    numeric_timing_fields_absent: true, ui: artifacts });
}
function parseFixtureTimingDetails(ui, expectedRetained = null) {
  const contexts = ui.blocks.filter(block => block.startsWith('Fixture timing details v1\n'));
  assert(contexts.length === 1, 'A single consistent fixture timing detail block was not captured.');
  const lines = contexts[0].split('\n');
  let index = 0;
  const exact = expected => assert(lines[index++] === expected, `Fixture timing detail grammar differs: ${expected}`);
  const integer = (label, signed = false) => {
    const match = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: (${signed ? '-?' : ''}\\d+)$`).exec(lines[index++]);
    assert(match, `Fixture timing detail numeric field is missing: ${label}`);
    const value = Number(match[1]);
    assert(Number.isSafeInteger(value) && (signed || (value >= 0 && value <= 253402300799999)), 'Fixture timing detail numeric field is outside its supported range.');
    return value;
  };
  const count = label => {
    const match = new RegExp(`^${label}: (all|latest) (\\d+) of (\\d+)$`).exec(lines[index++]);
    assert(match && match[1] === 'all' && match[2] === match[3], 'Controlled fixture timing detail records are truncated or incomplete.');
    const value = Number(match[2]);
    assert(Number.isInteger(value) && value >= 0 && value <= 64, 'Controlled fixture timing detail record count exceeds its bound.');
    return value;
  };
  exact('Fixture timing details v1'); exact(`Package: ${FIXTURE}`);
  const context = {
    format: 'fixture_timing_details_v1', package_id: FIXTURE,
    session_start_wall_millis: integer('Session start wall code'),
    session_start_elapsed_millis: integer('Session start elapsed code'),
    query_cursor_wall_millis_exclusive: integer('Query cursor wall code (exclusive)'),
    report_clock_wall_millis: integer('Report clock wall code'),
    report_clock_elapsed_millis: integer('Report clock elapsed code')
  };
  const zone = /^Displayed time zone: ([A-Za-z0-9_+./:-]{1,80})$/.exec(lines[index++]);
  assert(zone, 'Fixture timing detail display time zone is missing or malformed.');
  context.display_time_zone = zone[1];
  context.report_clock_utc_offset_millis = integer('Report clock UTC offset millis', true);
  assert(Math.abs(context.report_clock_utc_offset_millis) <= 24 * 60 * 60 * 1000, 'Report UTC offset is outside the supported range.');
  assert(context.display_time_zone === report.environment.guest_time_zone_property,
    'The app display time zone differs from the captured guest default time-zone property.');
  assert(context.session_start_wall_millis <= context.query_cursor_wall_millis_exclusive
    && context.query_cursor_wall_millis_exclusive <= context.report_clock_wall_millis
    && context.report_clock_elapsed_millis >= context.session_start_elapsed_millis,
  'Fixture timing detail session/query/report anchors are unordered.');
  const wallSpan = context.report_clock_wall_millis - context.session_start_wall_millis;
  const elapsedSpan = context.report_clock_elapsed_millis - context.session_start_elapsed_millis;
  assert(Math.abs(wallSpan - elapsedSpan) <= 2000, 'Fixture timing detail paired clocks disagree beyond the core clock tolerance.');
  const eventCount = count('Fixture transitions shown');
  if (expectedRetained !== null) assert(eventCount === expectedRetained, 'Exact timing detail event count differs from the retained report.');
  context.events = [];
  for (let eventIndex = 0; eventIndex < eventCount; eventIndex++) {
    const match = /^Event: (\d+) (RESUME|PAUSE)$/.exec(lines[index++]);
    assert(match, 'Fixture timing detail event row is missing or malformed.');
    const timestamp = Number(match[1]);
    assert(Number.isSafeInteger(timestamp) && timestamp >= context.session_start_wall_millis
      && timestamp < context.query_cursor_wall_millis_exclusive, 'Fixture timing detail event escapes its consent/query horizon.');
    context.events.push({ timestamp_millis: timestamp, type: match[2] });
  }
  const intervalCount = count('Fixture inferred intervals shown');
  context.closed_intervals = [];
  for (let intervalIndex = 0; intervalIndex < intervalCount; intervalIndex++) {
    const match = /^Interval: (\d+) (\d+)$/.exec(lines[index++]);
    assert(match, 'Fixture timing detail interval row is missing or malformed.');
    const [start, end] = match.slice(1).map(Number);
    assert(Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= context.session_start_wall_millis
      && end > start && end < context.query_cursor_wall_millis_exclusive, 'Fixture timing detail interval escapes its consent/query horizon.');
    context.closed_intervals.push({ start_inclusive: start, end_exclusive: end });
  }
  exact('Displayed time zone describes current formatting, not the source zone at event time.');
  exact('Coverage remains unknown; timing is unverified.');
  assert(index === lines.length, 'Unexpected extra fields appeared in the owned fixture timing details.');
  return { ...context, complete_displayed_fixture_records: true, owned_fixture_only: true,
    source_coverage_unknown: true, original_os_query_batch_clocks_attested: false,
    query_cursor_elapsed_clock_available: false, display_time_zone_at_report_only: true,
    synthetic_clock_envelope: false, physical_android_verified: false, production_accuracy_pass: false,
    ui: ui.artifacts };
}
function clippedTimingDetailUnion(context, start, end) {
  const clipped = context.closed_intervals.map(interval => [Math.max(start, interval.start_inclusive), Math.min(end, interval.end_exclusive)])
    .filter(interval => interval[0] < interval[1]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (!clipped.length) return null;
  let total = 0, [unionStart, unionEnd] = clipped[0];
  for (const [nextStart, nextEnd] of clipped.slice(1)) {
    if (nextStart <= unionEnd) unionEnd = Math.max(unionEnd, nextEnd);
    else { total += unionEnd - unionStart; unionStart = nextStart; unionEnd = nextEnd; }
  }
  return total + unionEnd - unionStart;
}
async function showFixtureTimingDetails(label, expectedRetained = null, { openComparison = false } = {}) {
  if (openComparison) await click('Compare a controlled test (optional)');
  await click('Show fixture timing details');
  return parseFixtureTimingDetails(await collect(label), expectedRetained);
}
async function compare(values, { captureTiming = false } = {}) {
  // Each entry begins from known blank inputs; leaving clears the previous manual values.
  await homeAndReturn('fresh_owned_fixture_comparison_inputs');
  await click('Compare a controlled test (optional)');
  await input('Fixture start time code', String(values.start), 0);
  await input('Fixture end time code', String(values.end), 1);
  await input('Fixture callback duration (milliseconds)', String(values.duration), 2);
  await click('Compare retained records');
  if (captureTiming) await click('Show fixture timing details');
  return collect('fixture-comparison');
}
async function testcase(name, work) {
  stage = name;
  const item = { name, started_at: new Date().toISOString(), result: 'running' }; report.cases.push(item); await save();
  process.stdout.write(`Running ${name}\n`);
  try {
    const details = await work(); item.result = 'pass'; if (details) item.details = details;
    item.finished_at = new Date().toISOString(); await save();
  } catch (error) {
    item.result = 'fail'; item.message = error.message;
    try { item.failure_ui = (await snapshot(`${name}-failure`)).artifact; } catch { item.failure_ui = 'unavailable'; }
    await save(); throw error;
  }
}

try {
  const runBytes = await readLocalIdentity('artifacts/android-emulator/run.json');
  const run = JSON.parse(runBytes.toString('utf8').replace(/^\uFEFF/, ''));
  const expectedAvdPath = path.resolve(root, 'artifacts/android-emulator/avd', `${expectedAvd}.avd`);
  const normalizedPath = value => path.resolve(value).toLowerCase();
  assert(run.serial === serial && run.name === expectedAvd && run.api === expectedApi,
    'Owned startup run record does not match the required serial, AVD and API.');
  assert(typeof run.avd_path === 'string' && normalizedPath(run.avd_path) === normalizedPath(expectedAvdPath),
    'Owned startup run record does not point to the expected project-local AVD path.');
  validateStartupProfile(run, profile, expectedAvdPath);
  assert(normalizedPath(await realpath(run.avd_path)) === normalizedPath(expectedAvdPath),
    'Owned AVD resolves through a redirected path; emulator mutations are prohibited.');
  const createdMillis = Date.parse(run.created_at);
  const runAgeMillis = Date.now() - createdMillis;
  assert(Number.isFinite(createdMillis) && runAgeMillis >= -30000 && runAgeMillis <= 6 * 60 * 60 * 1000,
    'Owned emulator startup record is stale or has an invalid creation time. Start a fresh owned test AVD.');
  assert(run.image === `system-images;android-${expectedApi};default;x86_64`
    && Number.isInteger(run.image_revision) && run.image_revision > 0
    && /^\d+\.\d+\.\d+$/.test(run.emulator_version ?? '')
    && ['on', 'off'].includes(run.cpu_acceleration) && run.graphics === 'software',
    'Owned emulator startup provenance is incomplete or unexpected.');
  const emulatorPropertiesBytes = await readLocalIdentity('artifacts/android-sdk/emulator/source.properties');
  const imagePropertiesBytes = await readLocalIdentity(`artifacts/android-sdk/system-images/android-${expectedApi}/default/x86_64/source.properties`);
  const imageRegistrationBytes = await readLocalIdentity(`artifacts/android-sdk/system-images/android-${expectedApi}/default/x86_64/package.xml`);
  const setupBytes = await readLocalIdentity(profile.setup);
  const emulatorProperties = emulatorPropertiesBytes.toString('utf8'), imageProperties = imagePropertiesBytes.toString('utf8');
  const property = (bytes, name) => new RegExp(`^${name.replace(/\./g, '\\.')}\\s*=\\s*(.*?)\\s*$`, 'm').exec(bytes)?.[1];
  assert(property(emulatorProperties, 'Pkg.Revision') === run.emulator_version,
    'Installed emulator revision differs from the owned startup record.');
  assert(Number(property(imageProperties, 'Pkg.Revision')) === run.image_revision
    && Number(property(imageProperties, 'AndroidVersion.ApiLevel')) === expectedApi,
    'Installed image revision/API differs from the owned startup record.');
  assert(property(imageProperties, 'SystemImage.Abi') === 'x86_64' && property(imageProperties, 'SystemImage.TagId') === 'default'
    && Number(property(imageProperties, 'AndroidVersion.ExtensionLevel')) === profile.extension,
  'Installed image ABI/tag/extension differs from the fixed owned profile.');
  report.setup_provenance = validateSetupBinding(profile, run, JSON.parse(setupBytes.toString('utf8').replace(/^\uFEFF/, '')),
    { setup: sha256(setupBytes), image_properties: sha256(imagePropertiesBytes),
      image_registration: sha256(imageRegistrationBytes), emulator_properties: sha256(emulatorPropertiesBytes) });
  report.run_provenance = {
    source: 'artifacts/android-emulator/run.json', sha256: createHash('sha256').update(runBytes).digest('hex'),
    avd_path: path.relative(root, expectedAvdPath).replaceAll('\\', '/'),
    created_at: run.created_at, startup_age_millis: runAgeMillis, freshness_verified: true,
    api: run.api, image: run.image, image_revision: run.image_revision,
    emulator_version: run.emulator_version, cpu_acceleration: run.cpu_acceleration, graphics: run.graphics,
    installed_tool_properties_match: true, launcher_pid_from_run_record: run.pid,
    launcher_or_qemu_pid_independently_verified: false
  };
  if (expectedApi === 36) Object.assign(report.run_provenance, {
    setup_report: run.setup_report, setup_report_sha256: run.setup_report_sha256,
    startup_recorded_config_sha256: run.config_sha256, startup_recorded_avd_registration_sha256: run.avd_registration_sha256,
    recorded_writable_paths_match_owned_avd: true, live_config_independently_rehashed_by_ui_harness: false,
    acceleration_backend: run.acceleration_backend, memory_megabytes: run.memory_megabytes
  });
  report.harness_sha256 = createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
  report.limitations.push('Project-local AVD path is bound through a fresh startup record and actual AVD name; launcher/qemu PID is not independently attested.');
  // Identity checks precede mutations. No enumeration or hardware-serial logging occurs.
  assert((await adb('get-state')).trim() === 'device', 'The dedicated emulator is not authorized/ready.');
  // The Windows adb console can emit CRCRLF. Normalize line endings, not the AVD identity.
  const avd = (await adb('emu', 'avd', 'name')).split(/[\r\n]+/)[0].trim();
  assert(avd === expectedAvd, 'Emulator AVD identity does not match the owned test AVD.');
  assert((await shell('getprop', 'ro.kernel.qemu')).trim() === '1', 'Target is not an Android emulator.');
  assert((await shell('getprop', 'sys.boot_completed')).trim() === '1', 'Emulator has not completed boot.');
  const api = Number((await shell('getprop', 'ro.build.version.sdk')).trim());
  assert(api === expectedApi, 'Actual emulator API does not match the API in its owned AVD name and run record.');
  const uptime = Number((await shell('cat', '/proc/uptime')).trim().split(/\s+/)[0]);
  assert(Number.isFinite(uptime) && uptime >= 0 && uptime * 1000 <= Date.now() - createdMillis + 120000,
    'Actual emulator uptime predates the fresh owned startup record.');
  const accounts = await shell('dumpsys', 'account');
  const accountCounts = [...accounts.matchAll(/Accounts:\s*(\d+)/g)].map(m => Number(m[1]));
  assert(accountCounts.length > 0 && accountCounts.every(n => n === 0), 'A fresh account-free emulator is required.');
  identityVerified = true;
  report.environment = { ...report.environment, actual_avd: avd, api,
    android_release: (await shell('getprop', 'ro.build.version.release')).trim(),
    build_fingerprint: (await shell('getprop', 'ro.build.fingerprint')).trim(),
    abi: (await shell('getprop', 'ro.product.cpu.abi')).trim(), uptime_seconds_at_start: uptime,
    qemu_verified: true, account_free_verified: true };
  const guestTimeZoneProperty = (await shell('getprop', 'persist.sys.timezone')).trim();
  assert(/^[A-Za-z0-9_+./:-]{1,80}$/.test(guestTimeZoneProperty), 'The guest default time-zone property is absent or malformed.');
  report.environment.guest_time_zone_property = guestTimeZoneProperty;
  report.environment.guest_time_zone_property_source = 'read_only_getprop_persist.sys.timezone';
  assert(report.environment.abi === 'x86_64' && report.environment.build_fingerprint.length > 0,
    'Actual emulator ABI/fingerprint is inconsistent with the owned image.');
  const size = /(?:Physical|Override) size:\s*(\d+)x(\d+)/g;
  const sizes = [...(await shell('wm', 'size')).matchAll(size)];
  assert(sizes.length, 'Emulator display size was unavailable.');
  [width, height] = sizes.at(-1).slice(1).map(Number);
  report.environment.display = { width, height };
  const audit = JSON.parse(await readFile(path.join(root, 'docs/review/android-local-inspector-validation.json'), 'utf8'));
  report.installed_apks = [];
  for (const [pkg, artifact] of [[INSPECT, audit.apk], [FIXTURE, audit.fixture_apk]]) {
    assert(artifact?.package_id === pkg && /^[a-f0-9]{64}$/.test(artifact.sha256), 'Native audited APK identity is missing.');
    const info = await shell('dumpsys', 'package', pkg);
    assert(info.includes(`versionName=${artifact.version_name}`), `Installed version differs from audited APK: ${pkg}`);
    const apkPath = (await shell('pm', 'path', pkg)).trim();
    assert(/^package:\/data\/app\/[A-Za-z0-9_~+./=-]+\/base\.apk$/.test(apkPath), 'Expected single owned base APK path was not returned.');
    const { stdout: bytes } = await exec(adbPath, ['-s', serial, 'exec-out', 'cat', apkPath.slice(8)], {
      cwd: root, timeout: 45000, encoding: null, maxBuffer: 8 * 1024 * 1024, windowsHide: true
    });
    const installedHash = createHash('sha256').update(bytes).digest('hex');
    assert(installedHash === artifact.sha256, `Installed APK bytes do not match audited APK: ${pkg}`);
    report.installed_apks.push({ package_id: pkg, version_name: artifact.version_name, sha256: installedHash, exact_audited_bytes_verified: true });
  }
  await mkdir(outputDir, { recursive: true });
  evidenceWritable = true;
  await save();

  await testcase('fresh_launch_and_permission_denial', async () => {
    await clearApp(INSPECT); await clearApp(FIXTURE); await mode('ignore', 'Controlled denied-access baseline.');
    await launch(FIXTURE); await state('Stopped · no measurement');
    await launch(INSPECT); await stopped();
    await click('Start local session'); await state('Choose 1–32 valid app identifiers.');
    await input('App identifiers, for example com.example.fixture', FIXTURE, 0);
    await click('Start local session'); await stopped();
    await state('Usage access is off. Enable it separately before starting.');
    return { denied_start_stopped: true, empty_scope_rejected: true };
  });

  await testcase('usage_settings_grant_is_not_session_consent', async () => {
    let usedSettings = false;
    await click('Open usage access settings');
    const ui = await snapshot('stock-usage-settings');
    let toggle = ui.nodes.find(n => /Switch/.test(n.class ?? '') && visible(n));
    if (!toggle) toggle = (await locate(n => n.text === 'Allow usage access', 'usage-toggle')).node;
    if (toggle) {
      await tap(toggle);
      const permission = await shell('cmd', 'appops', 'get', INSPECT, 'GET_USAGE_STATS');
      usedSettings = /GET_USAGE_STATS:\s*allow/.test(permission);
    }
    if (!usedSettings) {
      await mode('allow', 'Stock Settings toggle was not available or did not enable access; explicit emulator-only fallback.');
      report.unsupported.push('Stock Settings UI grant was not verified; session-consent separation used an explicit emulator-only AppOps grant fallback.');
    }
    else report.permission_controls.push({ control: 'stock_android_usage_settings_ui', value: 'allow' });
    // Settings was opened as a child of the inspector task. A launcher-style am start
    // can restore that child; return through Back before asserting inspector state.
    await shell('input', 'keyevent', 'KEYCODE_BACK');
    await wait(250);
    await launch(INSPECT); await stopped(); await state('Android usage access: allowed');
    return { settings_ui_grant: usedSettings, emulator_appops_fallback: !usedSettings, grant_alone_keeps_stopped: true };
  });

  await testcase('manual_scope_validation_and_system_picker', async () => {
    await input('App identifiers, for example com.example.fixture', 'invalid', 0);
    await click('Start local session'); await state('Choose 1–32 valid app identifiers.');
    await click('Clear local data and selection');
    await click('Add app');
    const picker = await snapshot('system-picker');
    const pickerPresent = picker.nodes.some(n => n.package && ![INSPECT, 'com.android.systemui', 'com.android.inputmethod.latin'].includes(n.package));
    let selected = false;
    if (pickerPresent) {
      const ownOption = (await locate(n => n.text === 'liveabit Lifecycle fixture', 'picker-owned-fixture')).node;
      if (ownOption) { await tap(ownOption); selected = true; }
      else await shell('input', 'keyevent', 'KEYCODE_BACK');
    }
    await launch(INSPECT);
    await stopped();
    if (selected) {
      const selectedScope = await collect('system-picker-selected-scope');
      assert(selectedScope.text.split('\n').includes(FIXTURE), 'System picker did not return the owned fixture package.');
    } else {
      report.unsupported.push('System picker positive selection was unavailable; exact-ID fallback was exercised instead.');
      await input('App identifiers, for example com.example.fixture', FIXTURE, 0);
    }
    return { exact_identifier_fallback_exercised: true, malformed_identifier_rejected: true,
      system_picker_opened: pickerPresent, picker_selection_runtime_verified: selected,
      picker_cancel_exercised: pickerPresent && !selected };
  });

  await testcase('no_preconsent_backfill_and_empty_is_unknown', async () => {
    await launch(FIXTURE); await click('Begin'); await wait(700); await click('Finish');
    await launch(INSPECT); await click('Start local session'); await state('Local session ready');
    const result = await inspect();
    assert(retainedCount(result.text) === 0, 'Pre-consent owned fixture records were retained.');
    assert(result.text.includes('No returned transitions. Usage is unknown.'), 'Empty read must remain unknown.');
    return { preconsent_record_count: 0, empty_read_reports_unknown: true };
  });

  for (const scenario of ['idle', 'screen_handoffs']) {
    await testcase(`controlled_${scenario}_timing_and_scope`, async () => {
      await click('Stop and clear observations'); await click('Start local session');
      await launch(FIXTURE); await click('Clear'); await click('Begin'); await state('Measurement active · values provisional');
      if (scenario === 'idle') await wait(idleMillis);
      else {
        for (let i = 0; i < 6; i++) { await wait(700); await click('Switch screen'); }
      }
      await click('Finish');
      const finished = await state('Finished · controlled comparison available');
      const values = fixtureValues(finished.text);
      assert(values.end > values.start && values.duration > 0, 'Fixture did not produce a positive bounded measurement.');
      assert(values.duration <= values.end - values.start + 2000, 'Fixture callback union exceeds its accepted window.');
      if (scenario === 'idle') assert(values.callbacks === 0, 'Idle fixture unexpectedly recorded lifecycle callbacks.');
      else assert(values.callbacks >= 12, 'Six handoffs did not produce the expected owned lifecycle callbacks.');
      await launch(INSPECT);
      const result = await inspect();
      assert(result.text.includes('Local session ready'), 'Controlled query unexpectedly stopped the inspector.');
      assert(result.text.includes('Activity resumed') && result.text.includes('Activity paused'), 'Owned activity transitions were not rendered.');
      assert(result.text.includes('not app visits') && result.text.includes('Source completeness is unknown'), 'Uncertainty labels are missing.');
      const retained = retainedCount(result.text); assert(retained >= 2, 'Expected owned transitions were absent.');
      // The only package-shaped lines in retained records must be the explicitly selected fixture.
      const ids = result.text.split('\n').filter(line => /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(line));
      assert(ids.length > 0 && ids.every(id => id === FIXTURE), 'Unexpected package identity appeared in retained output.');
      const comparison = await compare(values, { captureTiming: true });
      const timingContext = parseFixtureTimingDetails(comparison, retained);
      assert(values.start >= timingContext.session_start_wall_millis
        && values.end <= timingContext.query_cursor_wall_millis_exclusive,
      'Fixture baseline window escapes the displayed current session/query horizon.');
      const comparisonBlock = comparison.blocks.find(block => block.startsWith('Sum of retained inferred intervals in this window:')
        || block.startsWith('Unknown: no retained closed interval'));
      assert(comparisonBlock, 'The updated owned-fixture comparison result was not rendered.');
      const candidate = /Sum of retained inferred intervals in this window: (\d+) ms/.exec(comparisonBlock);
      const delta = /Difference \(retained sum − entered\): ([+-]\d+) ms/.exec(comparisonBlock);
      const discardWarning = 'Some estimates were discarded; this sum may omit parts of the window.';
      const discardedReasons = [
        'Several transitions share one time; earlier estimates were discarded.',
        'A pause has no known matching resume; earlier estimates were discarded.'
      ].filter(reason => result.text.includes(reason));
      const partial = result.text.includes(discardWarning) || discardedReasons.length > 0;
      if (partial) {
        assert(result.text.includes(discardWarning), 'The main retained sum omitted its explicit discarded-estimate warning.');
        assert(comparisonBlock.includes(discardWarning), 'The comparison omitted the main report discarded-estimate warning.');
        assert(discardedReasons.length > 0, 'Discarded estimates had no friendly explanation.');
        for (const reason of discardedReasons) assert(comparisonBlock.includes(reason), 'The comparison omitted the actual discarded-estimate reason.');
      }
      const known = candidate !== null;
      assert(clippedTimingDetailUnion(timingContext, values.start, values.end) === (known ? Number(candidate[1]) : null),
        'Exact timing detail intervals disagree with the displayed clipped comparison.');
      if (known) {
        assert(delta && Number(delta[1]) === Number(candidate[1]) - values.duration, 'Comparison signed difference is incorrect.');
        assert(Number(candidate[1]) <= values.end - values.start, 'Clipped inferred union exceeds the comparison window.');
        assert(comparisonBlock.includes('This is not an accuracy pass.'), 'Comparison incorrectly removed its accuracy limitation.');
      } else assert(comparisonBlock.includes('Unknown: no retained closed interval'), 'Missing estimate was not labelled unknown.');
      const measurement = { scenario, ...values, retained_transitions: retained,
        comparison_status: known ? (partial ? 'known_partial_unverified_estimate' : 'known_unverified_estimate') : 'unknown',
        estimates_discarded: partial, partial_estimate_warning_verified: partial,
        discarded_estimate_reasons: discardedReasons,
        candidate_duration_millis: known ? Number(candidate[1]) : null,
        signed_difference_millis: delta ? Number(delta[1]) : null,
        timing_context: timingContext, exact_context_clipped_comparison_matches: true,
        production_accuracy_pass: false, fixture_ui: finished.artifacts, comparison_ui: comparison.artifacts };
      report.measurements.push(measurement);
      const again = await inspect();
      assert(retainedCount(again.text) === retained, 'Repeated inspection duplicated existing retained records.');
      const repeatedContext = parseFixtureTimingDetails(again, retained);
      assert(repeatedContext.session_start_wall_millis === timingContext.session_start_wall_millis
        && repeatedContext.session_start_elapsed_millis === timingContext.session_start_elapsed_millis
        && repeatedContext.query_cursor_wall_millis_exclusive >= timingContext.query_cursor_wall_millis_exclusive
        && JSON.stringify(repeatedContext.events) === JSON.stringify(timingContext.events)
        && JSON.stringify(repeatedContext.closed_intervals) === JSON.stringify(timingContext.closed_intervals),
      'Repeated inspection changed the captured fixture records or its session anchors.');
      return { ...measurement, repeated_query_retained_count_stable: true, repeated_context_records_and_session_stable: true,
        repeated_timing_context: repeatedContext };
    });
  }
  assert(report.measurements.some(m => m.candidate_duration_millis !== null), 'Neither controlled trial produced a closed comparable estimate.');

  await testcase('comparison_validation_and_input_erasure', async () => {
    const values = report.measurements.at(-1);
    let result = await compare({ start: values.end, end: values.start, duration: values.duration });
    assert(result.text.includes('Enter a start code followed by a later end code.'), 'Reversed comparison window was not rejected.');
    await homeAndReturn('comparison_input_and_result_erasure');
    await click('Compare a controlled test (optional)');
    const cleared = await collect('comparison-inputs-after-home');
    assert(cleared.text.includes('Fixture start time code') && cleared.text.includes('Fixture end time code')
      && cleared.text.includes('Fixture callback duration (milliseconds)'), 'Comparison inputs were not erased after leaving.');
    assert(cleared.text.includes('No comparison yet.'), 'Comparison result survived leaving the inspector.');
    assertTimingDetailsAbsent(cleared.text, 'reopened_comparison_after_home', cleared.artifacts);
    assert(cleared.text.includes('Show fixture timing details'), 'The fixture timing disclosure did not reset after leaving.');
    await click('Hide controlled-test comparison');
    const hiddenComparison = await collect('hidden-controlled-comparison');
    assertTimingDetailsAbsent(hiddenComparison.text, 'outer_comparison_hidden', hiddenComparison.artifacts);
    result = await compare({ start: values.start, end: values.end, duration: values.end - values.start + 5000 });
    assert(result.text.includes('The entered callback duration does not fit this window.'), 'Out-of-window callback duration was not rejected.');
    result = await compare({ start: 1, end: 2, duration: 1 });
    assert(result.text.includes('These codes extend outside this local session.'), 'Pre-consent comparison window was not rejected.');
    return { reversed_window_rejected: true, oversized_duration_rejected: true,
      outside_session_window_rejected: true, home_clears_inputs_and_result: true };
  });

  await testcase('stop_fresh_horizon_and_restart', async () => {
    const beforeStop = await showFixtureTimingDetails('timing-context-before-stop', report.measurements.at(-1).retained_transitions);
    await click('Stop and clear observations'); await stopped();
    const selection = await collect('selection-after-stop'); assert(selection.text.includes(FIXTURE), 'Stop unexpectedly erased saved selection.');
    await click('Start local session'); const fresh = await inspect();
    assert(retainedCount(fresh.text) === 0, 'Fresh Start backfilled observations from the stopped session.');
    const beforeRestart = await showFixtureTimingDetails('timing-context-before-process-restart', 0, { openComparison: true });
    assert(beforeRestart.session_start_wall_millis > beforeStop.session_start_wall_millis,
      'Fresh Start did not replace the displayed previous session horizon.');
    await forceStop(INSPECT); await launch(INSPECT); const restarted = await stopped();
    assert(restarted.text.includes(FIXTURE), 'Process restart lost saved selection.');
    await forceStop(FIXTURE); await launch(FIXTURE); await state('Stopped · no measurement');
    return { stop_erases_observations: true, selection_preserved: true, fresh_horizon_no_backfill: true,
      inspector_process_restart_stopped: true, fixture_process_restart_empty: true,
      populated_timing_details_before_stop: beforeStop, empty_fresh_session_timing_details_before_restart: beforeRestart,
      stop_and_restart_erase_timing_details: true };
  });

  await testcase('permission_revocation_and_rapid_regrant', async () => {
    await launch(INSPECT); await click('Start local session');
    await launch(FIXTURE); await wait(500); await launch(INSPECT); const observed = await inspect();
    assert(retainedCount(observed.text) >= 2, 'Revocation trial lacked retained observations to erase.');
    const beforeRevocation = await showFixtureTimingDetails('timing-context-before-revocation', retainedCount(observed.text), { openComparison: true });
    await mode('ignore', 'Revoke while a live session contains owned synthetic observations.');
    await stopped(); await state('Android usage access: off or unavailable');
    await mode('allow', 'Restore OS permission; explicit Start remains required.'); await stopped();
    await click('Start local session');
    await launch(FIXTURE); await wait(500); await launch(INSPECT); const rapidObserved = await inspect();
    const beforeRapidRegrant = await showFixtureTimingDetails('timing-context-before-rapid-regrant', retainedCount(rapidObserved.text), { openComparison: true });
    // Consecutive commands deliberately avoid an intervening UI/render check.
    await shell('cmd', 'appops', 'set', INSPECT, 'GET_USAGE_STATS', 'ignore');
    await shell('cmd', 'appops', 'set', INSPECT, 'GET_USAGE_STATS', 'allow');
    report.permission_controls.push({ control: 'emulator_only_shell_appops', value: 'rapid_ignore_then_allow', reason: 'Require authority-boundary invalidation even when current permission is restored.' });
    await wait(500); await stopped(); await state('Android usage access: allowed');
    return { revoke_erases_observations: true, grant_does_not_restart: true, rapid_regrant_does_not_preserve_session: true,
      populated_timing_details_before_revocation: beforeRevocation,
      populated_timing_details_before_rapid_regrant: beforeRapidRegrant, revocation_and_rapid_regrant_erase_timing_details: true };
  });

  await testcase('clear_selection_persists_and_fixture_clear', async () => {
    await click('Start local session'); await launch(FIXTURE); await wait(500); await launch(INSPECT);
    const beforeClearReport = await inspect();
    const beforeClear = await showFixtureTimingDetails('timing-context-before-clear', retainedCount(beforeClearReport.text), { openComparison: true });
    await click('Clear local data and selection'); await stopped();
    await forceStop(INSPECT); await launch(INSPECT); const clear = await stopped();
    assert(!clear.text.split('\n').includes(FIXTURE), 'Cleared package selection returned after restart.');
    await launch(FIXTURE); await click('Begin'); await wait(400); await click('Finish'); await click('Clear');
    const fixture = await state('Stopped · no measurement');
    assert(!fixture.text.includes('Start time code:') && !fixture.text.includes('Finished own resumed union:'), 'Fixture Clear retained finished comparison values.');
    return { inspector_clear_persisted_across_restart: true, fixture_clear_erased_values: true,
      populated_timing_details_before_clear: beforeClear, clear_erases_timing_details: true };
  });

  report.result = 'pass_with_emulator_limits';
  report.summary = { passed: report.cases.filter(c => c.result === 'pass').length,
    failed: 0, known_comparisons: report.measurements.filter(m => m.candidate_duration_millis !== null).length,
    partial_comparisons: report.measurements.filter(m => m.estimates_discarded).length,
    physical_device_testing_required_before_production_claims: true };
} catch (error) {
  report.result = 'fail'; report.failed_stage = stage; report.failure = error.message;
  report.summary = { passed: report.cases.filter(c => c.result === 'pass').length, failed: report.cases.filter(c => c.result === 'fail').length || 1 };
  if (!evidenceWritable) process.stderr.write(`Preflight rejected without writing runtime evidence: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  // A separate finite cleanup budget stops only our two apps; root owns AVD lifecycle.
  commandDeadline = Date.now() + 15000;
  if (identityVerified) {
    for (const pkg of packages) { try { await forceStop(pkg); } catch { report.cleanup_incomplete = true; } }
  }
  report.finished_at = new Date().toISOString(); await save();
  process.stdout.write(`${report.result}: ${report.summary?.passed ?? 0} cases passed; ${evidenceWritable
    ? `evidence ${path.relative(root, reportPath)}` : 'preflight rejected; prior evidence preserved'}\n`);
}
