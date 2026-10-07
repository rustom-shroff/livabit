# Android emulator rerun — October 6, 2026

Status: **10 workflows passed, 0 failed**. The unchanged inspector **0.2.2** and fixture **0.1.0** completed the fresh suite with the longer bounded harness budget. The emulator-first gate is satisfied for these exact binaries on **Android 15 / API 35 AOSP**, for a further local diagnostic trial. This is a functional workflow result, not a timing-accuracy or production-readiness result. The [frozen rerun report](android-emulator-0.2.2-rerun-validation.json) preserves the completed evidence; the [current raw runtime report](android-emulator-validation.json) records the harness outcome. No historical pass was substituted for a case in this run.

The run began at **2026-10-07T05:29:59.339Z** and finished at **2026-10-07T06:09:21.611Z**: **October 6, 10:29:59–11:09:21 PM PDT**, lasting **39 minutes 22 seconds**. Its first workflow began at `2026-10-07T05:30:00.944Z`. The emulator was subsequently closed after its identity was rechecked. Changed APKs still require their own completed emulator validation.

## Change and reason

The user's [preserved emulator run](android-emulator-user-run-2026-10-06-validation.json) passed seven workflows, then stopped in `stop_fresh_horizon_and_restart` because the harness's **45-minute overall budget expired**. The first seven cases consumed **44 minutes 24 seconds**. The eighth case began with roughly 33 seconds remaining; the same workflow had taken about 170 seconds in an earlier attempt. This failure does not identify a failed app assertion. The ninth permission-revocation and tenth Clear workflows were not reached.

Only [the harness](../../scripts/test-android-emulator.mjs) changed for this rerun. Its default overall budget is now **90 minutes**, with an explicit integer `--timeout-minutes` option bounded to **45–120 minutes**. The **45-second individual command cap**, **15-second cleanup budget**, APK-byte checks, emulator/device restrictions, UI safety checks and application assertions remain unchanged. The [separate budget-change verification](android-emulator-budget-change-validation.json) confirms the restricted source change and that invalid values `44`, `121`, `90.5` and `abc`, and a physical-device target, were rejected before device mutation. A larger deadline permits slower emulator/UI operations; it does not turn an assertion failure into a pass.

The executed harness SHA-256 is **`20158933f677c4f5b6f627669e8cbe0c67e8a7434e9c5dbc1e9d20c2f3c9e4f2`**. The completed report records `overall_timeout_millis: 5400000`. No APK or collector algorithm was changed to address the deadline. This rerun happened to finish within 45 minutes; the user's slower preceding run is still preserved as evidence for increasing the bound.

The user's original failed run is preserved with its raw results, timing values and failure message. Its [archive index](../../artifacts/android-emulator-user-run-2026-10-06/archive-index.json) lists **445 UI hierarchies and 445 matching viewport records**, alongside the original harness and startup record. The [raw report](../../artifacts/android-emulator-user-run-2026-10-06/raw-validation.json) SHA-256 is **`013383514d40bbf793b933c94fc7947db47eebafd2efa41ab96fe22a569f41bc`**. The review JSON relocates only saved UI paths and adds preservation metadata; it does not rewrite that failure as a pass.

## Environment and exact binaries

The current harness verified these identities before any workflow mutation:

| Field | Actual recorded value |
| --- | --- |
| Owned serial / AVD | `emulator-5580` / `liveabit-api35-test` |
| Android / API / ABI | Android 15 / API 35 / `x86_64` |
| Build fingerprint | `Android/sdk_phone64_x86_64/emu64x:15/AE3A.240806.019/12368160:userdebug/test-keys` |
| AOSP image | `system-images;android-35;default;x86_64`, revision 2 |
| Emulator | 37.2.12; CPU acceleration on, software graphics |
| Display | 1080 × 1920 |
| Account and guest identity | Account-free, QEMU and completed-boot checks passed |
| Startup record | `2026-10-07T05:27:51.5767699Z`; fresh project-owned path and matching tool properties verified |

The [archived startup record](../../artifacts/android-emulator-0.2.2-rerun-test/run.json) SHA-256 recorded by this run is `a120d3863b1977243b1e9e79110826b49bd6341ec8af5e548f5551ba9d9ca247`. The harness binds the owned AVD path through this record and the actual AVD name; it does not independently attest the launcher/QEMU process ID or continuously attest the host. Post-run ownership and process-exit checks are separate evidence below.

| APK | Version | Bytes | SHA-256 | Current installed bytes |
| --- | --- | ---: | --- | --- |
| `org.liveabit.inspect` | `0.2.2-local`, code 4 | 116284 | `87fb356e1619f64a9b9ac418da455b0055d05c454a18a452d9d901044797cf40` | Verified against the native audit |
| `org.liveabit.fixture` | `0.1.0-fixture` | 66627 | `28ea22850e7224a5a959c9d614af07f0b76674655db51b96bc0d94ee79e04b46` | Verified against the native audit |

The [frozen native audit](android-local-inspector-0.2.2-validation.json), generated at `2026-10-06T22:13:11.5541780Z`, separately records **30 collector/comparison and 25 fixture JVM checks**, native builds, verified local development signatures, and **zero lint errors or warnings** in both APKs. Both have minimum API 35 and target API 37. The inspector has only usage access; the fixture has no permissions; neither APK has Internet permission. These native/build checks are historical evidence for the unchanged bytes, not a full emulator outcome or production distribution approval.

The [separate focused permission-display check](android-permission-refresh-0.2.2-validation.json) passed four stopped-session label states: **ignore → allow → ignore → allow**, without Start or inspection actions. That focused check did not assert the Inspect control outside its viewport and does not complete the full permission-revocation workflow. The full suite retains its own disabled-control assertion.

## Fresh full-suite workflows

The ten rows below refer only to the completed run initialized at `2026-10-07T05:29:59.339Z`.

| Workflow | Observed check | Final reviewed outcome |
| --- | --- | --- |
| `fresh_launch_and_permission_denial` | Empty/stopped launch; empty scope and denied permission reject Start | Pass |
| `usage_settings_grant_is_not_session_consent` | Actual stock Settings grant leaves inspection stopped until explicit Start; no AppOps grant fallback | Pass |
| `manual_scope_validation_and_system_picker` | Invalid identifier rejected; actual fixture selection returned by the system picker | Pass |
| `no_preconsent_backfill_and_empty_is_unknown` | Pre-consent events excluded; empty history stays unknown | Pass |
| `controlled_idle_timing_and_scope` | Owned idle markers/transitions, numerical comparison and stable repeated read | Pass |
| `controlled_screen_handoffs_timing_and_scope` | Six owned handoffs; partial numerical comparison retains warnings/reasons; repeated read remains stable | Pass |
| `comparison_validation_and_input_erasure` | Reversed, oversized and outside-session values rejected; confirmed Home/return clears manual values and result | Pass |
| `stop_fresh_horizon_and_restart` | Stop erases observations but preserves selection; fresh horizon excludes prior observations; inspector restart is stopped and fixture restart empty | Pass |
| `permission_revocation_and_rapid_regrant` | Revocation clears observations; grant does not resume consent; rapid regrant keeps the session stopped and refreshes the allowed label | Pass |
| `clear_selection_persists_and_fixture_clear` | Selection stays deleted after restart; fixture Clear erases comparison values | Pass |

Six Home transitions were actually confirmed through launcher focus and fresh launcher hierarchy with the inspector absent, followed by actual inspector focus/hierarchy on return. The erasure check was unchanged and did not use a reset fallback. The stock Settings grant and positive picker selection were exercised; **picker cancellation was not exercised**. Revocation and regrant controls used explicitly recorded emulator-only AppOps changes.

## Controlled comparisons from this run

The marker windows include emulator/UI automation time and are not exactly the requested idle wait. The fixture's own callback union and Android's separate usage-history observations describe different sources.

| Owned scenario | Marker window (ms) | Fixture own resumed union (ms) | Own callbacks | Retained source transitions | Retained inferred sum (ms) | Difference, sum − entered (ms) | Observed status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Idle | 55,051 | 55,051 | 0 | 2 | 55,051 | 0 | Numerical, unverified estimate; no discard reason observed |
| Six screen handoffs | 47,364 | 47,064 | 12 | 14 | 3,203 | −43,861 | Numerical, partial unverified estimate; earlier estimates discarded |

The handoff sum omitted most of the controlled interval. Its large negative difference is **not acceptable measured accuracy** and must not be described as a complete app-session duration or a lower bound on actual usage. The workflow passed because the conservative reconstruction retained its discard semantics and the app explicitly presented the missing-estimate limitation; it did not pass an accuracy threshold. Both trials record `production_accuracy_pass: false`, including the idle trial's agreement.

In the handoff trial, both the main display and comparison actually showed **“Some estimates were discarded; this sum may omit parts of the window.”** The comparison also carried both observed reasons: **“Several transitions share one time; earlier estimates were discarded.”** and **“A pause has no known matching resume; earlier estimates were discarded.”** This rerun verified the partial-warning branch on the exact 0.2.2 bytes. Repeating Inspect left retained source-transition counts unchanged in both trials.

Both comparisons were numerical, one partial. The comparison panel's **unknown-result branch was not exercised**; a separate empty source read was displayed as unknown in the pre-consent workflow. No source-supported branch is treated as runtime evidence without an observation.

## Preservation, crash check and cleanup

The [raw completed report](../../artifacts/android-emulator-0.2.2-rerun-test/raw-validation.json) SHA-256 is **`ffafbab1bfd67e6b602094c55fe611e1f51eb3a520acfb0584a525dba1f38e23`**. The [archive index](../../artifacts/android-emulator-0.2.2-rerun-test/archive-index.json) preserves **517 UI hierarchies with 517 matching viewport records**, the exact [executed harness](../../artifacts/android-emulator-0.2.2-rerun-test/harness-source.mjs), startup and native audits, tested APKs, budget-change proof and post-run evidence. The frozen review JSON relocates UI paths to this archive and adds preservation/post-run metadata; original case results, measurements, timestamps and runtime claims remain unchanged.

The guest crash buffer was collected after the suite and contained **zero lines**; the empty [crash log](../../artifacts/android-emulator-0.2.2-rerun-test/crash-log.txt) is preserved. No app crash was encountered in the exercised workflows. This limited check does not establish an exhaustive absence of crashes.

The [separate cleanup record](../../artifacts/android-emulator-0.2.2-rerun-test/cleanup.json) records reverified owned-emulator identity, a shutdown request at `2026-10-07T06:10:57.930978Z`, and verified exit of launcher PID **25332** and the owned QEMU process. Only the dedicated owned emulator was targeted; unrelated devices were not targeted. Tools, AVD and evidence remain available for another user-run suite.

## Earlier runs and remaining limits

The [earlier October 6 review](android-emulator-2026-10-06.md) remains historical. Its interrupted 0.2.2 attempt passed two cases before a requested shutdown; it is distinct from the user's later seven-pass deadline failure and this fresh rerun. Earlier 0.2.0/0.2.1 attempts remain preserved there, including the permission-display bug that led to 0.2.2. Those outcomes are not carried into this run's table.

- Testing uses only owned synthetic fixture activity. Android history completeness and initial state remain unknown; manually entered fixture values are unauthenticated.
- A retained interval sum can omit discarded estimates. It is neither a complete app-session duration nor a lower bound on actual use. Timing differences do not establish production accuracy or accuracy for other apps.
- Actual stock Settings grant, positive picker selection, six confirmed Home transitions and the partial-discard warning were observed. Picker cancellation and the unknown comparison result remain unexercised.
- Visible erasure/restart checks do not inspect heap memory. Ordinary keyguard lock does not test credential storage before first unlock.
- Physical phone/OEM behavior, battery, background collection and direct agent delivery remain outside this initial suite.
- Clock mutation, rotation, split-screen/multi-resume, 24-hour expiry, 4096-record overflow, unavailable-source injection, deterministic OS-query races, fixture callback exhaustion and the fixture's ten-minute bound remain untested by this suite.
- Secure-window screenshots can be blank; saved fresh UI hierarchies and actual viewport records are the primary visible assertion evidence.

The local inspector is not an Open Activity Protocol (OAP) publisher and introduces no activity-delivery intermediary. Agent selection/integration and Linux portability remain deferred. Physical Android validation, newer API/OEM coverage, measured production accuracy, M2 and M3 remain unproven. The emulator-first gate is satisfied for the recorded exact binaries on API 35 AOSP for a local diagnostic phone trial; this scoped pass does not complete broader acceptance criteria or authorize a production-quality claim.
