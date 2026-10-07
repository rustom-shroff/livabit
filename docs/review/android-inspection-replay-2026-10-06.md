# Owned Android inspection replay

Date: 2026-10-06; source-baseline preservation update: 2026-10-07. Scope: TASK-P6-F02/F03, offline explanation of preserved owned-fixture observations. This host development tool rebuilds no Android APK and changes no inference policy. The exact inspector 0.2.2 and fixture 0.1.0 retain their separately recorded [ten-workflow Android 15 result](android-emulator-rerun-2026-10-06.md). A separate current-core replay comparison accompanies later clock-safety development without replacing the historical source identity.

## Purpose and evidence boundary

The handoff workflow passed its UI and lifecycle assertions, but retained only 3,203 ms against an entered fixture duration of 47,064 ms. A workflow pass does not establish timing quality. The replay makes that loss reproducible and explains each complete timestamp group before any inference policy is revised.

The [extractor](../../scripts/extract-android-inspection-replay.mjs) accepts the fixed, deliberately owned fixture archive. It verifies the frozen raw report, matching APK bytes and recorded native source hashes, and reads complete fixture-only transition displays. Partial displays, other package identifiers and conflicting complete displays are rejected. Before changing the collector's clock guards, the original hash-matching [0.2.2 collector source](../../artifacts/android-inspection-replay/baseline-core/LocalInspectionCore.java) and [comparator source](../../artifacts/android-inspection-replay/baseline-core/FixtureComparison.java) were preserved. The [runner](../../scripts/replay-android-inspection.mjs) compiles those baseline files with the [host replay adapter](../../tools/android-inspection-replay/InspectionReplay.java), then separately compiles the [current collector](../../android/collector-core/src/main/java/org/liveabit/collector/core/LocalInspectionCore.java) and [comparator](../../android/collector-core/src/main/java/org/liveabit/collector/core/FixtureComparison.java) and checks the same traces against them. It executes each actual native implementation rather than substituting a second estimator.

Displayed transition timestamps omit year and timezone. The original numeric session/query anchors and paired elapsed clocks were not archived. Consequently, **this is a normalized trace replay with synthetic authorization/query/clock bounds**, not reproduction of the original Android query or proof of consent timing. The fixture comparison codes are aligned to the display using an explicit **2026 / UTC−07:00 assumption**, which was not independently measured on the emulator. Relative transition differences are preserved within these short traces. Neither that alignment nor source completeness becomes authenticated. A future controlled capture should record the display timezone and numeric query/consent bounds before claiming exact alignment.

## Reproduced behavior

| Owned scenario | Full trace's retained inferred sum | Sum clipped to derived fixture window | Entered fixture duration | Signed difference |
| --- | ---: | ---: | ---: | ---: |
| Idle | 88,201 ms | 55,051 ms | 55,051 ms | 0 ms |
| Internal screen handoffs | 32,896 ms | 3,203 ms | 47,064 ms | −43,861 ms |

The 14-record handoff trace has two pause/resume groups with identical timestamps. At offsets 37,138 ms and 47,979 ms, the core discards earlier inferred intervals rather than imposing an order on those records. Subsequent unmatched pauses also invalidate prior estimates. The final retained interval is 51,641–84,537 ms. Clipping it to the derived fixture window, 7,480–54,844 ms, leaves 3,203 ms. The replay records per-group retained/discarded intervals and native reasons, plus the final comparison status.

All numerical results remain unverified; partial results remain partial, and empty inferred evidence remains unknown. No gap is filled, no starting state or source continuity is asserted, and no output is eligible as an OAP summary. Even retaining more intervals would not itself verify accuracy: fixture callbacks and Android history are distinct sources with different transition timestamps.

## Running and validation

From the project root, using the already installed pinned JDK:

```powershell
node .\scripts\replay-android-inspection.mjs
```

This accesses no device or network, installs nothing and builds no APK. It writes derivation inputs, native results and a local report beneath `artifacts/android-inspection-replay`; the [review report](android-inspection-replay-2026-10-06-validation.json) records source hashes and the actual checks. Original emulator evidence remains unchanged.

The replay checks the archived numerical outputs, all four combinations of the handoff trace's two same-time pair orderings, and complete-timestamp-group query partitioning against one read of the same trace. A separate genuine-gap case verifies that the pause gap contributes no time. Strict input rejection checks cover invalid format/count/type, unordered or negative/fractional time, missing/extra records and oversized windows/traces. Extraction boundary checks separately reject truncated or non-fixture input and inconsistent source evidence.

The completed run reproduced both archived comparisons using the preserved baseline, then separately confirmed equal native replay outputs for the current collector/comparator. The current core adds original-session clock-drift protection; the replay uses paired synthetic clocks and therefore does not test that safety change, which has its own JVM regressions. The report binds both sets of source hashes rather than relabeling the old core as current. Thirteen extraction checks, ten native input rejections, all four handoff pair-order combinations, all three query-partition strategies for each trace and genuine-gap checks passed. Source/input/output hashes were verified against the saved report, and specification/link validation retained all 33 requirements and 29 acceptance mappings.

These are host regression checks on owned evidence. They add no Android runtime coverage, physical/OEM claim, accuracy threshold, permission attestation, background/battery result, M2/M3 completion or agent integration. Linux and agent selection remain deferred. No additional phone input is needed for this development step.
