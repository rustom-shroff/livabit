# Android local inspection 0.2.2 build review

Date: **2026-10-06**. Scope: **inspector 0.2.2 build, APK audits, JVM checks, focused permission-refresh check and complete Android 15/API 35 emulator rerun, with unchanged owned fixture 0.1.0**. The native build and focused check passed. The [complete revised suite](android-emulator-0.2.2-rerun-validation.json) passed **ten cases, with zero failures**, verifying both exact installed APK hashes. **The emulator-first gate is met for a personal local diagnostic trial of these exact APKs.** This does not validate phone/OEM accuracy, other Android versions or production readiness. The [historical user-run deadline evidence](android-emulator-user-run-2026-10-06-validation.json), [earlier interrupted runtime evidence](android-emulator-0.2.2-validation.json), [native audit](android-local-inspector-0.2.2-validation.json) and [focused permission check](android-permission-refresh-0.2.2-validation.json) remain separate.

The [historical 0.2.1 attempt](android-local-development-0.2.1.md) passed eight cases before finding a stale permission label after rapid revocation/regrant. Inspection had stopped and its observations were erased, but the label could still show access as off after Android restored it. The [0.2.2 APK](../../artifacts/android-local-inspector/liveabit-local-inspector-0.2.2.apk) refreshes its visible observer on a permission change even while already stopped. It marks that notification handled before refreshing, so the refresh cannot recursively consume the same notification. An active or nonempty session still stops and clears on any matching permission change. A regrant cannot start collection or restore old observations.

The [local specification, revision 0.4](../../specs/android/local-inspector.md), now requires that visible permission status follow notifications while inactive. Comparing the preserved 0.2.1 and 0.2.2 native source hashes identifies only the coordinator, inspector version, verification artifact pin and local specification as changed inputs. The collector core, comparator, usage-query source, storage, manifests, resources and owned fixture are unchanged. The fixture remains byte-identical to its previously audited APK.

The existing timing limitations remain visible. Numerical results are sums of **retained inferred intervals**. Same-timestamp transitions or unmatched pauses can discard estimates; the main summary and controlled comparison warn that the remaining sum may omit part of the window. Ambiguity reasons remain visible in numerical and unknown comparisons. These numbers are neither complete session durations nor lower bounds on actual use, and no comparison is a production accuracy pass.

## Native verification

The [preserved native audit](android-local-inspector-0.2.2-validation.json), generated at **2026-10-06T22:13:11.5541780Z**, records `pass_with_device_limits` for build and JVM checks only.

| Audited binary | Package / version | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Inspector | `org.liveabit.inspect` / `0.2.2-local` | 116284 | `87fb356e1619f64a9b9ac418da455b0055d05c454a18a452d9d901044797cf40` |
| Owned fixture | `org.liveabit.fixture` / `0.1.0-fixture` | 66627 | `28ea22850e7224a5a959c9d614af07f0b76674655db51b96bc0d94ee79e04b46` |

- **30 collector/comparison JVM cases** and **25 independent owned-fixture JVM cases** passed.
- Both APKs were rebuilt and linted; each has **zero errors and zero warnings**, a verified local development signature, minimum SDK 35 and target SDK 37. Source hashes showed no input drift.
- Binary audits found only `android.permission.PACKAGE_USAGE_STATS` in the inspector and zero permissions in the fixture. Neither has Internet permission.

The build audit records `emulator_tested: false` because that build procedure does not exercise Android. Runtime evidence separately verifies installed bytes and workflows actually reached. The [guide](../../android/README.md) preserves this distinction, the complete emulator result for these exact APKs, and reproduction commands for another user-run suite.

## Focused permission-refresh check

The [separate check](android-permission-refresh-0.2.2-validation.json), generated at **2026-10-06T22:14:42.548Z**, passed four controlled changes on the owned Android 15/API 35 AOSP emulator: off, allowed, off, allowed. The visible permission label matched each mode while inspection remained stopped; no Start or Inspect action was performed. The companion UI snapshots are linked from that report. This confirms the narrow status refresh and does not establish that the full collector/fixture runtime suite passed. Its `full_emulator_gate` remains false.

## Earlier interrupted emulator suite

The [versioned runtime report](android-emulator-0.2.2-validation.json) records the earlier 0.2.2 run on the owned Android 15/API 35 AOSP emulator. It was stopped at the user's request, rather than completed as an acceptance run. Its raw output and annotation must be read together: shutdown interrupted the third case, and that interruption does not establish an APK failure or an APK pass.

| Workflow | Final outcome |
| --- | --- |
| Fresh startup and permission denial | Passed |
| Android Settings grant remains separate from session consent | Passed |
| Manual scope validation and system picker | Interrupted |
| No pre-consent backfill / empty source | Not run |
| Controlled idle comparison | Not run |
| Controlled screen-handoff comparison | Not run |
| Comparison validation and input erasure | Not run |
| Stop, fresh horizon and process restart | Not run |
| Revocation and rapid regrant | Not run |
| Clear selection and fixture data | Not run |

No collector/fixture timing measurements were produced by that interrupted run. Earlier 0.2.1 observations remain historical evidence for their own binary and cannot fill its seven unrun cases.

## User-run suite and deadline correction

The user's [preserved rerun](android-emulator-user-run-2026-10-06-validation.json) initialized at **2026-10-07T03:19:49.963Z** and ended at **2026-10-07T04:04:51.724Z**—October 6, approximately **8:19–9:04 p.m. Pacific**. It verified both installed APKs against the same exact audited byte hashes. The [raw report](../../artifacts/android-emulator-user-run-2026-10-06/raw-validation.json), [original harness source](../../artifacts/android-emulator-user-run-2026-10-06/harness-source.mjs) and [archive index](../../artifacts/android-emulator-user-run-2026-10-06/archive-index.json) preserve this attempt independently of the next run.

| Workflow | User-run outcome |
| --- | --- |
| Fresh startup and permission denial | Passed |
| Android Settings grant remains separate from session consent | Passed |
| Manual scope validation and system picker | Passed |
| No pre-consent backfill / empty source | Passed |
| Controlled idle comparison | Passed |
| Controlled screen-handoff comparison | Passed |
| Comparison validation and input erasure | Passed |
| Stop, fresh horizon and process restart | Overall deadline expired; unproven |
| Revocation and rapid regrant | Not run |
| Clear selection and fixture data | Not run |

The report's failed eighth case says `The bounded emulator test time budget expired.` Its 45-minute global deadline expired during Stop/fresh-horizon/restart; that workflow has neither an app assertion failure nor a completed pass. The idle retained sum differed from the entered fixture duration by **+1 ms**, and the screen-handoff sum by **+523 ms**. Both remained known unverified estimates with no discarded-estimate trigger. These are diagnostic measurements without a production accuracy threshold, not accuracy passes or complete source evidence.

Only the [runtime harness](../../scripts/test-android-emulator.mjs) changed for the revised attempt: its overall default is **90 minutes**, with `--timeout-minutes` accepting an integer from 45 through 120. Individual ADB commands remain bounded at 45 seconds and cleanup at 15 seconds; APKs and app assertions are unchanged. The revised harness hash is `20158933f677c4f5b6f627669e8cbe0c67e8a7434e9c5dbc1e9d20c2f3c9e4f2`. No APK rebuild was needed. Ninety minutes is a maximum budget rather than an expected runtime or guarantee of completion. The [guide](../../android/README.md) gives the command for another user-run suite.

## Complete revised emulator suite

The [frozen complete result](android-emulator-0.2.2-rerun-validation.json) initialized at **2026-10-07T05:29:59.339Z** and finished at **2026-10-07T06:09:21.611Z**—October 6, approximately **10:29–11:09 p.m. Pacific**. It completed in **39 minutes 22 seconds** under the revised 90-minute budget. All ten workflows in the earlier table passed in this new run, including Stop/fresh horizon/process restart, revocation/rapid regrant, and Clear selection/fixture data. Those passes are new observations, not imported from historical runs. The same exact audited APK bytes were installed and verified.

The suite observed a stock Android Settings grant without AppOps fallback, positive system-picker selection, and six confirmed Home departures and owned-inspector returns. Picker cancellation and unknown comparison UI were not exercised. Repeated manual reads kept retained record counts stable. Stop and revocation cleared rendered observations; fresh Start excluded prior events; inspector process restart remained stopped while preserving selection; Clear selection persisted through restart; the fixture's process restart and Clear erased its displayed values. These assertions verify visible behavior, not a forensic heap inspection.

| Controlled window | Entered fixture duration | Retained inferred sum | Signed difference | Interpretation |
| --- | ---: | ---: | ---: | --- |
| Idle | 55,051 ms | 55,051 ms | 0 ms | Known unverified estimate |
| Six internal screen handoffs | 47,064 ms | 3,203 ms | −43,861 ms | Known partial unverified estimate; earlier estimates discarded |

The handoff window contained 12 callbacks and 14 retained Android transitions. Same-time transitions and an unmatched pause discarded estimates; the suite verified the warning and actual ambiguity reasons in both the main summary and comparison. The remaining sum can omit most of the controlled window. Passing the workflow validates disclosure and arithmetic, not timing accuracy, source completeness or a production threshold. The idle zero difference is also not an accuracy pass.

The [archive index](../../artifacts/android-emulator-0.2.2-rerun-test/archive-index.json) preserves 517 synthetic UI hierarchies and 517 viewport records, the original [raw report](../../artifacts/android-emulator-0.2.2-rerun-test/raw-validation.json), frozen harness/startup record and exact APK/native audit copies. The [captured crash buffer](../../artifacts/android-emulator-0.2.2-rerun-test/crash-log.txt) was empty, so no owned-app crash was encountered during this scoped run. [Cleanup evidence](../../artifacts/android-emulator-0.2.2-rerun-test/cleanup.json) records the dedicated emulator closed and its launcher/QEMU processes absent. The 55 native checks and four focused permission checks retain their distinct scopes; the complete runtime result now meets the emulator-first gate for an optional personal diagnostic trial of these exact binaries.

Activity remains in process memory; only private no-backup selection/control preferences persist. There is no background collector, agent connection, export or intermediary delivery infrastructure. Android source completeness, physical-phone/OEM behavior, battery performance and measured production accuracy remain unverified. These local diagnostics are not validated Open Activity Protocol (OAP) summaries; M2/M3 and Linux work remain deferred or unproven.
