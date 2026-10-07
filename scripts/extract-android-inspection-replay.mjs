// Host-only derivation from archived, owned synthetic UI. No Android or network access.
import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARCHIVE = 'artifacts/android-emulator-0.2.2-rerun-test';
const REVIEW = 'docs/review/android-emulator-0.2.2-rerun-validation.json';
const FIXTURE = 'org.liveabit.fixture';
const RAW_HASH = 'ffafbab1bfd67e6b602094c55fe611e1f51eb3a520acfb0584a525dba1f38e23';
const HARNESS_HASH = '20158933f677c4f5b6f627669e8cbe0c67e8a7434e9c5dbc1e9d20c2f3c9e4f2';
const NATIVE_HASH = '655cb69e3bfd0df92e88cafa649d56122c5eb55eaa76c944806a260ace8e52aa';
const CORE_HASHES = {
  'android/collector-core/src/main/java/org/liveabit/collector/core/LocalInspectionCore.java':
    '2f583eead4639b53ab80f292037af6effec4137e399169e01ff118991f0c2838',
  'android/collector-core/src/main/java/org/liveabit/collector/core/FixtureComparison.java':
    '4b13f9653875fbd94273a8b9b0d999490f302a5a1b565c86c349c6ad223004ff'
};
// Frozen identities of the selected preserved XML files.
const UI_HASHES = {
  '0202-inspection-result.xml': '05fee39e0869aa302288fc440c599f0d9270b9513085d062bc01bead31b02ef9',
  '0153-fixture-comparison.xml': 'fc022fe72c35c6e24725afe7a7b2fdc0a953c386b1b7923275c362727e43a740',
  '0154-fixture-comparison.xml': '72127d5942d00585c8f7cdcbece75302327401f4b3282269442fc07fd44d4a45',
  '0155-fixture-comparison.xml': '393900eeb8c5b65341e960870e7e994dc068a50a86a66142c386f2fde87d7632',
  '0156-fixture-comparison.xml': 'd4ae973fcc4d4766d8ca78568d93167025db8348860c7b2f9a867cdd223eaf3f',
  '0157-fixture-comparison.xml': '0222d1b03dc27c5b752eee5b8c5876ef490212379c76c3a3d0716ffa25cbbb96',
  '0158-fixture-comparison.xml': 'c7fa834737f162d28edd1d37eda03aec4ee19fb2bb1c9e6dcf13049de7979c0b',
  '0159-fixture-comparison.xml': 'bc6eeb9fbae4f8861044a6d748e5519d69e98982032fdfaf58aad75488abad1c',
  '0160-fixture-comparison.xml': 'c5347e06a6f0850e32cbd0370b0c06956593335fdbc840b3c7468a4435707f3c',
  '0161-fixture-comparison.xml': 'c5347e06a6f0850e32cbd0370b0c06956593335fdbc840b3c7468a4435707f3c',
  '0238-fixture-comparison.xml': 'fc022fe72c35c6e24725afe7a7b2fdc0a953c386b1b7923275c362727e43a740',
  '0239-fixture-comparison.xml': '9d365359d55e35e760caec00460458f153091885c7103a9a6b1a717adb2fb353',
  '0240-fixture-comparison.xml': 'dc7e86e23152612c93d15beded1610c3c1437d14a1f6aa76fc65560af50a8350',
  '0241-fixture-comparison.xml': 'c9141f16c55dca1831347ecacb18ae86f1738c8f255d517fa5c515e32927034d',
  '0242-fixture-comparison.xml': '257a55c579bb5161992b50f3dcac9489f5a67ee81dbd8a42f1869196bd25a9c4',
  '0243-fixture-comparison.xml': '627a55815b504d5f2baa0d3560dc7838b7095d60997391374702447d3545d2d8',
  '0244-fixture-comparison.xml': '79556e5f8c0d839325df9cea61a0c2cf3e4a19fd19be45733157d16de9a2531c',
  '0245-fixture-comparison.xml': 'd490518ef64f5589e74275cda9ab2231c8f915dafc81a9c8327aecc7c0571b54',
  '0246-fixture-comparison.xml': 'ed224595fc8251af22d055201e8d7d993f358cfbf54e6f4d969b5053326734dc',
  '0247-fixture-comparison.xml': 'c4eb8b8f74462dcc158fcf68b4e07da43256e7989a734511e5466968b91d5bb5',
  '0248-fixture-comparison.xml': '99d506c63fea4a083350836f0d84cc080e20e5d9a14054c6ab33e683d9ce1530',
  '0249-fixture-comparison.xml': 'fee904e421805b26f1bb87107e2f3e5fce21a7ccc7f5211ad1ae6de95ca272d0',
  '0250-fixture-comparison.xml': 'fee904e421805b26f1bb87107e2f3e5fce21a7ccc7f5211ad1ae6de95ca272d0'
};
const APK_PINS = [
  { package_id: 'org.liveabit.inspect', version_name: '0.2.2-local',
    file: 'liveabit-local-inspector-0.2.2.apk', size: 116284,
    sha256: '87fb356e1619f64a9b9ac418da455b0055d05c454a18a452d9d901044797cf40' },
  { package_id: FIXTURE, version_name: '0.1.0-fixture',
    file: 'liveabit-lifecycle-fixture-0.1.0.apk', size: 66627,
    sha256: '28ea22850e7224a5a959c9d614af07f0b76674655db51b96bc0d94ee79e04b46' }
];
const MAX_BYTES = 1024 * 1024;
// These two short derived trials are capped below the Java runner's one-hour replay bound.
const MAX_SPAN = 60 * 60 * 1000;
const MAX_WINDOW = 10 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (condition, message) => { if (!condition) throw new Error(message); };
const verifyHash = (bytes, expected, name) => {
  const sha256 = hash(bytes);
  check(!expected || sha256 === expected, `Pinned source hash mismatch: ${name}`);
  return sha256;
};
const relative = (root, file) => path.relative(root, file).split(path.sep).join('/');
const within = (base, target) => {
  const value = path.relative(base, target);
  return value !== '..' && !value.startsWith(`..${path.sep}`) && !path.isAbsolute(value);
};

async function boundedFile(root, name, expectedHash) {
  const absolute = path.resolve(root, name);
  check(within(root, absolute), 'Source path leaves the repository.');
  const resolved = await realpath(absolute);
  check(within(root, resolved), 'Source symlink leaves the repository.');
  const info = await stat(resolved);
  check(info.isFile() && info.size > 0 && info.size <= MAX_BYTES, `Source size/type is invalid: ${name}`);
  const bytes = await readFile(resolved);
  check(bytes.length === info.size && bytes.length <= MAX_BYTES, `Source changed while reading: ${name}`);
  const sha256 = verifyHash(bytes, expectedHash, name);
  return { bytes, source: { path: relative(root, absolute), size_bytes: bytes.length, sha256 } };
}

function decodeXml(value) {
  const decoded = value.replace(/&([^;\s]+);/g, (full, entity) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(named, entity)) return named[entity];
    check(/^#(?:\d+|x[\da-fA-F]+)$/.test(entity), 'Unsupported XML entity.');
    const code = entity.startsWith('#x') ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    check(Number.isSafeInteger(code) && (code === 9 || code === 10 || code === 13 || code >= 32)
      && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff), 'Invalid XML character.');
    return String.fromCodePoint(code);
  });
  check(!/&(?!(?:[^;\s]+);)/.test(value), 'Unterminated XML entity.');
  return decoded;
}

function timestamp(displayed) {
  const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(displayed);
  check(match, 'Unrecognized displayed timestamp.');
  const month = MONTHS.indexOf(match[1]);
  const [day, hour, minute, second, millisecond] = match.slice(2).map(Number);
  check(day >= 1 && day <= 31 && hour <= 23 && minute <= 59 && second <= 59, 'Invalid displayed date/time.');
  const local = Date.UTC(2026, month, day, hour, minute, second, millisecond);
  const date = new Date(local);
  check(date.getUTCMonth() === month && date.getUTCDate() === day, 'Invalid displayed calendar date.');
  // Explicit derivation assumption for this one archive; not a measured guest timezone.
  return local + 7 * 60 * 60 * 1000;
}

/** Parse only the bounded UIAutomator dialect used by the fixed owned archive. */
export function parseOwnedTransitionBlocks(xml, expectedCount) {
  check(typeof xml === 'string' && Buffer.byteLength(xml) <= MAX_BYTES, 'XML exceeds the fixed input bound.');
  check(Number.isInteger(expectedCount) && expectedCount > 0 && expectedCount <= 64, 'Invalid expected transition count.');
  check(!/<!|<\?(?!xml\b)/.test(xml), 'XML declarations, entities or processing instructions are unsupported.');
  const body = xml.replace(/^\s*<\?xml\s[^?]*\?>/, '').trim();
  const tagPattern = /<[^<>]+>/g;
  const stack = [];
  const blocks = [];
  let cursor = 0, nodes = 0, hierarchyCount = 0;
  for (const match of body.matchAll(tagPattern)) {
    check(body.slice(cursor, match.index).trim() === '', 'Unexpected XML text.');
    cursor = match.index + match[0].length;
    const tag = match[0];
    if (tag === '</node>' || tag === '</hierarchy>') {
      check(stack.pop() === tag.slice(2, -1), 'Unbalanced XML hierarchy.');
      continue;
    }
    const opening = /^<(node|hierarchy)\b([\s\S]*?)(\/?)>$/.exec(tag);
    check(opening, 'Unsupported XML element.');
    const attrs = {};
    let attrCursor = 0;
    for (const attr of opening[2].matchAll(/\s+([A-Za-z_:][\w:.-]*)="([^"<>]*)"/g)) {
      check(opening[2].slice(attrCursor, attr.index).trim() === '', 'Malformed XML attributes.');
      check(!Object.hasOwn(attrs, attr[1]), 'Duplicate XML attribute.');
      attrs[attr[1]] = decodeXml(attr[2]);
      attrCursor = attr.index + attr[0].length;
    }
    check(opening[2].slice(attrCursor).trim() === '', 'Malformed XML attribute tail.');
    if (opening[1] === 'hierarchy') {
      check(++hierarchyCount === 1 && stack.length === 0 && opening[3] === '', 'Invalid hierarchy root.');
    } else {
      check(stack[0] === 'hierarchy' && ++nodes <= 2048, 'Invalid or excessive UI nodes.');
      const text = attrs.text ?? '';
      if (/^Showing .*retained activity transitions/.test(text)) {
        check(attrs.package === 'org.liveabit.inspect' && attrs.class === 'android.widget.TextView',
          'Transition block is not an owned inspector text view.');
        const heading = /^Showing all (\d+) of (\d+) retained activity transitions\.\n\n/.exec(text);
        check(heading && Number(heading[1]) === expectedCount && Number(heading[2]) === expectedCount,
          'Transition block is truncated or has a mismatched count.');
        const records = text.slice(heading[0].length).trim().split(/\n\n/);
        check(records.length === expectedCount, 'Displayed record count does not match the complete block.');
        const events = records.map((record, sourceIndex) => {
          const item = /^([^\n]+)  Activity (resumed|paused)\n([^\n]+)$/.exec(record);
          check(item && item[3] === FIXTURE, 'A transition is malformed or is not the fixed owned fixture.');
          return { timestamp_millis_assumed: timestamp(item[1]), type: item[2] === 'resumed' ? 'RESUME' : 'PAUSE', source_index: sourceIndex };
        });
        for (let index = 1; index < events.length; index++) {
          check(events[index].timestamp_millis_assumed <= events[index - 1].timestamp_millis_assumed,
            'Archived latest-first transition ordering is inconsistent.');
        }
        blocks.push(events.sort((left, right) => left.timestamp_millis_assumed - right.timestamp_millis_assumed));
      }
    }
    if (!opening[3]) stack.push(opening[1]);
  }
  check(cursor === body.length && hierarchyCount === 1 && stack.length === 0, 'Incomplete XML hierarchy.');
  check(blocks.every(block => equalEvents(blocks[0], block)), 'Repeated complete archived transition blocks disagree.');
  return blocks;
}

function equalEvents(left, right) {
  return JSON.stringify(left.map(event => [event.timestamp_millis_assumed, event.type]))
    === JSON.stringify(right.map(event => [event.timestamp_millis_assumed, event.type]));
}

function validateMeasurement(value, count) {
  check(value && Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end)
    && Number.isSafeInteger(value.duration) && value.start >= 0 && value.end > value.start
    && value.end - value.start <= MAX_WINDOW && value.duration >= 0
    && value.duration <= value.end - value.start + 2000, 'Invalid archived comparison window/value.');
  check(value.retained_transitions === count && value.production_accuracy_pass === false,
    'Unexpected retained count or accuracy claim.');
  check(Number.isSafeInteger(value.candidate_duration_millis)
    && value.candidate_duration_millis >= 0 && value.candidate_duration_millis <= value.end - value.start
    && value.signed_difference_millis === value.candidate_duration_millis - value.duration,
    'Invalid expected archived comparison output.');
}

async function prepareOutput(root, outputDir) {
  const target = path.resolve(outputDir);
  const artifacts = path.join(root, 'artifacts');
  check(within(artifacts, target) && target !== artifacts, 'Replay output must be a directory under repository artifacts.');
  let ancestor = target;
  while (true) {
    try {
      const resolved = await realpath(ancestor);
      check(within(root, resolved) && (await stat(resolved)).isDirectory(), 'Output parent escapes the repository or is not a directory.');
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(ancestor);
      check(parent !== ancestor, 'Cannot resolve output parent.');
      ancestor = parent;
    }
  }
  return target;
}

/** Validate all fixed inputs before publishing any derived file; existing different files are preserved. */
export async function extractOwnedReplay({ root = DEFAULT_ROOT, outputDir } = {}) {
  root = await realpath(path.resolve(root));
  const output = await prepareOutput(root, outputDir ?? path.join(root, 'artifacts', 'android-inspection-replay'));
  const sources = [];
  const load = async (name, expected) => {
    const result = await boundedFile(root, name, expected);
    sources.push(result.source);
    return result.bytes;
  };
  const raw = JSON.parse((await load(`${ARCHIVE}/raw-validation.json`, RAW_HASH)).toString('utf8'));
  const report = JSON.parse((await load(REVIEW)).toString('utf8'));
  const index = JSON.parse((await load(`${ARCHIVE}/archive-index.json`)).toString('utf8'));
  const native = JSON.parse((await load(`${ARCHIVE}/native-validation.json`, NATIVE_HASH)).toString('utf8'));
  check(raw.result === 'pass_with_emulator_limits' && raw.summary?.passed === 10 && raw.summary.failed === 0,
    'The fixed raw source is not the completed workflow run.');
  check(index.raw_report_sha256 === RAW_HASH && report.evidence_preservation?.raw_report_sha256 === RAW_HASH
    && report.generated_at === raw.generated_at && report.finished_at === raw.finished_at,
    'Review/archive provenance does not match the pinned raw run.');
  check(JSON.stringify(report.measurements) === JSON.stringify(raw.measurements).replaceAll('artifacts/android-emulator-test/', `${ARCHIVE}/`),
    'Review measurements differ from the pinned raw run beyond UI-path relocation.');
  check(index.harness_sha256 === HARNESS_HASH && raw.harness_sha256 === HARNESS_HASH, 'Archived harness identity differs.');
  await load(`${ARCHIVE}/harness-source.mjs`, HARNESS_HASH);
  for (const [name, sha256] of Object.entries(CORE_HASHES)) {
    check(native.source_sha256?.[name] === sha256, 'Native source audit differs from the fixed core identity.');
    await load(`artifacts/android-inspection-replay/baseline-core/${path.basename(name)}`, sha256);
  }
  for (const pin of APK_PINS) {
    const installed = raw.installed_apks?.find(item => item.package_id === pin.package_id);
    const audited = pin.package_id === FIXTURE ? native.fixture_apk : native.apk;
    check(installed?.sha256 === pin.sha256 && installed.version_name === pin.version_name
      && installed.exact_audited_bytes_verified === true && audited.sha256 === pin.sha256
      && audited.version_name === pin.version_name && audited.internet_permission === false, 'APK audit identity differs.');
    for (const name of [`${ARCHIVE}/${pin.file}`, `artifacts/android-local-inspector/${pin.file}`]) {
      const bytes = await load(name, pin.sha256);
      check(bytes.length === pin.size, 'Pinned APK length differs.');
    }
  }
  const outputs = [];
  const scenarios = [];
  for (const definition of [{ id: 'idle', source: 'idle', count: 2 }, { id: 'handoff', source: 'screen_handoffs', count: 14 }]) {
    const values = report.measurements.filter(item => item.scenario === definition.source);
    check(values.length === 1, 'Expected exactly one fixed comparison scenario.');
    const measurement = values[0];
    validateMeasurement(measurement, definition.count);
    const candidates = [...measurement.comparison_ui];
    check(candidates.length > 0 && candidates.length <= 32, 'Comparison UI references exceed the fixed bound.');
    if (definition.id === 'handoff') candidates.unshift(`${ARCHIVE}/0202-inspection-result.xml`);
    let chosen = null;
    const complete = [];
    for (const name of [...new Set(candidates)]) {
      check(typeof name === 'string' && name.startsWith(`${ARCHIVE}/`) && /^\d{4}-[a-z0-9-]+\.xml$/.test(path.basename(name))
        && path.posix.dirname(name) === ARCHIVE && index.run_snapshot_files?.includes(path.basename(name)), 'UI reference is outside the fixed archive.');
      check(Object.hasOwn(UI_HASHES, path.basename(name)), 'Selected UI file has no frozen source hash.');
      const bytes = await load(name, UI_HASHES[path.basename(name)]);
      const blocks = parseOwnedTransitionBlocks(bytes.toString('utf8'), definition.count);
      for (const block of blocks) {
        check(!chosen || equalEvents(chosen, block), 'Repeated complete archived transition blocks disagree.');
        chosen ??= block;
        complete.push(name);
      }
    }
    check(chosen && complete.length > 1, 'No corroborated complete owned transition series was found.');
    const base = chosen[0].timestamp_millis_assumed;
    const events = chosen.map(event => ({ offset_millis: event.timestamp_millis_assumed - base, type: event.type }));
    const comparisonStart = measurement.start - base, comparisonEnd = measurement.end - base;
    const queryEnd = Math.max(events.at(-1).offset_millis, comparisonEnd) + 1;
    check(comparisonStart >= 0 && comparisonEnd > comparisonStart && queryEnd <= MAX_SPAN,
      'Assumed displayed timestamps do not bound the recorded comparison.');
    const inputPath = path.join(output, `${definition.id}.tsv`);
    const tsv = `OAP_OWNED_REPLAY_V1\n${events.length}\t${comparisonStart}\t${comparisonEnd}\t${measurement.duration}\n`
      + events.map(event => `${event.offset_millis}\t${event.type}`).join('\n') + '\n';
    outputs.push({ file: inputPath, bytes: Buffer.from(tsv) });
    scenarios.push({ id: definition.id, input_path: relative(root, inputPath), input_sha256: hash(tsv),
      event_count: events.length, fixed_package: FIXTURE, base_timestamp_millis_assumed: base,
      comparison_start_offset_millis: comparisonStart, comparison_end_offset_millis: comparisonEnd,
      fixture_duration_millis: measurement.duration, synthetic_consent_start_offset_millis: -1,
      synthetic_query_end_offset_millis: queryEnd, expected_candidate_duration_millis: measurement.candidate_duration_millis,
      expected_signed_difference_millis: measurement.signed_difference_millis,
      expected_comparison_status: measurement.comparison_status, expected_estimates_discarded: measurement.estimates_discarded,
      corroborating_complete_ui_paths: complete, events });
  }
  const extractor = await boundedFile(root, 'scripts/extract-android-inspection-replay.mjs');
  sources.push(extractor.source);
  const evidence = { schema: 'OAP_OWNED_REPLAY_DERIVATION_V1', scope: 'host_only_derived_owned_fixture_replay',
    fixed_archive: ARCHIVE, sources, scenarios,
    display_mapping_assumption: { year: 2026, utc_offset: '-07:00', measured_guest_timezone: false,
      reason: 'Archived UI omits year and timezone. This fixed mapping is an explicit derivation assumption for this archive.' },
    synthetic_anchors: { consent: 'one millisecond before offset zero, the earliest displayed event',
      query: 'one millisecond after the latest event or comparison end, whichever is later',
      elapsed_clock: 'synthetic equal-rate wall/elapsed values supplied by the host runner',
      actual_android_session_or_query_anchors_recovered: false },
    source_completeness: 'unknown', exact_os_query_replay: false, authenticated_fixture_value: false,
    native_core_identity: 'preserved_0.2.2_baseline_source_bytes_pinned_to_original_native_audit',
    production_accuracy_pass: false, physical_android_verified: false, oap_summary_eligible: false,
    limitations: [
      'Only already archived owned synthetic UI is read. No device, app inventory, personal activity, export feature or network is accessed.',
      'Complete means all retained projected records shown in these UI blocks; it does not attest complete Android usage history.',
      'Latest-first display order is preserved within equal-timestamp groups; source arrival order is not recovered.',
      'Consent, query and elapsed-clock anchors are synthetic; this is not a replay of actual Android authorization or query timing.',
      'Manually entered fixture values remain unauthenticated. Matching historical arithmetic is not measured production accuracy.'
    ] };
  outputs.push({ file: path.join(output, 'evidence.json'), bytes: Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`) });
  // Preflight the entire set before writes. Repeat execution is idempotent; different existing evidence is never overwritten.
  for (const item of outputs) {
    try {
      const resolved = await realpath(item.file);
      check(within(output, resolved) && resolved === item.file, 'Existing output is a symlink or escapes its output directory.');
      check((await stat(resolved)).isFile(), 'Existing replay output is not a regular file.');
      check((await readFile(resolved)).equals(item.bytes), 'Existing replay output differs; choose a new bounded output directory.');
      item.exists = true;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await mkdir(output, { recursive: true });
  check(await realpath(output) === output, 'Output directory changed or became a symlink.');
  for (const item of outputs) if (!item.exists) await writeFile(item.file, item.bytes, { flag: 'wx' });
  return evidence;
}

export function runExtractionSelfTests() {
  const record = (time, type, packageName = FIXTURE) => `${time}  Activity ${type}\n${packageName}\n\n`;
  const xml = text => `<hierarchy rotation="0"><node text="${text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('\n', '&#10;')}" package="org.liveabit.inspect" class="android.widget.TextView" /></hierarchy>`;
  const header = 'Showing all 2 of 2 retained activity transitions.\n\n';
  const tie = header + record('Oct 6, 22:45:37.359', 'resumed') + record('Oct 6, 22:45:37.359', 'paused');
  const rejected = (input, count = 2) => {
    try { parseOwnedTransitionBlocks(input, count); }
    catch { return; }
    throw new Error('Extraction self-test expected rejection.');
  };
  let passed = 0;
  check(parseOwnedTransitionBlocks(xml(tie), 2)[0].map(event => event.type).join(',') === 'RESUME,PAUSE', 'Equal-time order changed.'); passed++;
  const swapped = header + record('Oct 6, 22:45:37.359', 'paused') + record('Oct 6, 22:45:37.359', 'resumed');
  check(parseOwnedTransitionBlocks(xml(swapped), 2)[0].map(event => event.type).join(',') === 'PAUSE,RESUME', 'Permutation was not preserved.'); passed++;
  rejected(xml(tie.replace('Showing all 2 of 2', 'Showing latest 2 of 3'))); passed++;
  rejected(xml(tie.replace(FIXTURE, 'com.other.private'))); passed++;
  rejected(xml(tie.replace('Oct 6', 'Feb 30'))); passed++;
  rejected(xml(header + record('Oct 6, 22:45:37.359', 'resumed'))); passed++;
  rejected(xml(tie).replace('</hierarchy>', '')); passed++;
  rejected(`<!DOCTYPE hierarchy>${xml(tie)}`); passed++;
  rejected(' '.repeat(MAX_BYTES + 1)); passed++;
  rejected(xml(tie), 65); passed++;
  const olderFirst = header + record('Oct 6, 22:45:36.359', 'resumed') + record('Oct 6, 22:45:37.359', 'paused');
  rejected(xml(olderFirst)); passed++;
  const conflictingBlocks = xml(tie).replace('</hierarchy>', xml(swapped).replace('<hierarchy rotation="0">', ''));
  rejected(conflictingBlocks); passed++;
  try { verifyHash(Buffer.from('coherently altered complete XML'), hash('original complete XML'), 'self-test-owned-UI'); }
  catch { passed++; }
  check(passed === 13, 'A changed pinned UI input was not rejected.');
  return { passed, scope: 'host_only_extraction_rejections_and_equal_timestamp_order', android_runtime_verified: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    check(args.length === 0 || args.length === 1 && args[0] === '--self-test', 'Only the fixed archive or --self-test is supported.');
    const result = args.length ? runExtractionSelfTests() : await extractOwnedReplay();
    console.log(JSON.stringify(args.length ? result : { schema: result.schema,
      outputs: [...result.scenarios.map(item => item.input_path), 'artifacts/android-inspection-replay/evidence.json'],
      source_completeness: result.source_completeness, production_accuracy_pass: false }, null, 2));
  } catch (error) { console.error(`Owned replay extraction failed: ${error.message}`); process.exitCode = 1; }
}
