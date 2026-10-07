# Exact owned-fixture timing analysis

Date: **2026-10-07**. Scope: TASK-P6-F02/F03 host diagnostics for completed, preserved owned-emulator evidence. The [0.2.3 development review](android-local-development-0.2.3.md) records its separate native audit and completed ten-case API 35 runtime gate. The [actual exact analysis](../../artifacts/android-timing-analysis/run-33410252-cb83-4399-b113-13360bcf7fb6/summary.json) and [current-native replay](../../artifacts/android-timing-analysis/run-33410252-cb83-4399-b113-13360bcf7fb6/native-replay-f43309eb-b541-4f47-bdc0-ea241c5d665f/validation.json) reproduced both captured trials. This guide describes the tools and their limits; it does not establish timing accuracy or Android 16 verification.

## Choose the correct evidence path

| Tool | Input and purpose | What it executes |
| --- | --- | --- |
| [Exact timing analyzer](../../scripts/analyze-android-timing.mjs) | A completed passing owned-emulator report with complete numeric fixture details; binds local source evidence and derives timing diagnostics and replay inputs | Node only; no Android, JDK, network or APK rebuild |
| [Exact timing native replay](../../scripts/replay-android-timing-analysis.mjs) | One immutable analyzer summary; reproduces its captured transition multiplicity, retained intervals and comparison through the audited current collector/comparator | Existing pinned JDK 17.0.20.1 and native Java sources on the host; no Android, network or APK rebuild |
| [Historical normalized replay](../../scripts/replay-android-inspection.mjs) | The fixed archived 0.2.2 traces, whose displayed dates lacked numeric session/query provenance; compares preserved baseline and current core separately | Existing pinned JDK and both native source identities on the host |

The historical replay retains its disclosed 2026/UTC−07:00 display-alignment assumption and synthetic authorization/query clocks. The [historical review](android-inspection-replay-2026-10-06.md) explains its results. The exact analyzer requires numeric epoch codes rather than inferring a timezone mapping for those old displays. Both replay paths still supply synthetic host authorization and clock samples; neither repeats an actual Android history query.

## Analyze a completed report

Run from the project root. Use forward slashes in evidence arguments, as required by the bounded path grammar. The following example is usable only after the named completed report and its preserved evidence exist:

```powershell
node scripts/analyze-android-timing.mjs --report docs/review/android-emulator-0.2.3-validation.json
```

The alternative archive forms are `artifacts/android-emulator-<name>/validation.json` and `artifacts/android-emulator-<name>/raw-validation.json`. The tool accepts those two archive filenames or a versioned `docs/review/android-emulator-<name>-validation.json`; it does not accept arbitrary files, absolute paths or the changing generic `android-emulator-validation.json` report.

The report must record `pass_with_emulator_limits`, all ten workflows passed in their expected order, both exact audited installed APK identities, a fresh bound startup record, the owned account-free AOSP x86_64 guest and guest timezone provenance. Supported evidence profiles are API 35 / `liveabit-api35-test` / `emulator-5580` and API 36 / `liveabit-api36-test` / `emulator-5582`. Accepting the latter profile is parser preparation, not a claim that its runtime has been tested. API 37 is not an accepted analysis profile.

For archived evidence, the analyzer checks the archive hash index, original raw report, preserved harness/startup/native audit and actual APK bytes. It permits only UI-path relocation between raw and review reports, then compares the exact numeric timing blocks in the bound UI XML with the structured measurements. A local hash match binds file bytes; it does not cryptographically authenticate the Android report or the manually entered fixture codes.

Each trial must retain **all** displayed fixture transitions and inferred intervals. The parser rejects a `latest`/truncated disclosure, missing numeric context, extra private fields, non-fixture records, mismatched counts, unsupported events, conflicting anchors or comparison values. Current bounds are 64 transitions, eight displayed intervals, 32 trials, a ten-minute comparison window and one-hour normalized replay offsets. These are tool acceptance bounds, not source-completeness guarantees. The app's bounded view can omit records; such a capture needs a smaller controlled trial rather than an invented complete trace.

Successful analysis prints one JSON line with these keys. The following illustrates the format only; its counts are not a reported trial result:

```json
{
  "result": "completed_owned_fixture_timing_analysis",
  "trials": 2,
  "sample_counts": {
    "trials": 2,
    "numerical_unverified": 1,
    "partial_unverified": 1,
    "unknown": 0
  },
  "summary_path": "artifacts/android-timing-analysis/run-<UUID>/summary.json"
}
```

A new uniquely named run directory contains an exact report copy, native audit copy, numbered scenario TSV inputs and `summary.json`. Existing run files are not overwritten. The summary records source hashes, installed APK bindings, current-versus-audited native source identities, environment, per-trial diagnostics and explicit evidence limits. The analyzer records whether current native source matches the audit; it performs no native replay itself.

Each TSV starts with `OAP_OWNED_REPLAY_V1`, then a tab-separated event count, comparison start offset, comparison end offset and entered fixture duration, followed by one offset/type row for every event. The origin is the minimum of the exact comparison start and event epochs; offsets preserve their millisecond differences. This is an internal host replay format, not an OAP activity summary or delivery contract.

## Read the timing fields

The optional app panel exposes already retained `org.liveabit.fixture` records. Its numeric source context separates these values:

| Field | Meaning and limit |
| --- | --- |
| `session_start_wall_millis`, `session_start_elapsed_millis` | Actual original inspection-session clock pair; establishes the displayed session horizon |
| `query_cursor_wall_millis_exclusive` | Last successful query's exclusive wall boundary; **no corresponding elapsed-clock cursor is available** |
| `report_clock_wall_millis`, `report_clock_elapsed_millis` | Separately sampled actual report clock pair; cannot substitute for original query-batch clocks |
| `display_time_zone`, `report_clock_utc_offset_millis` | Current report-formatting context checked against the recorded guest timezone property; not source-zone proof at event time |
| `events` | Exact numeric epoch and RESUME/PAUSE codes, preserving repeated records; no activity/class identity |
| `closed_intervals` | Already retained inferred half-open intervals; not authenticated complete app sessions |

Session/report wall and elapsed deltas must agree within the unchanged 2,000 ms clock tolerance. The app separately checks both latest-sample and original-session drift; this analyzer's endpoint check does not reconstruct intermediate clocks or reproduce the safety regression tests. Missing original OS-query batch clocks and the query cursor's elapsed anchor remain explicitly unavailable.

The analyzer sorts event epochs for replay while preserving every repeated epoch/type record. `same_timestamp_groups` lists groups with multiple records; it supplies no causal ordering inside a group. `unique_pause_resume_separations` reports only adjacent one-record PAUSE then one-record RESUME groups. `retained_inferred_interval_gaps` reports positive gaps between retained inferred intervals. Neither diagnostic proves inactivity, source continuity or complete coverage, and no gap contributes inferred time.

`retained_candidate_duration_millis` is the union of retained inferred intervals clipped to the entered half-open fixture window. `signed_difference_millis` equals this candidate minus `entered_fixture_duration_millis`. A negative difference describes that arithmetic; it is not a proven amount of missed usage. The entered fixture duration remains manually supplied and unverified.

`comparison_status` stays one of `known_unverified_estimate`, `known_partial_unverified_estimate` or `unknown`. Discard reasons remain visible for numerical and unknown comparisons. Unknown duration and difference remain JSON `null`; they are not zero. The by-scenario arrays preserve observed signed differences, including null values. Sample counts describe captured trials, without a quality threshold or an accuracy pass.

## Replay the audited native implementation separately

Use the exact `summary_path` printed by analysis, replacing the UUID placeholder below:

```powershell
node scripts/replay-android-timing-analysis.mjs --analysis artifacts/android-timing-analysis/run-<UUID>/summary.json
```

Replay revalidates the copied source report, every bound evidence file and TSV, both owned APK identities and the analyzer/runner/current-core source bindings. The current collector and comparator must still match the analyzed native audit. Changed evidence or core bytes are rejected; rerunning analysis alone does not make a changed implementation match an older APK audit.

The tool verifies the installed pinned JDK's release and executable versions, copies bound Java sources to a new child directory, compiles there and executes the actual native collector/comparator. It checks exact event multiplicity, retained interval endpoints and sums, clipped candidate/difference, discard reasons and unknown status against the capture. Native same-time ordering checks and three complete-timestamp-group partition strategies must pass; a separate synthetic genuine-pause-gap check must retain the gap. Partition checks never split an equal-time group and do not prove the original Android query partitioning. Four malformed native inputs must be rejected.

The runner checks every pair-order combination for up to 12 mixed RESUME/PAUSE pairs. Above that limit it checks the baseline and every single and two-pair reversal. For groups containing more than two records it checks group reversal, not every permutation; native result fields disclose the actual strategy and counts. A pass should retain those bounds rather than imply exhaustive ordering verification for every possible trace.

Successful replay prints one JSON line with `result: "pass_owned_exact_trace_native_regression"`, numeric `trials` and `invalid_native_inputs_rejected`, and `validation_path`. It writes copied sources, compiled classes, numbered native result JSON files and `validation.json` beneath a fresh `native-replay-<UUID>` child of the analysis directory. This adds host regression evidence; it does not turn the original app data into validated OAP output.

## Tool checks and failure interpretation

These commands show help or run pure in-memory validation examples. The self-test modes access no device, execute no native Java and write no evidence files:

```powershell
node scripts/analyze-android-timing.mjs --help
node scripts/analyze-android-timing.mjs --self-test
node scripts/replay-android-timing-analysis.mjs --help
node scripts/replay-android-timing-analysis.mjs --self-test
```

Analyzer self-test result is `pass_input_validation_self_tests_only`; native-result validator self-test result is `pass_result_validation_self_tests_only`. These examples exercise strict field/context/result validation and preserve unknowns and gaps. They do not establish a completed runtime report, real archive binding or successful native compilation/replay. A nonzero exit prints a specific rejection reason; no completed analysis/replay result should be claimed from a partially created output directory.

The inspector keeps its observations and optional timing panel in RAM. Host evidence files are deliberately saved development artifacts for the owned synthetic fixture; these tools add no app persistence, export control, networking, background collector or agent integration. Numerical and partial results remain unverified and are neither complete usage nor lower bounds on actual use. Physical/OEM support, measured production accuracy, source completeness, background/battery quality, full AC-25/26 and M2/M3 remain unproven. Linux portability and actual agent selection/integration remain deferred; no intermediary infrastructure is introduced.
