import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (condition, message) => { if (!condition) throw new Error(message); };
const args = process.argv.slice(2);
const profiles = new Map([
  [35, { api: 35, serial: 'emulator-5580', avd: 'liveabit-api35-test', setup: 'docs/review/android-emulator-setup.json',
    setupResult: 'pass_tool_setup_only', setupScope: 'project_local_android_emulator_tool_setup_only' }],
  [36, { api: 36, serial: 'emulator-5582', avd: 'liveabit-api36-test', setup: 'docs/review/android-api36-emulator-setup.json',
    setupResult: 'pass_image_setup_only', setupScope: 'project_local_api36_image_setup_only' }]
]);
const validHash = value => /^[a-f0-9]{64}$/.test(value ?? '');
const normalizedPath = value => path.resolve(value).toLowerCase();
const parseJson = bytes => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
function supportedSourceFile(info, allowEmpty = false) {
  return info.isFile() && Number.isSafeInteger(info.size) && (allowEmpty ? info.size >= 0 : info.size > 0)
    && info.size <= 8 * 1024 * 1024;
}
function runtimeEvidenceKind(name) {
  if (/^\d{4}-[a-z0-9-]+\.(?:xml|viewport\.json)$/.test(name)) return 'ui_snapshot';
  if (/^\d{4}-window-state-[a-f0-9]{12}-attempt-[1-3]\.(?:window-displays|window-all|input-method|window-displays-after)\.txt$/.test(name)) return 'window_diagnostic';
  if (/^\d{4}-launch-ime-[a-f0-9]{12}-(?:window-displays-before|window-all|input-method|window-displays-before-back|window-all-after-back|input-method-after-back|window-displays-after-back)\.txt$/.test(name))
    return 'launch_ime_diagnostic';
  return null;
}
const launchImeSources = [
  { kind: 'display_before', command: ['dumpsys', 'window', 'displays'], suffix: 'window-displays-before.txt' },
  { kind: 'window_all', command: ['dumpsys', 'window', '-a'], suffix: 'window-all.txt' },
  { kind: 'input_method', command: ['dumpsys', 'input_method'], suffix: 'input-method.txt' },
  { kind: 'display_before_back', command: ['dumpsys', 'window', 'displays'], suffix: 'window-displays-before-back.txt' },
  { kind: 'input_method_after_back', command: ['dumpsys', 'input_method'], suffix: 'input-method-after-back.txt' },
  { kind: 'window_after_back', command: ['dumpsys', 'window', '-a'], suffix: 'window-all-after-back.txt' },
  { kind: 'display_after_back', command: ['dumpsys', 'window', 'displays'], suffix: 'window-displays-after-back.txt' }
];
function launchImeDiagnosticReferences(raw) {
  const references = new Map(), ids = new Set(), hierarchyReferences = new Set();
  if (raw.launch_ime_recoveries === undefined) return references;
  check(Array.isArray(raw.launch_ime_recoveries) && raw.launch_ime_recoveries.length <= 20,
    'Launch IME records exceed their bounded scope.');
  if (!raw.launch_ime_recoveries.length) return references;
  const profile = runtimeProfile(raw);
  check(profile.api === 36, 'Launch IME recovery evidence is limited to the fixed owned API 36 profile.');
  const keys = ['id', 'scope', 'device', 'launched_package', 'stage', 'attempt_limit', 'back_command',
    'geometry_accepted', 'cached_ui_invalidated', 'result', 'back_send_attempted', 'back_command_completed',
    'started_at', 'finished_at', 'sources', 'preconditions_verified', 'same_focus_verified', 'ime_hidden_verified',
    'back_started_at', 'back_finished_at', 'reason', 'hierarchy_verified', 'post_launch_ui', 'post_launch_viewport'];
  const sourceKeys = ['kind', 'command', 'capture_started_at', 'capture_finished_at', 'raw_dump_available',
    'artifact', 'sha256', 'size_bytes', 'unavailable_reason'];
  const time = value => {
    if (typeof value !== 'string' || value.length > 40) return NaN;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return NaN;
    const canonical = new Date(parsed).toISOString();
    return value === canonical || value === canonical.replace('.000Z', 'Z') ? parsed : NaN;
  };
  const runtimeStart = time(raw.generated_at), runtimeFinish = raw.finished_at === undefined ? Infinity : time(raw.finished_at);
  check(Number.isFinite(runtimeStart) && runtimeFinish >= runtimeStart, 'Launch recovery runtime times are invalid.');
  for (const entry of raw.launch_ime_recoveries) {
    check(entry && typeof entry === 'object' && !Array.isArray(entry) && Object.keys(entry).every(key => keys.includes(key))
      && Number.isInteger(entry.id) && entry.id >= 1 && entry.id <= 20 && !ids.has(entry.id)
      && entry.scope === 'owned_api36_inspector_launch_ime_dismissal' && entry.launched_package === 'org.liveabit.inspect'
      && typeof entry.stage === 'string' && entry.stage.length > 0 && entry.stage.length <= 1000
      && entry.device?.api === 36 && entry.device.serial === profile.serial && entry.device.avd === profile.avd
      && Object.keys(entry.device).every(key => ['api', 'serial', 'avd'].includes(key))
      && entry.attempt_limit === 1 && JSON.stringify(entry.back_command) === JSON.stringify(['input', 'keyevent', '4'])
      && entry.geometry_accepted === false && entry.cached_ui_invalidated === true
      && ['reading', 'not_required', 'rejected_before_back', 'back_command_uncertain', 'rejected_after_back', 'recovered'].includes(entry.result)
      && ['back_send_attempted', 'back_command_completed', 'preconditions_verified', 'same_focus_verified', 'ime_hidden_verified', 'hierarchy_verified']
        .every(key => typeof entry[key] === 'boolean')
      && (!entry.back_command_completed || entry.back_send_attempted)
      && Array.isArray(entry.sources) && entry.sources.length <= launchImeSources.length
      && (entry.reason === undefined || (typeof entry.reason === 'string' && entry.reason.length > 0 && entry.reason.length <= 1000)),
    'Launch IME recovery metadata differs from its fixed one-Back owned scope.');
    ids.add(entry.id);
    if (entry.hierarchy_verified) {
      check(typeof entry.post_launch_ui === 'string'
        && /^artifacts\/android-emulator-test\/\d{4}-inspector-launch-after-ime-dismissal\.xml$/.test(entry.post_launch_ui)
        && entry.post_launch_viewport === entry.post_launch_ui.replace(/\.xml$/, '.viewport.json')
        && !hierarchyReferences.has(entry.post_launch_ui),
      'Launch recovery hierarchy evidence is not a unique exact paired owned UI snapshot.');
      hierarchyReferences.add(entry.post_launch_ui);
    } else check(entry.post_launch_ui === undefined && entry.post_launch_viewport === undefined,
      'Unverified launch hierarchy claims UI evidence.');
    const started = time(entry.started_at), finished = entry.finished_at === undefined ? Infinity : time(entry.finished_at);
    check(Number.isFinite(started) && started >= runtimeStart && started <= runtimeFinish && finished >= started
      && (entry.finished_at === undefined ? entry.result === 'reading' : finished <= runtimeFinish),
    'Launch IME entry times are invalid or outside the recorded runtime.');
    const prefix = String(entry.id).padStart(4, '0') + '-launch-ime-' + hash(raw.generated_at).slice(0, 12) + '-';
    let previousFinish = started;
    for (const [index, source] of entry.sources.entries()) {
      const expected = launchImeSources[index], captureStart = time(source.capture_started_at), captureFinish = time(source.capture_finished_at);
      check(source && typeof source === 'object' && !Array.isArray(source)
        && Object.keys(source).every(key => sourceKeys.includes(key)) && source.kind === expected.kind
        && JSON.stringify(source.command) === JSON.stringify(expected.command) && typeof source.raw_dump_available === 'boolean'
        && Number.isFinite(captureStart) && Number.isFinite(captureFinish) && captureStart >= previousFinish
        && captureFinish >= captureStart && captureFinish <= Math.min(finished, runtimeFinish),
      'Launch IME source command, order or times differ from the fixed sequential reads.');
      if (source.raw_dump_available) {
        const name = prefix + expected.suffix;
        check(source.unavailable_reason === undefined && source.artifact === 'artifacts/android-emulator-test/' + name
          && runtimeEvidenceKind(name) === 'launch_ime_diagnostic' && validHash(source.sha256)
          && Number.isSafeInteger(source.size_bytes) && source.size_bytes >= 0 && source.size_bytes <= 8 * 1024 * 1024
          && !references.has(name), 'Launch IME source path, size or hash is invalid.');
        references.set(name, source);
      } else check(source.artifact === undefined && source.sha256 === undefined && source.size_bytes === undefined
        && typeof source.unavailable_reason === 'string' && source.unavailable_reason.length > 0 && source.unavailable_reason.length <= 1000,
      'Unavailable launch IME source claims bytes or lacks a reason.');
      previousFinish = captureFinish;
    }
    if (entry.preconditions_verified) check(entry.sources.length >= 3
      && entry.sources.slice(0, 3).every(source => source.raw_dump_available),
    'Verified launch preconditions lack their first three available reads.');
    if (entry.same_focus_verified) check(entry.preconditions_verified && entry.sources.length >= 4
      && entry.sources.slice(0, 4).every(source => source.raw_dump_available),
    'Verified same focus lacks the verified preconditions and fourth available read.');
    check(entry.ime_hidden_verified === entry.hierarchy_verified,
      'Hidden-IME and hierarchy verification disagree with their joint runtime proof.');
    if (entry.ime_hidden_verified) check(entry.back_send_attempted && entry.back_command_completed
      && entry.preconditions_verified && entry.same_focus_verified
      && entry.sources.length === launchImeSources.length && entry.sources.every(source => source.raw_dump_available),
    'Post-Back hidden-IME/hierarchy proof lacks a completed command or all seven available reads.');
    if (entry.back_send_attempted) {
      const backStart = time(entry.back_started_at), backFinish = entry.back_finished_at === undefined ? Infinity : time(entry.back_finished_at);
      check(entry.preconditions_verified && entry.same_focus_verified && entry.sources.length >= 4
        && entry.sources.slice(0, 4).every(source => source.raw_dump_available)
        && Number.isFinite(backStart) && backStart >= time(entry.sources[3].capture_finished_at)
        && backStart <= Math.min(finished, runtimeFinish) && backFinish >= backStart
        && (entry.back_finished_at === undefined ? !entry.back_command_completed : backFinish <= Math.min(finished, runtimeFinish)),
      'Launch IME Back lacks its four available preconditions or finite command audit.');
      if (entry.sources.length > 4) check(entry.back_command_completed && Number.isFinite(backFinish)
        && time(entry.sources[4].capture_started_at) >= backFinish, 'Post-Back evidence predates an audited completed Back command.');
    } else check(entry.back_started_at === undefined && entry.back_finished_at === undefined && entry.sources.length <= 4,
      'Launch IME evidence claims Back command times or later reads without an attempt.');
    if (entry.result === 'not_required') check(!entry.back_send_attempted && entry.sources.length === 1 && entry.sources[0].raw_dump_available
      && !entry.preconditions_verified && !entry.same_focus_verified && !entry.ime_hidden_verified && !entry.hierarchy_verified,
      'An unnecessary launch recovery must retain only its available first display read without Back.');
    if (entry.result === 'rejected_before_back') check(!entry.back_send_attempted, 'Before-Back rejection claims an attempted Back.');
    if (entry.result === 'back_command_uncertain') check(entry.back_send_attempted && !entry.back_command_completed,
      'Uncertain Back metadata claims completion or no attempt.');
    if (entry.result === 'rejected_after_back') check(entry.back_send_attempted && entry.back_command_completed,
      'After-Back rejection lacks a completed command.');
    if (entry.result === 'recovered') check(entry.back_send_attempted && entry.back_command_completed
      && entry.preconditions_verified && entry.same_focus_verified && entry.ime_hidden_verified
      && entry.hierarchy_verified
      && entry.sources.length === launchImeSources.length && entry.sources.every(source => source.raw_dump_available),
    'Recovered launch IME state lacks all seven available reads and proven recovery flags.');
  }
  return references;
}
function windowDiagnosticReferences(raw) {
  const references = new Map();
  const add = (item, suffix) => {
    check(typeof item.raw_dump_available === 'boolean', 'Diagnostic source availability is missing.');
    if (!item.raw_dump_available) {
      check(item.artifact === undefined && item.sha256 === undefined && item.size_bytes === undefined,
        'Unavailable window dump claims source evidence.'); return;
    }
    check(typeof item.artifact === 'string' && item.artifact.startsWith('artifacts/android-emulator-test/'),
      'Window diagnostic source path is outside the runtime evidence directory.');
    const name = item.artifact.slice('artifacts/android-emulator-test/'.length);
    check(runtimeEvidenceKind(name) === 'window_diagnostic' && name.endsWith(`.${suffix}`) && validHash(item.sha256)
      && Number.isSafeInteger(item.size_bytes) && item.size_bytes >= 0 && item.size_bytes <= 8 * 1024 * 1024
      && !references.has(name), 'Window diagnostic source name, size or identity is invalid.');
    references.set(name, item);
  };
  const sources = [
    { kind: 'window_all', command: ['dumpsys', 'window', '-a'], suffix: 'window-all.txt' },
    { kind: 'input_method', command: ['dumpsys', 'input_method'], suffix: 'input-method.txt' },
    { kind: 'display_after', command: ['dumpsys', 'window', 'displays'], suffix: 'window-displays-after.txt' }
  ];
  check(raw.window_state_retries === undefined || Array.isArray(raw.window_state_retries), 'Window retry evidence is malformed.');
  for (const entry of raw.window_state_retries ?? []) {
    check(Array.isArray(entry.attempts) && entry.attempts.length > 0 && entry.attempts.length <= 3,
      'Window retry attempts exceed their bounded evidence scope.');
    for (const [index, item] of entry.attempts.entries()) {
      check(item.attempt === index + 1 && ['rejected', 'accepted'].includes(item.result)
        && typeof item.raw_dump_available === 'boolean', 'Window retry attempt metadata is malformed.');
      add(item, 'window-displays.txt');
      const evidence = item.ime_supplemental_evidence;
      if (evidence === undefined) continue;
      check(item.result === 'rejected' && item.raw_dump_available
        && item.reason === 'A visible occluding inset has invalid or empty bounds.'
        && evidence.scope === 'diagnostic_only_visible_bottom_zero_ime'
        && Object.keys(evidence).every(key => ['scope', 'trigger_window_displays_sha256', 'trigger_observed_at', 'device',
          'source_read_limit', 'sequential_after_trigger', 'simultaneous_with_trigger', 'before_cleanup', 'geometry_accepted',
          'gestures_sent_by_capture', 'capture_complete', 'sampled_consistency_not_atomic_attestation', 'sampled_consistency', 'sources'].includes(key))
        && evidence.trigger_window_displays_sha256 === item.sha256 && evidence.trigger_observed_at === item.observed_at
        && evidence.device?.serial === raw.environment?.serial && evidence.device.api === raw.environment.api
        && evidence.device.avd === raw.environment.expected_avd
        && Object.keys(evidence.device).every(key => ['serial', 'api', 'avd'].includes(key)) && evidence.source_read_limit === 3
        && evidence.sequential_after_trigger === true && evidence.simultaneous_with_trigger === false && evidence.before_cleanup === true
        && evidence.geometry_accepted === false && evidence.gestures_sent_by_capture === 0
        && evidence.sampled_consistency_not_atomic_attestation === true && typeof evidence.capture_complete === 'boolean'
        && Array.isArray(evidence.sources) && evidence.sources.length <= 3
        && (!evidence.capture_complete || evidence.sources.length === 3)
        && ['unknown', 'consistent_observed_geometry_and_focus', 'changed_observed_geometry_or_focus'].includes(evidence.sampled_consistency),
      'IME supplemental evidence differs from its fixed diagnostic-only scope.');
      let previousFinish = Date.parse(item.observed_at);
      check(Number.isFinite(previousFinish), 'IME trigger time is invalid.');
      for (const [sourceIndex, source] of evidence.sources.entries()) {
        const expected = sources[sourceIndex], start = Date.parse(source.capture_started_at), finish = Date.parse(source.capture_finished_at);
        check(source.kind === expected.kind && JSON.stringify(source.command) === JSON.stringify(expected.command)
          && Object.keys(source).every(key => ['kind', 'command', 'capture_started_at', 'capture_finished_at',
            'raw_dump_available', 'unavailable_reason', 'artifact', 'sha256', 'size_bytes'].includes(key))
          && Number.isFinite(start) && Number.isFinite(finish) && start >= previousFinish && finish >= start,
        'Supplemental command, order or timestamps differ from their fixed read-only source.');
        check(source.raw_dump_available || (typeof source.unavailable_reason === 'string'
          && source.unavailable_reason.length > 0 && source.unavailable_reason.length <= 1000), 'Unavailable supplemental source lacks an explicit reason.');
        if (source.raw_dump_available) check(source.unavailable_reason === undefined
          && source.artifact === item.artifact.replace(/\.window-displays\.txt$/, `.${expected.suffix}`),
        'Supplemental source path does not bind this rejected attempt or also claims unavailability.');
        add(source, expected.suffix); previousFinish = finish;
      }
      if (evidence.sampled_consistency !== 'unknown') check(evidence.sources.length === 3
        && evidence.sources[2].raw_dump_available, 'Bracket consistency lacks an available later display source.');
    }
  }
  return references;
}
function runtimeProfile(raw) {
  const profile = profiles.get(raw.environment?.api);
  check(profile && raw.scope === 'dedicated_owned_emulator_runtime_ui' && raw.environment.serial === profile.serial
    && raw.environment.expected_avd === profile.avd && raw.environment.actual_avd === profile.avd
    && raw.environment.qemu_verified === true && raw.environment.account_free_verified === true,
  'This is not a verified fixed API 35/5580 or API 36/5582 owned emulator run.');
  return profile;
}
function checkStartup(raw, owned, profile, startupHash) {
  const expectedPath = path.resolve(root, 'artifacts/android-emulator/avd', `${profile.avd}.avd`);
  check(owned.serial === profile.serial && owned.name === profile.avd && owned.api === profile.api
    && owned.image === `system-images;android-${profile.api};default;x86_64` && owned.image_revision === 2
    && owned.emulator_version === '37.2.12' && typeof owned.avd_path === 'string'
    && normalizedPath(owned.avd_path) === normalizedPath(expectedPath)
    && owned.os_settings_changed === false && owned.contains_personal_data === false,
  'Startup identity differs from the fixed owned runtime profile.');
  check(startupHash === raw.run_provenance?.sha256 && raw.run_provenance.source === 'artifacts/android-emulator/run.json'
    && owned.created_at === raw.run_provenance.created_at && owned.pid === raw.run_provenance.launcher_pid_from_run_record,
  'Startup bytes differ from the runtime-recorded provenance.');
  const created = Date.parse(owned.created_at), start = Date.parse(raw.generated_at);
  check(Number.isFinite(created) && created <= start && start - created <= 6 * 60 * 60 * 1000, 'Startup time is outside the original owned freshness bound.');
  if (profile.api === 36) {
    check(owned.setup_report === profile.setup && validHash(owned.setup_report_sha256)
      && validHash(owned.config_sha256) && validHash(owned.avd_registration_sha256)
      && owned.cpu_acceleration === 'on' && owned.acceleration_backend === 'WHPX' && owned.memory_megabytes === 2048,
    'API 36 startup configuration/setup provenance is incomplete.');
    for (const [field, filename] of [['writable_data_path', 'userdata-qemu.img'], ['writable_cache_path', 'cache.img'], ['writable_sdcard_path', 'sdcard.img']])
      check(typeof owned[field] === 'string' && path.isAbsolute(owned[field])
        && normalizedPath(owned[field]) === normalizedPath(path.join(expectedPath, filename)), 'API 36 recorded writable path is outside its exact owned AVD file.');
  }
}
function checkSetup(raw, owned, setup, profile, setupHash) {
  const provenance = raw.setup_provenance;
  check(provenance?.source === profile.setup && provenance.sha256 === setupHash && validHash(setupHash)
    && provenance.result === profile.setupResult && provenance.scope === profile.setupScope
    && setup.result === profile.setupResult && setup.scope === profile.setupScope
    && setup.license_file_created_or_modified === false && setup.emulator_started === false
    && provenance.runtime_verified_by_setup === false && provenance.large_image_files_rehashed_by_ui_harness === false
    && provenance.actual_small_sdk_identity_files_hashed === true,
  'Image setup provenance differs or overclaims runtime verification.');
  for (const field of ['image_source_properties_sha256', 'image_registration_sha256', 'emulator_source_properties_sha256'])
    check(validHash(provenance[field]), 'A bound SDK identity hash is missing.');
  const hasStartupSetup = owned.setup_report !== undefined || owned.setup_report_sha256 !== undefined;
  check(provenance.setup_bytes_match_startup_hash === hasStartupSetup
    && provenance.legacy_startup_setup_binding_absent === !hasStartupSetup
    && ((profile.api === 35 && !hasStartupSetup) || (owned.setup_report === profile.setup && owned.setup_report_sha256 === setupHash)),
  'Setup bytes differ from their startup binding or explicit API 35 legacy scope.');
  if (profile.api === 36) check(setup.pin?.package_id === 'system-images;android-36;default;x86_64'
    && setup.pin.revision === '2' && setup.pin.api === 36
    && setup.layout?.source_properties_sha256 === provenance.image_source_properties_sha256
    && setup.layout.registration_sha256 === provenance.image_registration_sha256, 'API 36 setup identity differs from the runtime binding.');
  else {
    const image = setup.packages?.filter(value => value.package_id === 'system-images;android-35;default;x86_64');
    const emulator = setup.packages?.filter(value => value.package_id === 'emulator');
    check(image?.length === 1 && emulator?.length === 1 && image[0].revision === '2' && emulator[0].revision === '37.2.12'
      && image[0].layout?.source_properties_sha256 === provenance.image_source_properties_sha256
      && image[0].layout?.registration?.sha256 === provenance.image_registration_sha256
      && emulator[0].layout?.source_properties_sha256 === provenance.emulator_source_properties_sha256,
    'API 35 setup identities differ from the runtime binding.');
  }
}
function launchImeSelfTests() {
  const h = 'a'.repeat(64); let valid = 0, rejected = 0;
  const fixture = () => {
    const raw = { scope: 'dedicated_owned_emulator_runtime_ui', generated_at: '2026-10-07T00:01:00Z',
      finished_at: '2026-10-07T00:02:00Z', environment: { api: 36, serial: 'emulator-5582',
        expected_avd: 'liveabit-api36-test', actual_avd: 'liveabit-api36-test', qemu_verified: true, account_free_verified: true } };
    const at = second => '2026-10-07T00:01:' + String(second).padStart(2, '0') + 'Z';
    const prefix = '0001-launch-ime-' + hash(raw.generated_at).slice(0, 12) + '-';
    raw.launch_ime_recoveries = [{ id: 1, scope: 'owned_api36_inspector_launch_ime_dismissal',
      device: { api: 36, serial: 'emulator-5582', avd: 'liveabit-api36-test' }, launched_package: 'org.liveabit.inspect',
      stage: 'fresh_launch_and_permission_denial', attempt_limit: 1, back_command: ['input', 'keyevent', '4'],
      geometry_accepted: false, cached_ui_invalidated: true, result: 'recovered', back_send_attempted: true,
      back_command_completed: true, started_at: at(1), finished_at: at(10), back_started_at: at(5), back_finished_at: at(6),
      preconditions_verified: true, same_focus_verified: true, ime_hidden_verified: true, hierarchy_verified: true,
      post_launch_ui: 'artifacts/android-emulator-test/0001-inspector-launch-after-ime-dismissal.xml',
      post_launch_viewport: 'artifacts/android-emulator-test/0001-inspector-launch-after-ime-dismissal.viewport.json',
      sources: launchImeSources.map((expected, index) => {
        const second = index + 1 + (index >= 4 ? 1 : 0);
        return { kind: expected.kind, command: [...expected.command], capture_started_at: at(second),
          capture_finished_at: at(second + 1), raw_dump_available: true,
          artifact: 'artifacts/android-emulator-test/' + prefix + expected.suffix, sha256: h, size_bytes: 0 };
      }) }];
    return raw;
  };
  const beforeBack = (raw, result, sourceCount) => {
    const entry = raw.launch_ime_recoveries[0];
    Object.assign(entry, { result, sources: entry.sources.slice(0, sourceCount), back_send_attempted: false,
      back_command_completed: false, preconditions_verified: false, same_focus_verified: false,
      ime_hidden_verified: false, hierarchy_verified: false });
    for (const key of ['back_started_at', 'back_finished_at', 'post_launch_ui', 'post_launch_viewport']) delete entry[key];
    return raw;
  };
  check(launchImeDiagnosticReferences({}).size === 0
    && launchImeDiagnosticReferences({ launch_ime_recoveries: [] }).size === 0, 'Legacy or empty launch evidence was changed.'); valid++;
  check(launchImeDiagnosticReferences(fixture()).size === 7, 'Complete launch recovery lost its bound sources.'); valid++;
  check(launchImeDiagnosticReferences(beforeBack(fixture(), 'not_required', 1)).size === 1,
    'Valid geometry without Back lost its first source.'); valid++;
  const unavailable = beforeBack(fixture(), 'rejected_before_back', 2);
  Object.assign(unavailable.launch_ime_recoveries[0].sources[1], { raw_dump_available: false, unavailable_reason: 'synthetic unavailable' });
  for (const key of ['artifact', 'sha256', 'size_bytes']) delete unavailable.launch_ime_recoveries[0].sources[1][key];
  check(launchImeDiagnosticReferences(unavailable).size === 1, 'Partial before-Back failure falsely claimed unavailable bytes.'); valid++;
  const uncertain = fixture(), uncertainEntry = uncertain.launch_ime_recoveries[0];
  Object.assign(uncertainEntry, { result: 'back_command_uncertain', back_command_completed: false, sources: uncertainEntry.sources.slice(0, 4),
    same_focus_verified: true, ime_hidden_verified: false, hierarchy_verified: false });
  for (const key of ['back_finished_at', 'post_launch_ui', 'post_launch_viewport']) delete uncertainEntry[key];
  check(launchImeDiagnosticReferences(uncertain).size === 4, 'Uncertain single Back lost its precommand audit.'); valid++;
  const after = fixture(), afterEntry = after.launch_ime_recoveries[0];
  Object.assign(afterEntry, { result: 'rejected_after_back', sources: afterEntry.sources.slice(0, 5),
    same_focus_verified: true, ime_hidden_verified: false, hierarchy_verified: false });
  delete afterEntry.post_launch_ui; delete afterEntry.post_launch_viewport;
  check(launchImeDiagnosticReferences(after).size === 5, 'Partial after-Back failure was rejected as a complete recovery.'); valid++;
  const reading = beforeBack(fixture(), 'reading', 0);
  delete reading.launch_ime_recoveries[0].finished_at;
  check(launchImeDiagnosticReferences(reading).size === 0, 'Interrupted empty reading record claimed source data.'); valid++;
  const readingPreconditions = beforeBack(fixture(), 'reading', 3), readingPreconditionsEntry = readingPreconditions.launch_ime_recoveries[0];
  readingPreconditionsEntry.preconditions_verified = true; delete readingPreconditionsEntry.finished_at;
  check(launchImeDiagnosticReferences(readingPreconditions).size === 3,
    'Legitimate verified preconditions before the fourth read were rejected.'); valid++;
  const readingFocus = beforeBack(fixture(), 'reading', 4), readingFocusEntry = readingFocus.launch_ime_recoveries[0];
  readingFocusEntry.preconditions_verified = true; readingFocusEntry.same_focus_verified = true; delete readingFocusEntry.finished_at;
  check(launchImeDiagnosticReferences(readingFocus).size === 4,
    'Legitimate verified same focus before Back intent was rejected.'); valid++;
  const persistenceFailed = fixture(); persistenceFailed.launch_ime_recoveries[0].result = 'rejected_after_back';
  persistenceFailed.launch_ime_recoveries[0].reason = 'synthetic final persistence failure';
  check(launchImeDiagnosticReferences(persistenceFailed).size === 7,
    'A final persistence failure erased already proven post-Back evidence.'); valid++;
  const maximum = fixture(), first = maximum.launch_ime_recoveries[0];
  maximum.launch_ime_recoveries = Array.from({ length: 20 }, (_, index) => {
    const entry = structuredClone(first); entry.id = index + 1;
    for (const source of entry.sources) source.artifact = source.artifact.replace('/0001-launch-ime-', '/' + String(entry.id).padStart(4, '0') + '-launch-ime-');
    entry.post_launch_ui = entry.post_launch_ui.replace('/0001-', '/' + String(entry.id).padStart(4, '0') + '-');
    entry.post_launch_viewport = entry.post_launch_viewport.replace('/0001-', '/' + String(entry.id).padStart(4, '0') + '-');
    return entry;
  });
  check(launchImeDiagnosticReferences(maximum).size === 140, 'The documented maximum launch scope was not preserved.'); valid++;
  const reject = mutate => {
    const raw = fixture(); mutate(raw, raw.launch_ime_recoveries[0]);
    let failed = false; try { launchImeDiagnosticReferences(raw); } catch { failed = true; }
    check(failed, 'Invalid launch recovery scope, source or completion claim was accepted.'); rejected++;
  };
  for (const mutate of [
    raw => { raw.environment.api = 35; raw.environment.serial = 'emulator-5580'; raw.environment.expected_avd = 'liveabit-api35-test'; raw.environment.actual_avd = 'liveabit-api35-test'; },
    raw => { raw.environment.serial = 'phone'; },
    (raw, entry) => { entry.device.serial = 'phone'; }, (raw, entry) => { entry.device.api = 35; },
    (raw, entry) => { entry.device.private_context = 'extra'; }, (raw, entry) => { entry.launched_package = 'org.other.app'; },
    (raw, entry) => { entry.scope = 'generic_ime_recovery'; }, (raw, entry) => { entry.id = 21; },
    (raw, entry) => { entry.id = 0; }, (raw, entry) => { entry.id = 1.5; },
    (raw, entry) => { raw.launch_ime_recoveries.push(structuredClone(entry)); },
    (raw, entry) => { raw.launch_ime_recoveries = Array(21).fill(entry); },
    (raw, entry) => { entry.attempt_limit = 2; }, (raw, entry) => { entry.back_command = ['input', 'tap', '1', '1']; },
    (raw, entry) => { entry.geometry_accepted = true; }, (raw, entry) => { entry.cached_ui_invalidated = false; },
    (raw, entry) => { entry.production_accuracy_pass = true; }, (raw, entry) => { entry.stage = 'x'.repeat(1001); },
    (raw, entry) => { entry.reason = 'x'.repeat(1001); }, (raw, entry) => { entry.ime_hidden_verified = false; },
    (raw, entry) => { delete entry.same_focus_verified; }, (raw, entry) => { entry.preconditions_verified = 'true'; },
    (raw, entry) => { entry.sources.pop(); }, (raw, entry) => { entry.sources.push(entry.sources[6]); },
    (raw, entry) => { entry.sources[0].kind = 'input_method'; },
    (raw, entry) => { entry.sources[0].command = ['dumpsys', 'account']; },
    (raw, entry) => { entry.sources[0].extra_context = 'extra'; },
    (raw, entry) => { entry.sources[0].artifact = 'artifacts/android-emulator-test/../outside.txt'; },
    (raw, entry) => { entry.sources[0].artifact = entry.sources[0].artifact.replace('0001-launch-ime-', '0002-launch-ime-'); },
    (raw, entry) => { entry.sources[0].artifact = entry.sources[0].artifact.replace('-window-displays-before.txt', '-window-all.txt'); },
    (raw, entry) => { entry.sources[0].sha256 = 'bad'; }, (raw, entry) => { entry.sources[0].size_bytes = -1; },
    (raw, entry) => { entry.sources[0].size_bytes = 8 * 1024 * 1024 + 1; },
    (raw, entry) => { entry.sources[0].raw_dump_available = false; },
    (raw, entry) => { entry.sources[0].unavailable_reason = 'also unavailable'; },
    (raw, entry) => { entry.sources[0].capture_started_at = 'bad'; },
    (raw, entry) => { entry.sources[0].capture_started_at = '2026-10-07T00:00:00Z'; },
    (raw, entry) => { entry.sources[1].capture_started_at = entry.started_at; },
    (raw, entry) => { entry.sources[6].capture_finished_at = '2026-10-07T00:03:00Z'; },
    (raw, entry) => { entry.finished_at = entry.started_at; }, (raw, entry) => { delete entry.finished_at; },
    (raw, entry) => { delete entry.back_started_at; }, (raw, entry) => { delete entry.back_finished_at; },
    (raw, entry) => { entry.back_started_at = entry.started_at; },
    (raw, entry) => { entry.back_send_attempted = false; },
    (raw, entry) => { entry.result = 'back_command_uncertain'; },
    (raw, entry) => { entry.result = 'rejected_before_back'; },
    (raw, entry) => { entry.hierarchy_verified = false; },
    (raw, entry) => { entry.post_launch_ui = 'artifacts/android-emulator-test/0001-unowned.xml'; },
    (raw, entry) => { entry.post_launch_viewport = 'artifacts/android-emulator-test/0002-inspector-launch-after-ime-dismissal.viewport.json'; }
  ]) reject(mutate);
  reject(raw => { beforeBack(raw, 'not_required', 2); });
  reject(raw => {
    beforeBack(raw, 'rejected_before_back', 1); const source = raw.launch_ime_recoveries[0].sources[0];
    source.raw_dump_available = false; for (const key of ['artifact', 'sha256', 'size_bytes']) delete source[key];
  });
  reject((raw, entry) => {
    const second = structuredClone(entry); second.id = 2;
    for (const source of second.sources) source.artifact = source.artifact.replace('/0001-launch-ime-', '/0002-launch-ime-');
    raw.launch_ime_recoveries.push(second);
  });
  for (const result of ['rejected_after_back', 'back_command_uncertain', 'reading']) reject((raw, entry) => {
    entry.result = result; entry.same_focus_verified = false; entry.ime_hidden_verified = false; entry.hierarchy_verified = false;
    delete entry.post_launch_ui; delete entry.post_launch_viewport;
    entry.sources = entry.sources.slice(0, result === 'rejected_after_back' ? 5 : 4);
    if (result === 'back_command_uncertain') { entry.back_command_completed = false; delete entry.back_finished_at; }
    if (result === 'reading') delete entry.finished_at;
  });
  reject(raw => { beforeBack(raw, 'reading', 2); raw.launch_ime_recoveries[0].preconditions_verified = true; });
  reject(raw => {
    beforeBack(raw, 'reading', 3); const entry = raw.launch_ime_recoveries[0];
    entry.preconditions_verified = true; entry.same_focus_verified = true;
  });
  reject(raw => { beforeBack(raw, 'not_required', 1); raw.launch_ime_recoveries[0].preconditions_verified = true; });
  reject(raw => { beforeBack(raw, 'rejected_before_back', 1); raw.launch_ime_recoveries[0].ime_hidden_verified = true; });
  reject((raw, entry) => {
    entry.result = 'rejected_after_back'; entry.sources = entry.sources.slice(0, 6);
  });
  for (const [sourceCount, index] of [[3, 2], [4, 3]]) reject(raw => {
    beforeBack(raw, 'reading', sourceCount); const entry = raw.launch_ime_recoveries[0];
    entry.preconditions_verified = true; entry.same_focus_verified = sourceCount === 4;
    const source = entry.sources[index]; source.raw_dump_available = false; source.unavailable_reason = 'synthetic missing phase source';
    for (const key of ['artifact', 'sha256', 'size_bytes']) delete source[key];
  });
  reject(raw => {
    beforeBack(raw, 'rejected_before_back', 4); const entry = raw.launch_ime_recoveries[0];
    entry.preconditions_verified = true; entry.same_focus_verified = true;
    entry.ime_hidden_verified = true; entry.hierarchy_verified = true;
    entry.post_launch_ui = 'artifacts/android-emulator-test/0001-inspector-launch-after-ime-dismissal.xml';
    entry.post_launch_viewport = 'artifacts/android-emulator-test/0001-inspector-launch-after-ime-dismissal.viewport.json';
  });
  return { valid_metadata_cases: valid, rejected_metadata_cases: rejected, entry_limit: 20, source_limit: 7,
    legacy_field_absent_supported: true, partial_and_uncertain_results_preserved: true,
    device_accessed: false, files_written: false, runtime_verified: false };
}
function selfTests() {
  const h = 'a'.repeat(64); let valid = 0, rejected = 0;
  const fixture = api => {
    const profile = profiles.get(api), avd = path.resolve(root, 'artifacts/android-emulator/avd', `${profile.avd}.avd`);
    const owned = { name: profile.avd, serial: profile.serial, api, avd_path: avd, image: `system-images;android-${api};default;x86_64`,
      image_revision: 2, emulator_version: '37.2.12', os_settings_changed: false, contains_personal_data: false,
      created_at: '2026-10-07T00:00:00Z', pid: 1 };
    if (api === 36) Object.assign(owned, { setup_report: profile.setup, setup_report_sha256: h, config_sha256: h, avd_registration_sha256: h,
      cpu_acceleration: 'on', acceleration_backend: 'WHPX', memory_megabytes: 2048,
      writable_data_path: path.join(avd, 'userdata-qemu.img'), writable_cache_path: path.join(avd, 'cache.img'), writable_sdcard_path: path.join(avd, 'sdcard.img') });
    const raw = { scope: 'dedicated_owned_emulator_runtime_ui', generated_at: '2026-10-07T00:01:00Z',
      environment: { api, serial: profile.serial, expected_avd: profile.avd, actual_avd: profile.avd, qemu_verified: true, account_free_verified: true },
      run_provenance: { source: 'artifacts/android-emulator/run.json', sha256: h, created_at: owned.created_at, launcher_pid_from_run_record: 1 },
      setup_provenance: { source: profile.setup, sha256: h, result: profile.setupResult, scope: profile.setupScope,
        runtime_verified_by_setup: false, large_image_files_rehashed_by_ui_harness: false, actual_small_sdk_identity_files_hashed: true,
        image_source_properties_sha256: h, image_registration_sha256: h, emulator_source_properties_sha256: h,
        setup_bytes_match_startup_hash: api === 36, legacy_startup_setup_binding_absent: api === 35 } };
    const setup = { result: profile.setupResult, scope: profile.setupScope, license_file_created_or_modified: false, emulator_started: false };
    if (api === 36) Object.assign(setup, { pin: { package_id: owned.image, api: 36, revision: '2' }, layout: { source_properties_sha256: h, registration_sha256: h } });
    else setup.packages = [{ package_id: owned.image, revision: '2', layout: { source_properties_sha256: h, registration: { sha256: h } } },
      { package_id: 'emulator', revision: '37.2.12', layout: { source_properties_sha256: h } }];
    return { profile, owned, raw, setup };
  };
  for (const api of [35, 36]) {
    const value = fixture(api); runtimeProfile(value.raw); checkStartup(value.raw, value.owned, value.profile, h);
    checkSetup(value.raw, value.owned, value.setup, value.profile, h); valid++;
  }
  const reject = work => { let failed = false; try { work(); } catch { failed = true; } check(failed, 'Invalid pure archive profile test accepted.'); rejected++; };
  for (const change of [value => { value.raw.environment.serial = 'phone'; }, value => { value.raw.environment.api = 37; },
    value => { value.raw.environment.serial = 'emulator-5580'; }, value => { value.raw.environment.actual_avd = 'liveabit-api35-test'; }]) {
    const value = fixture(36); change(value); reject(() => runtimeProfile(value.raw));
  }
  for (const change of [value => { value.owned.api = 35; }, value => { value.owned.writable_cache_path = path.resolve(root, 'outside.img'); },
    value => { value.raw.run_provenance.sha256 = 'b'.repeat(64); }]) {
    const value = fixture(36); change(value); reject(() => checkStartup(value.raw, value.owned, value.profile, h));
  }
  for (const change of [value => { value.raw.setup_provenance.runtime_verified_by_setup = true; }, value => { value.owned.setup_report_sha256 = 'b'.repeat(64); },
    value => { value.setup.layout.registration_sha256 = 'b'.repeat(64); }, value => { value.setup.result = 'pending'; }]) {
    const value = fixture(36); change(value); reject(() => checkSetup(value.raw, value.owned, value.setup, value.profile, h));
  }
  const name = '0001-window-state-aaaaaaaaaaaa-attempt-1.window-displays.txt';
  const diagnostic = () => ({ window_state_retries: [{ attempts: [{ attempt: 1, result: 'rejected', raw_dump_available: true,
    artifact: `artifacts/android-emulator-test/${name}`, sha256: h, size_bytes: 0 }] }] });
  check(windowDiagnosticReferences(diagnostic()).size === 1, 'An exact empty raw diagnostic identity was lost.');
  check(windowDiagnosticReferences({ window_state_retries: [{ attempts: [{ attempt: 1, result: 'rejected', raw_dump_available: false }] }] }).size === 0,
    'Unavailable raw output falsely has a diagnostic file.');
  let rejectedDiagnostics = 0;
  for (const mutate of [item => { item.artifact = 'artifacts/android-emulator-test/../outside.txt'; },
    item => { item.sha256 = 'bad'; }, item => { item.size_bytes = -1; }, item => { item.size_bytes = 8 * 1024 * 1024 + 1; },
    item => { item.attempt = 2; }, item => { item.raw_dump_available = false; },
    item => { item.artifact = 'artifacts/android-emulator-test/0001-ui.xml'; }]) {
    const value = diagnostic(); mutate(value.window_state_retries[0].attempts[0]);
    let failed = false; try { windowDiagnosticReferences(value); } catch { failed = true; }
    check(failed, 'Invalid diagnostic identity/path was accepted.'); rejectedDiagnostics++;
  }
  const duplicate = diagnostic(); duplicate.window_state_retries[0].attempts.push({ ...duplicate.window_state_retries[0].attempts[0], attempt: 2 });
  let duplicateRejected = false; try { windowDiagnosticReferences(duplicate); } catch { duplicateRejected = true; }
  check(duplicateRejected, 'Duplicate diagnostic paths were accepted.'); rejectedDiagnostics++;
  check(runtimeEvidenceKind(name) === 'window_diagnostic' && runtimeEvidenceKind('0001-ui.xml') === 'ui_snapshot'
    && runtimeEvidenceKind('0001-ui.viewport.json') === 'ui_snapshot'
    && runtimeEvidenceKind('../' + name) === null && runtimeEvidenceKind(name.replace('attempt-1', 'attempt-4')) === null
    && runtimeEvidenceKind('post-cleanup-window-displays.txt') === null, 'The evidence filename allowlist changed scope.');
  check(supportedSourceFile({ isFile: () => true, size: 0 }, true)
    && !supportedSourceFile({ isFile: () => true, size: 0 })
    && !supportedSourceFile({ isFile: () => true, size: 8 * 1024 * 1024 + 1 }, true)
    && !supportedSourceFile({ isFile: () => false, size: 0 }, true), 'Empty diagnostic file policy leaked into ordinary source loading.');
  const supplemental = () => {
    const value = fixture(36).raw; value.window_state_retries = diagnostic().window_state_retries;
    const item = value.window_state_retries[0].attempts[0]; item.observed_at = '2026-10-07T00:01:01Z';
    item.reason = 'A visible occluding inset has invalid or empty bounds.';
    const source = (kind, command, suffix, second) => ({ kind, command,
      capture_started_at: `2026-10-07T00:01:0${second}Z`, capture_finished_at: `2026-10-07T00:01:0${second + 1}Z`,
      raw_dump_available: true, artifact: item.artifact.replace('.window-displays.txt', `.${suffix}`), sha256: h, size_bytes: 0 });
    item.ime_supplemental_evidence = { scope: 'diagnostic_only_visible_bottom_zero_ime', trigger_window_displays_sha256: h,
      trigger_observed_at: item.observed_at, device: { serial: 'emulator-5582', api: 36, avd: 'liveabit-api36-test' }, source_read_limit: 3,
      sequential_after_trigger: true, simultaneous_with_trigger: false, before_cleanup: true, geometry_accepted: false,
      gestures_sent_by_capture: 0, capture_complete: true, sampled_consistency_not_atomic_attestation: true,
      sampled_consistency: 'consistent_observed_geometry_and_focus', sources: [
        source('window_all', ['dumpsys', 'window', '-a'], 'window-all.txt', 2),
        { kind: 'input_method', command: ['dumpsys', 'input_method'], capture_started_at: '2026-10-07T00:01:04Z',
          capture_finished_at: '2026-10-07T00:01:05Z', raw_dump_available: false, unavailable_reason: 'synthetic unavailable' },
        source('display_after', ['dumpsys', 'window', 'displays'], 'window-displays-after.txt', 6)
      ] };
    return value;
  };
  check(windowDiagnosticReferences(supplemental()).size === 3, 'Bound empty supplementary sources or explicit unavailable source were lost.');
  const incomplete = supplemental(); incomplete.window_state_retries[0].attempts[0].ime_supplemental_evidence.sources = [];
  incomplete.window_state_retries[0].attempts[0].ime_supplemental_evidence.capture_complete = false;
  incomplete.window_state_retries[0].attempts[0].ime_supplemental_evidence.sampled_consistency = 'unknown';
  check(windowDiagnosticReferences(incomplete).size === 1, 'Incomplete diagnostic-only capture was falsely complete.');
  let rejectedSupplemental = 0;
  for (const change of [
    e => { e.sources[0].command = ['input', 'tap', '1', '1']; }, e => { e.sources[0].private_context = 'extra'; },
    e => { e.runtime_verified = true; }, e => { e.device.private_context = 'extra'; },
    e => { e.sources[0].artifact = e.sources[0].artifact.replace('0001-', '0002-'); },
    e => { e.sources[0].capture_started_at = 'bad'; }, e => { e.sources[0].capture_started_at = '2026-10-07T00:01:00Z'; },
    e => { e.sources[1].unavailable_reason = ''; }, e => { e.sources[1].artifact = 'artifacts/android-emulator-test/private.txt'; },
    e => { e.sources[0].unavailable_reason = 'also unavailable'; },
    e => { e.trigger_window_displays_sha256 = 'b'.repeat(64); }, e => { e.geometry_accepted = true; },
    e => { e.gestures_sent_by_capture = 1; }, e => { e.device.serial = 'phone'; }, e => { e.simultaneous_with_trigger = true; },
    e => { e.sources = e.sources.slice(0, 2); }, e => { e.sources.push(e.sources[2]); },
    e => { e.sources[2] = { ...e.sources[1], kind: 'display_after', command: ['dumpsys', 'window', 'displays'] }; }
  ]) {
    const value = supplemental(); change(value.window_state_retries[0].attempts[0].ime_supplemental_evidence);
    let rejected = false; try { windowDiagnosticReferences(value); } catch { rejected = true; }
    check(rejected, 'Invalid supplemental source/provenance was accepted.'); rejectedSupplemental++;
  }
  return { result: 'pass_pure_archive_profile_checks', valid_profiles: valid, rejected_profiles_or_bindings: rejected,
    window_diagnostic_checks: { valid_metadata_cases: 2, rejected_metadata_cases: rejectedDiagnostics,
      filename_scope_checks: 6, empty_diagnostic_file_policy_checks: 4,
      supplemental_valid_cases: 2, supplemental_rejections: rejectedSupplemental },
    launch_ime_recovery_checks: launchImeSelfTests(),
    files_written: false, device_accessed: false, runtime_verified: false };
}

async function main() {
  if (args.length === 1 && args[0] === '--self-test') { console.log(JSON.stringify(selfTests())); return; }
  check(args.length === 2 && args[0] === '--archive-name'
    && /^android-emulator-[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(args[1]) && args[1].length <= 80,
  'Use --archive-name android-emulator-<unique-run-name>.');
  const archive = `artifacts/${args[1]}`;
  const destination = path.join(root, archive);
  const artifactParent = path.resolve(root, 'artifacts');
  check(normalizedPath(await realpath(artifactParent)) === normalizedPath(artifactParent), 'Archive parent is redirected; no evidence was written.');
  try { await stat(destination); throw new Error('Archive already exists; preserve it and choose a unique name.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const files = new Map();
  const load = async (relative, allowEmpty = false) => {
    const target = path.resolve(root, relative);
    check(target.startsWith(path.resolve(root) + path.sep), 'Source escapes the project.');
    const resolved = await realpath(target);
    check(normalizedPath(resolved) === normalizedPath(target), 'Source symlinks are unsupported.');
    const info = await stat(target);
    check(supportedSourceFile(info, allowEmpty), 'Source file size/type is unsupported.');
    const bytes = await readFile(target); check(bytes.length === info.size, 'Source changed during reading.'); return bytes;
  };
  const rawBytes = await load('docs/review/android-emulator-validation.json');
  const raw = parseJson(rawBytes);
  const profile = runtimeProfile(raw);
  const start = Date.parse(raw.generated_at), end = Date.parse(raw.finished_at);
  check(Number.isFinite(start) && Number.isFinite(end) && end >= start && raw.result !== 'pending', 'Runtime report is incomplete.');
  files.set('raw-validation.json', rawBytes);
  const harness = await load('scripts/test-android-emulator.mjs');
  check(hash(harness) === raw.harness_sha256, 'Runtime harness changed; archive its original source explicitly.');
  files.set('harness-source.mjs', harness);
  const nativeBytes = await load('docs/review/android-local-inspector-validation.json');
  const native = parseJson(nativeBytes);
  check(native.result === 'pass_with_device_limits' && native.scope === 'native_local_only_build_and_jvm_fixtures'
    && native.apk?.package_id === 'org.liveabit.inspect' && native.fixture_apk?.package_id === 'org.liveabit.fixture', 'Native audit did not pass within the two owned package scope.');
  files.set('native-validation.json', nativeBytes);
  const startup = await load('artifacts/android-emulator/run.json');
  const owned = parseJson(startup);
  checkStartup(raw, owned, profile, hash(startup));
  files.set('run.json', startup);
  const setupBytes = await load(profile.setup);
  checkSetup(raw, owned, parseJson(setupBytes), profile, hash(setupBytes));
  files.set('image-setup.json', setupBytes);
  for (const [name, source, field] of [
    ['image-source.properties', `artifacts/android-sdk/system-images/android-${profile.api}/default/x86_64/source.properties`, 'image_source_properties_sha256'],
    ['image-registration.xml', `artifacts/android-sdk/system-images/android-${profile.api}/default/x86_64/package.xml`, 'image_registration_sha256'],
    ['emulator-source.properties', 'artifacts/android-sdk/emulator/source.properties', 'emulator_source_properties_sha256']
  ]) {
    const bytes = await load(source); check(hash(bytes) === raw.setup_provenance[field], 'Bound SDK identity changed before archival.'); files.set(name, bytes);
  }
  for (const apk of [native.apk, native.fixture_apk]) {
    check(/^artifacts\/android-local-inspector\/liveabit-[a-z0-9.-]+\.apk$/.test(apk.path), 'Unexpected APK path.');
    const installed = raw.installed_apks?.find(value => value.package_id === apk.package_id);
    check(installed?.sha256 === apk.sha256 && installed.version_name === apk.version_name
      && installed.exact_audited_bytes_verified === true && apk.internet_permission === false, 'Installed/audited local-only APK bytes or version differ.');
    const bytes = await load(apk.path);
    check(hash(bytes) === apk.sha256, 'APK changed before archival.');
    files.set(path.basename(apk.path), bytes);
  }
  const snapshotDir = path.join(root, 'artifacts', 'android-emulator-test');
  const windowReferences = windowDiagnosticReferences(raw);
  const launchImeReferences = launchImeDiagnosticReferences(raw);
  const diagnosticReferences = new Map([...windowReferences, ...launchImeReferences]);
  check(diagnosticReferences.size === windowReferences.size + launchImeReferences.size,
    'Diagnostic scopes share a source filename.');
  for (const name of await readdir(snapshotDir)) {
    const kind = runtimeEvidenceKind(name);
    if (!kind || (kind !== 'ui_snapshot' && !diagnosticReferences.has(name))) continue;
    const info = await stat(path.join(snapshotDir, name));
    if (info.isFile() && info.mtimeMs >= start - 1000 && info.mtimeMs <= end + 1000) {
      const bytes = await load(`artifacts/android-emulator-test/${name}`, kind !== 'ui_snapshot');
      if (kind !== 'ui_snapshot') check(bytes.length === diagnosticReferences.get(name).size_bytes
        && hash(bytes) === diagnosticReferences.get(name).sha256, 'Diagnostic bytes differ from their runtime-recorded identity.');
      files.set(name, bytes);
    }
  }
  for (const name of diagnosticReferences.keys()) check(files.has(name), 'Referenced diagnostic was not preserved within the runtime interval.');
  const relocated = JSON.parse(JSON.stringify(raw));
  function relocate(value) {
    if (Array.isArray(value)) return value.map(relocate);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, relocate(item)]));
    if (typeof value === 'string' && value.startsWith('artifacts/android-emulator-test/')) {
      const name = value.slice('artifacts/android-emulator-test/'.length);
      check(files.has(name), `Referenced runtime evidence was not captured: ${name}`);
      return `${archive}/${name}`;
    }
    return value;
  }
  const frozen = relocate(relocated);
  frozen.evidence_preservation = { archive_path: archive, raw_report_sha256: hash(rawBytes),
    original_runtime_claims_preserved: true, ui_paths_relocated_only: true,
    window_diagnostic_paths_relocated_only: true,
    setup_report: `${archive}/image-setup.json`, setup_report_sha256: hash(setupBytes) };
  if (raw.launch_ime_recoveries !== undefined) frozen.evidence_preservation.launch_ime_diagnostic_paths_relocated_only = true;
  files.set('validation.json', Buffer.from(JSON.stringify(frozen, null, 2) + '\n'));
  const index = { generated_at: raw.generated_at, finished_at: raw.finished_at,
    raw_report_sha256: hash(rawBytes), harness_sha256: hash(harness), startup_sha256: hash(startup),
    native_audit_sha256: hash(nativeBytes), setup_report_sha256: hash(setupBytes),
    profile: { api: profile.api, serial: profile.serial, avd: profile.avd },
    run_snapshot_files: [...files.keys()].filter(name => runtimeEvidenceKind(name) === 'ui_snapshot'),
    window_diagnostic_files: [...files.keys()].filter(name => runtimeEvidenceKind(name) === 'window_diagnostic'),
    file_sha256: Object.fromEntries([...files].map(([name, bytes]) => [name, hash(bytes)])) };
  if (raw.launch_ime_recoveries !== undefined) index.launch_ime_diagnostic_files = [...files.keys()]
    .filter(name => runtimeEvidenceKind(name) === 'launch_ime_diagnostic');
  await mkdir(destination);
  for (const [name, bytes] of files) await writeFile(path.join(destination, name), bytes, { flag: 'wx' });
  await writeFile(path.join(destination, 'archive-index.json'), JSON.stringify(index, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ archive, result: raw.result, summary: raw.summary, captured_files: files.size }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
