# Android emulator validation — October 6, 2026

**Historical review.** A later user-run deadline failure and a completed **10-workflow pass** using a longer bounded harness budget are covered in the [October 6 emulator rerun review](android-emulator-rerun-2026-10-06.md). That pass satisfies the scoped emulator-first gate for exact inspector 0.2.2 and fixture 0.1.0 bytes on Android 15/API 35 AOSP, for a local diagnostic trial; it does not establish timing accuracy or production readiness. This document retains the earlier interrupted attempt and historical outcomes; its references to the mutable current runtime report describe that earlier snapshot. Consult the rerun review for current status.

Status: **stopped at the user's request; the 0.2.2 full suite is incomplete**. Two cases passed, the third was interrupted by the requested emulator shutdown, and seven were not run. Native checks and a separate focused permission-display smoke passed. The emulator-first phone-testing gate is **not met**. Earlier passes and measurements are preserved below as history and are not carried forward. The [versioned 0.2.2 runtime review JSON](android-emulator-0.2.2-validation.json) distinguishes this interruption from an application failure; the [current runtime JSON](android-emulator-validation.json) reflects that annotated outcome.

The user requires emulator validation before any further personal APK trial. The [emulator plan](android-emulator-plan-2026-10-06.md) applies that gate to the exact inspector 0.2.2 and companion fixture 0.1.0 binaries recorded in the [frozen 0.2.2 native build/JVM audit](android-local-inspector-0.2.2-validation.json). The [0.2.1 build review](android-local-development-0.2.1.md) is historical. Compilation, setup and boot alone do not satisfy the gate.

The 0.2.2 patch refreshes the visible permission label when an AppOps change arrives while inspection is already stopped. It adds observer notification in that inactive branch after handling the permission revision. Active-session invalidation, observation clearing, consent boundaries, collection and reconstruction logic remain unchanged. Inspector version is `0.2.2-local`, version code **4**. Its exact-binary audit and focused stopped-session label check are complete; its full runtime suite was interrupted. The preceding 0.2.1 outcomes do not validate the new binary.

## Recorded current environment and binary identities

The 0.2.2 full report was initialized at **2026-10-06T22:15:10.030Z** and the raw harness finished at **2026-10-06T22:22:25.648Z** after the owned emulator was shut down at the user's request. Before its functional cases began, the harness verified the owned AVD/API/ABI, account-free emulator state, matching installed tool properties and both exact installed APK byte hashes:

| Field | Recorded value |
| --- | --- |
| Owned serial / AVD | `emulator-5580` / `liveabit-api35-test` |
| Project AVD path | `artifacts/android-emulator/avd/liveabit-api35-test.avd` |
| Android / API / ABI | Android 15 / API 35 / `x86_64` |
| AOSP image | `system-images;android-35;default;x86_64`, revision 2 |
| Emulator | 37.2.12; CPU acceleration on, software graphics |
| Account / emulator checks | Account-free and QEMU checks recorded as verified by the current run |
| Display | 1080 × 1920 |
| Build fingerprint | `Android/sdk_phone64_x86_64/emu64x:15/AE3A.240806.019/12368160:userdebug/test-keys` |
| Harness overall budget | 2,700,000 ms / 45 minutes, with bounded commands |
| Frozen harness SHA-256 | `94a03c46dd219ab12e260ef64aa368e921eb27a246a97c271d82c937db0076e5` |
| Startup-record SHA-256 | `9c68bf5730cf88c499413930eadbf53981f75ad749f6f08f8b8b042a23f47dcf` |

The [official archive/setup report](android-emulator-setup.json) documents verified package acquisition and local registration. The [startup record](../../artifacts/android-emulator/run.json) binds the workspace AVD, expected image/tool properties and acceleration configuration. The harness verifies startup freshness and property matches for each run; it does **not** independently attest the launcher or QEMU process ID. Those identity checks are scoped evidence rather than continuous host attestation.

| Installed APK | Version | Bytes | SHA-256 | Current installed bytes match native audit |
| --- | --- | ---: | --- | --- |
| `org.liveabit.inspect` | `0.2.2-local`, code 4 | 116284 | `87fb356e1619f64a9b9ac418da455b0055d05c454a18a452d9d901044797cf40` | Verified by current harness |
| `org.liveabit.fixture` | `0.1.0-fixture` | 66627 | `28ea22850e7224a5a959c9d614af07f0b76674655db51b96bc0d94ee79e04b46` | Verified by current harness |

The [frozen native audit](android-local-inspector-0.2.2-validation.json), generated at **2026-10-06T22:13:11.5541780Z**, records 30 collector/comparison and 25 independent fixture JVM cases, both actual native builds, zero lint errors/warnings in each APK and verified local development signatures. Actual binary audits again found only usage access in the inspector, no fixture permissions and no Internet permission in either APK. That audit's file SHA-256 is `655cb69e3bfd0df92e88cafa649d56122c5eb55eaa76c944806a260ace8e52aa`. The [harness source](../../scripts/test-android-emulator.mjs) operates on this owned emulator and the two owned packages. Local development signatures do not establish production signing/distribution readiness.

## Focused 0.2.2 permission-display smoke

The [separate focused report](android-permission-refresh-0.2.2-validation.json) records four passing stopped-session label updates: **ignore → allow → ignore → allow**, with no Start or inspection action. Visible labels followed each actual permission mode while the session remained stopped. This verifies the narrow inactive-observer display change and does not satisfy the full emulator gate.

An [initial smoke attempt](../../artifacts/android-permission-refresh-0.2.2-test/initial-smoke-validation.json) failed because its Inspect-control assertion referred to a control outside that viewport. The final focused scope checks the visible permission label and Stopped state only; it does not assert Inspect-control state. The full-suite Inspect-disabled assertion remains unchanged; the first two completed cases exercised the corresponding stopped-state control checks, while the later revocation workflow was not reached.

## Runtime case progress

The ten intended **0.2.2** workflows have the following final scoped status. Earlier attempts' passing cases are not substituted for this build's unfinished workflows.

| Case | Scoped observation / intended check | Recorded outcome |
| --- | --- | --- |
| `fresh_launch_and_permission_denial` | Both apps started empty/stopped; empty scope and denied usage access could not begin inspection | Pass |
| `usage_settings_grant_is_not_session_consent` | Actual stock Settings grant, with no AppOps grant fallback, left inspection stopped until Start | Pass |
| `manual_scope_validation_and_system_picker` | Exact identifier validation and system-picker workflow began; final assertion was not completed | Interrupted by requested shutdown |
| `no_preconsent_backfill_and_empty_is_unknown` | Fresh-session exclusion and unknown empty read | Not run |
| `controlled_idle_timing_and_scope` | Owned idle markers, transitions, retained-sum comparison and repeated-query stability | Not run |
| `controlled_screen_handoffs_timing_and_scope` | Six owned handoffs, retained-sum or unknown comparison and any observed discard reasons | Not run |
| `comparison_validation_and_input_erasure` | Invalid-input rejection and verified leave/return erasure | Not run |
| `stop_fresh_horizon_and_restart` | Observation clearing, fresh horizon and stopped/empty process restarts | Not run |
| `permission_revocation_and_rapid_regrant` | Active-session revocation/regrant control behavior | Not run |
| `clear_selection_persists_and_fixture_clear` | Saved-selection deletion and fixture Clear | Not run |

There are **no controlled timing measurements from this 0.2.2 full run**. Its numerical/unknown comparison branches, discarded-estimate warnings and repeated source reads were not exercised. A supported branch in the source is not a runtime result. The stock Settings grant was observed; the interrupted picker workflow has no completed case result.

The [preserved raw harness report](../../artifacts/android-emulator-0.2.2-test/raw-validation.json), SHA-256 `f3380bfb5a9b772db25917f8238bc62f9b039d2b726d39492259eac3619a95b1`, records exit failure when ADB reported that `emulator-5580` was no longer available after the requested shutdown. Its raw result is retained, while the versioned review explicitly classifies the third case as interrupted rather than a newly observed application failure. The [archived harness source](../../artifacts/android-emulator-0.2.2-test/harness-source.mjs) and [archive index](../../artifacts/android-emulator-0.2.2-test/archive-index.json) preserve the executed checks and this run's 77 UI hierarchies with 77 matching viewport records. No crash buffer was captured, so no general absence-of-crashes conclusion is made.

The owned emulator was closed during wrap-up. The recorded launcher PID **19172** and QEMU PID **5856** were verified absent afterward. This cleanup observation is separate from the harness's runtime identity limits. Work is stopped; no further personal phone test is requested.

The 0.2.1 update carries existing ambiguity reasons into the comparison and explains when earlier estimates were discarded, as required by [local specification revision 0.3](../../specs/android/local-inspector.md). This clarity preserves conservative reconstruction. It does not repair numerical accuracy, missing transitions or source completeness, and a retained sum is neither a complete app-session duration nor a lower bound on actual use.

## Historical attempts kept separate

The [historical 0.2.0 review](android-emulator-0.2.0.md) and [versioned historical JSON](android-emulator-0.2.0-validation.json) preserve six passing cases followed by an input-navigation automation failure. Its partial handoff sum is not a complete timing comparison or accuracy result. Its raw report, harness and UI evidence remain archived under `artifacts/android-emulator-0.2.0-test`.

The later [attempt 5 archive](../../artifacts/android-emulator-attempt5-test/validation.json) used inspector 0.2.1 and fixture 0.1.0 with harness SHA-256 `328e31580261eb0ced9b4da5ffcc630caa2caf53bf812ac168c157306eef7af0`. It recorded **four passing cases**, then failed in `controlled_idle_timing_and_scope` with “The updated owned-fixture comparison result was not rendered.” Its [failure hierarchy](../../artifacts/android-emulator-attempt5-test/0135-controlled-idle-timing-and-scope-failure.xml) showed the launcher. This is an incomplete automation attempt; it does not establish an inspector product failure or a runtime pass. The archived report SHA-256 is `927a0ebaa7f24e1e755b0a7ffffa4ea1409d428a303784f385129a1e218781aa`.

The [attempt 6 archive](../../artifacts/android-emulator-attempt6-test/validation.json), initialized at **2026-10-06T20:55:37.212Z** and finished at **2026-10-06T21:23:22.238Z**, records **six passes and one failure**. Its [archived harness source](../../artifacts/android-emulator-attempt6-test/harness-source.mjs) has SHA-256 `e7ec8e8b3a82a604a1f33841fc94aeb5468d813b8bfd01d2324964f8b56e1f62`; the archived JSON SHA-256 is `4eb2154a4d69d200c2f06e8695d0f2e73efaf6066c2dc8b5e9b62ff28cddc8c3`. The first six workflows passed through both controlled comparisons. The seventh, `comparison_validation_and_input_erasure`, failed with “Enabled visible control was not found: Compare a controlled test (optional)”; the later restart/revocation/Clear cases were not reached.

The [attempt 6 failure hierarchy](../../artifacts/android-emulator-attempt6-test/0360-comparison-validation-and-input-erasure-failure.xml) retained the open panel's **Hide controlled-test comparison** control, entered synthetic values and an invalid-duration result. That state is consistent with the attempted Home transition having been cancelled by immediate return before `onStop`, but this explanation is not conclusively proven. The failure does not establish that a completed leave/return retained the panel. The subsequent attempt 7 verified Home/return and passed the unchanged erasure assertion on 0.2.1; the 0.2.2 erasure workflow was not reached.

### Historical attempt 6 controlled comparisons

These values are preserved solely from attempt 6. Marker windows include emulator/UI automation time; they are not exactly the requested waiting interval. The fixture records its own callbacks, while the inspector reads Android's separate history source. Callback counts and source-transition counts describe different observations.

| Owned scenario | Marker window (ms) | Fixture own resumed union (ms) | Own callbacks within window | Retained source transitions | Retained inferred sum (ms) | Signed difference, sum − entered (ms) | Observed comparison status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Idle | 55,666 | 55,666 | 0 | 2 | 55,666 | 0 | Numerical, unverified estimate; no discard reason observed |
| Six screen handoffs | 48,182 | 47,854 | 12 | 14 | 10,647 | −37,207 | Numerical, partial unverified estimate; earlier estimates discarded |

The idle agreement is one owned observation and is not an accuracy pass. The handoff value is the sum remaining after deliberate conservative discards, not a complete app-session comparison or lower bound on actual usage. Its large negative difference must not be described as acceptable measured accuracy.

In attempt 6's handoff case the main display and comparison both showed “Some estimates were discarded; this sum may omit parts of the window.” The numerical comparison also carried the actual reasons: “Several transitions share one time; earlier estimates were discarded.” and “A pause has no known matching resume; earlier estimates were discarded.” The runtime assertions verified that warning and both reasons in the comparison. Repeating Inspect left the retained source-transition count stable in both controlled cases. Both measurements explicitly record `production_accuracy_pass: false`.

Attempt 6 actually exercised the stock Settings grant and positive system-picker selection; picker cancellation was not exercised. Its denied-access baseline used explicitly recorded emulator-only AppOps control. Both comparisons were numerical, so its comparison panel's **unknown-result branch was not exercised**. An empty source read was observed as unknown in the separate pre-consent case. These are historical observations, not new-run outcomes.

### Historical attempt 7: eight passes, permission display failure

The [attempt 7 raw report](../../artifacts/android-emulator-attempt7-test/validation.json) and [archive index](../../artifacts/android-emulator-attempt7-test/archive-index.json) preserve **eight passes and one failure**. The raw JSON SHA-256 is `ab9a243f964652180ef07c8725c4c01fa1de026492e3919ca3acb5d01b057deb`. Its [archived harness](../../artifacts/android-emulator-attempt7-test/harness-source.mjs) has the same frozen `94a03c46dd219ab12e260ef64aa368e921eb27a246a97c271d82c937db0076e5` hash planned for the 0.2.2 rerun. Its inspector was `0.2.1-local`, SHA-256 `013c6bde4e1b53d13e16cf15738017429f68556a18eb9ae33ed885a8b3e7106e`, with the unchanged 0.1.0 fixture.

The first six workflows passed again, followed by actual passes for comparison-input validation/erasure and Stop/fresh-horizon/process-restart. The confirmed Home transitions recorded launcher focus and an inspector-absent hierarchy before returning to a focused inspector; the erasure assertion was unchanged and had no reset fallback. Case nine, `permission_revocation_and_rapid_regrant`, failed with “Expected UI state is missing: Android usage access: allowed”. The inspector was stopped with observations empty, and AppOps was allowed, while the visible permission label remained stale. The [archived UI evidence](../../artifacts/android-emulator-attempt7-test/0480-permission-revocation-and-rapid-regrant.xml) and [failure hierarchy](../../artifacts/android-emulator-attempt7-test/0493-permission-revocation-and-rapid-regrant-failure.xml) preserve the stopped/empty display. The final Clear workflow was not reached; the failed case must not be counted as a passing authority workflow merely because the session stayed stopped.

Attempt 7's controlled idle trial recorded fixture and retained sums of **57,317 ms**, delta **0 ms**, zero interior callbacks and two retained transitions. Its six-handoff trial recorded a **48,189 ms** marker window, **47,778 ms** fixture union, **48,167 ms** retained sum and **+389 ms** delta, with 12 callbacks and 14 retained transitions. Both comparisons were numerical/unverified, both repeated-query counts stayed stable, and neither trial triggered discarded-estimate warnings. Attempt 6's partial-warning proof therefore applies only to its historical 0.2.1 run; it is not an observed branch in attempt 7 or proof for 0.2.2. The unknown comparison branch was not exercised in either attempt.

### Unfinished full runtime coverage

The unchanged frozen harness retains actual visible-inset and input-method checks. Before returning from Home, its bounded guard requires launcher focus, a fresh launcher hierarchy and absence of the inspector from that hierarchy, then verifies inspector focus and hierarchy on return. All assertion requirements remain intact. A future complete 0.2.2 run would still need the stopped-session display fix verified within the full permission-change workflow, the Clear case and the other uncompleted checks above. No historical pass completes this build's gate, and that future work is not running.

## Scope and limits

- Only owned synthetic fixture activity is inspected. Android usage-history completeness and initial state remain unknown; manually entered callback values are unauthenticated.
- Timing differences do not establish an accuracy threshold or other-app accuracy. Numerical, partial and unknown comparisons must retain their distinct observed status.
- Stock AOSP emulator observations do not establish physical-phone/OEM behavior, battery performance, background collection or direct agent delivery.
- Credential-storage lock before first unlock, 24-hour expiry, 4096-record overflow, unavailable-source injection, deterministic OS-query races, clock mutation, rotation and split-screen/multi-resume are outside this initial UI harness.
- Secure-window screenshots may be blank; saved UI hierarchies are the primary visible assertion evidence.

Physical Android validation, production accuracy, M2 and M3 remain unproven. This local inspector is not an Open Activity Protocol (OAP) publisher. Linux portability and agent selection remain deferred. The personal phone-testing gate is **not met** by this interrupted run.
