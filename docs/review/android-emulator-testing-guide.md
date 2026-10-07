# Owned Android emulator checks

Date: **2026-10-07**. Scope: TASK-P6-F02/F03 local inspector and owned fixture workflows. The exact inspector 0.2.4/fixture 0.1.0 bytes passed all ten workflows on each [API 35](android-emulator-0.2.4-api35-validation.json) and [API 36](android-emulator-0.2.4-api36-validation.json) image. This meets the emulator-first gate for an optional local diagnostic phone trial. The [0.2.4 review](android-local-development-0.2.4.md) preserves 82 host checks, exact timing/native replay, separate [controlled framework recreation checks](android-lifecycle-recreation-2026-10-07.md) and verified owned guest shutdown. Source completeness and physical/OEM accuracy remain unverified. Historical 0.2.3 results and its four earlier API 36 guarded failures remain preserved below; those passes apply only to their recorded bytes.

## Fixed environments and run boundaries

| API | AOSP default image | Owned AVD | Serial | Setup/start scripts |
| --- | --- | --- | --- | --- |
| 35 | `system-images;android-35;default;x86_64` | `liveabit-api35-test` | `emulator-5580` | [Setup](../../scripts/setup-android-emulator.ps1), [start](../../scripts/start-android-emulator.ps1) |
| 36 | `system-images;android-36;default;x86_64` | `liveabit-api36-test` | `emulator-5582` | [Setup](../../scripts/setup-android-api36-emulator.ps1), [start](../../scripts/start-android-api36-emulator.ps1) |

Use one owned guest and one workflow run at a time. Startup resets only its explicitly owned AVD, rejects occupied ports and changed/redirected identities, and reuses existing host acceleration. The accepted SDK terms remain required; these procedures silently accept no extra terms and install no host driver or virtualization setting. Preserve an earlier completed run before starting another or changing its harness/startup identities. Reuse an existing owned guest only after its bounded readiness and fresh startup provenance checks pass.

Run the API 36 startup script with the existing PowerShell 7 runtime (`pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/start-android-api36-emulator.ps1`). Windows PowerShell 5.1 lacks the path-validation API it uses; the [preserved startup rejection](../../artifacts/android-lifecycle-probe-root-review/run-76034471-73d8-4c2c-9133-6f0ff378a854/api36-start-windows-powershell-rejection.json) occurred before emulator launch. This is a runtime prerequisite; no new installation or SDK terms are needed here.

Install the same audited inspector and fixture bytes after stock Launcher readiness is established. The [runtime harness](../../scripts/test-android-emulator.mjs) checks QEMU/AVD/API/ABI/image/startup/account-free identity and actual installed APK hashes before its app workflows. No physical-device serial, arbitrary AVD or API 37 profile is accepted. There is no APK rebuild inside the runtime suite.

From the project root, choose exactly one matching profile. These are workflow commands for a prepared, idle owned guest; do not start a concurrent run:

```powershell
# Android 15 / API 35:
node scripts/test-android-emulator.mjs --serial emulator-5580 --expected-avd liveabit-api35-test --idle-ms 30000 --timeout-minutes 90
# Android 16 / API 36, as a separate run:
node scripts/test-android-emulator.mjs --serial emulator-5582 --expected-avd liveabit-api36-test --idle-ms 30000 --timeout-minutes 90
```

The default overall allowance is 90 minutes; `--timeout-minutes` accepts integers 45–120 and `--idle-ms` accepts 10,000–60,000. Individual device commands are bounded at 45 seconds and cleanup at 15 seconds. An overall deadline or guarded interaction failure leaves that case unproven and later cases unexecuted; it never turns them into passes. Shutdown must target only the currently verified owned guest.

## Strict viewport recovery and pure checks

The harness reads display/window insets to bound safe interaction. Visible invalid/empty inset geometry, an interior occluder without a safe rectangle or an unpermitted focused package remains a rejection. Up to three read-only attempts with 250 ms delays may obtain a later valid observation; the parser itself is unchanged. Cached safe geometry is cleared before reading.

After a retry, the harness recaptures a fresh hierarchy/viewport pair rather than reusing old node coordinates. A recovered tap requires a unique semantically matching enabled visible node in the focused package. Persistent invalid state, stale/ambiguous nodes or focus mismatch abort without the unsafe gesture. These samples cannot cryptographically attest that windows remain unchanged between observation and input.

The [frozen host recovery audit](../../artifacts/android-viewport-validation/run-fb0a7de5-9cb8-4abf-a15c-fd27928577eb/validation.json) verifies unchanged strict parser and ten case bodies, pure recovery/rejection scenarios, and original failed evidence integrity. Pure checks can be invoked independently:

```powershell
node scripts/test-android-emulator.mjs --self-test
node scripts/archive-android-emulator-run.mjs --self-test
```

They execute no device action, gesture, SDK setup, guest startup or APK build and write no runtime evidence. Their result labels are `pass_pure_owned_profile_checks` with nested `pass_pure_strict_viewport_and_recovery_checks`, `pass_pure_ime_diagnostic_capture_checks` and `pass_pure_launch_only_ime_recovery_checks`, and `pass_pure_archive_profile_checks`. They are host tests, not an Android runtime pass.

The [later diagnostic-only audit](../../artifacts/android-ime-diagnostic-validation/run-cf6c78fb-57a5-4620-aba4-b8e0b491c1b5/validation.json) adds strict-trigger and source-preservation checks for full window/input-method captures. The current reviewed code reads those states only on the exact observed visible zero-height IME rejection, then brackets them with another display/focus read. Those sequential snapshots are not atomic and do not supply a geometry exception or allow a new gesture. Their availability, sizes, hashes and observed bracket consistency remain diagnostic fields, not a verdict that a control is safe to tap.

## Separate launch-only keyboard dismissal

The [corrected host proof](../../artifacts/android-launch-ime-validation/run-0052250f-99a2-40b1-85b8-e8b632e6948d/validation.json) covers a separate recovery immediately after verified API 36 inspector launch. Ordinary API 35 launches and generic snapshots/diagnostics retain their existing behavior. The generic parser still rejects visible empty inset geometry; the launch wrapper first changes keyboard state under strict ownership checks, then requires valid geometry.

Before one Back is allowed, the exact zero-height IME trigger must match complete inspector window/focus/client identities and the actual connected, shown and show-requested stock LatinIME state. A second focus/source read must still match. Intent persistence precedes the command; uncertain execution or unexpected output ends recovery without another Back. After the command, current window/manager/service/source records must confirm hidden keyboard state with unchanged owner/client/IME binding. A strict valid viewport and fresh expected inspector hierarchy are then required before ordinary node/gesture guards can continue.

The corrected historical host proof passed 34 binding rejection cases, 54 orchestration scenarios, 11 valid/64 rejected archive metadata cases and nine synthetic integration states. Evidence is bounded to seven source reads and one Back attempt per launch, with at most 20 launch records. The six archived actual source sets prove prerequisites only; all tested post-dismissal states in that proof are synthetic. It sent zero actual device commands and establishes no runtime recovery pass. Independent final review passed before the fourth runtime attempt, whose actual guarded failure remains preserved separately.

The [later read-order host proof](../../artifacts/android-ime-read-order-validation/run-7773e999-e454-4287-80c8-fc10d6d8e868/validation.json) verifies the tested post-dismissal order: input-method state, fresh hierarchy, full window, then final display. It adds no read, delay, action or acceptance rule. All fourteen checked geometry/binding/interaction functions and ten workflow bodies remain identical; seven source reads, one Back and the existing 250 ms post-command delay remain bounded. Its 55 orchestration scenarios retain rejection of empty visible geometry and the fourth attempt's early post-dismissal window state. The separate [fifth runtime report](android-emulator-0.2.3-api36-validation.json) records an actual recovered launch under these unchanged guards and completion of all ten workflows. That runtime result does not rewrite the host proof's false runtime-verification flags.

## Preserve results before another run

The suite writes its changing working report to `docs/review/android-emulator-validation.json` and UI/viewport/available retry diagnostics beneath `artifacts/android-emulator-test`. A completed report's result, ordered cases, summary, installed identities, source/setup hashes and actual measurements must be read together. Frozen versioned reports and archives supply historical conclusions; the mutable working file describes the latest run.

The [archive helper](../../scripts/archive-android-emulator-run.mjs) takes a unique bounded name such as:

```powershell
node scripts/archive-android-emulator-run.mjs --archive-name android-emulator-local-followup-01
```

Choose a new name for each completed attempt. The helper refuses an existing destination, incomplete reports, changed original harness bytes and mismatched startup/image/APK identities. It binds the raw report, original harness, native audit, startup/image setup, SDK identity properties/registration, APKs and referenced UI/viewport/diagnostic files in an archive hash index. It preserves failures as failures; UI-path relocation in a review copy does not change the original assertions.

Launch-recovery evidence preserves ordinary `not_required` launches, rejected-before-command, uncertain-command and rejected-after-command results alongside recovered results. Phase flags require their matching source/focus prerequisites; incomplete or ambiguous evidence cannot be relabelled as recovery. Command completion alone does not prove keyboard dismissal. Archive validation preserves those outcomes and binds available source text and fresh post-dismissal UI/viewport files.

New rejected/recovered window-state reads record their raw text, size and SHA-256 when available. A command failure can have no returned dump, and a genuinely empty returned text file is allowed only within the narrowly named diagnostic scope. Empty or malformed normal JSON/XML/APK evidence remains rejected. A later post-cleanup dump is separate noncausal evidence, not a reconstruction of an earlier rejected observation.

The [first API 36 attempt](../../artifacts/android-emulator-0.2.3-api36-attempt-01/validation.json) retains three passed cases and a guarded failure in case four. Its original invalid window-state dump was unavailable; the cause remains unknown. Its separately reviewed recovery code and subsequent rerun do not relabel that result. Retain actual recovery attempts and any new failures in the later archive as well.

The [second API 36 attempt](../../artifacts/android-emulator-0.2.3-api36-attempt-02/validation.json) also retains three passes and a failure in case four; its [149-file archive](../../artifacts/android-emulator-0.2.3-api36-attempt-02/archive-index.json) binds six rejected display reads. Each reports inspector focus and the same visible, zero-height current IME frame `[0,1920][1080,1920]`. This identifies the recorded guard trigger without establishing actual keyboard touchable geometry or its underlying cause. The [investigation](android-api36-ime-investigation-2026-10-07.md) explains the missing evidence and later capture boundaries. The [third reproduction](android-emulator-0.2.3-api36-attempt-03-validation.json) also stopped with three passes and the same guard failure; its [167-file archive](../../artifacts/android-emulator-0.2.3-api36-attempt-03/archive-index.json) preserves six complete diagnostic sequences before cleanup.

The [fourth attempt](android-emulator-0.2.3-api36-attempt-04-validation.json) ended at **09:55:04.009 UTC** with three passes and a hidden-keyboard guard failure in case four. Its [155-file archive](../../artifacts/android-emulator-0.2.3-api36-attempt-04/archive-index.json) preserves the actual single Back and seven-source recovery sequence. An early full-window read retained shown/on-screen surface flags although manager/service state reported hidden input; a later display read had hidden IME and valid strict geometry. The affected app assertion was not reached. Sequential reads do not establish the underlying cause, and no post-cleanup observation substitutes for the failure-time sources.

The fifth runtime run used frozen harness SHA-256 `ddeb90d82704fcc570c7d6abeeb1716f3f1ac8453946a6a931523e6649997ca7` and archive helper `ef0694b46b552e899ce342a4c4f0a1d27030cf35f7079cb65bc902a17aef2716`. Its [versioned report](android-emulator-0.2.3-api36-validation.json) and identical [frozen archive report](../../artifacts/android-emulator-0.2.3-api36-final/validation.json) record **ten passes and zero failures**, from **10:13:41.938 to 11:06:23.873 UTC** (**52 minutes 41.935 seconds**). The [857-file index](../../artifacts/android-emulator-0.2.3-api36-final/archive-index.json) binds the original report/harness, startup/native/image identities, exact APKs and runtime UI/diagnostics. Eighteen launch records include one actual recovered launch with one Back and seventeen `not_required` outcomes. The generic strict parser, ten workflow bodies, native sources and APKs remained unchanged; all four earlier failures remain failures.

The [exact API 36 timing analysis](../../artifacts/android-timing-analysis/run-0705fbf4-f8c4-4f57-8f5d-724e2fa16c51/summary.json) contains two numerical unverified samples, zero partial and zero unknown samples. Neither sample discarded intervals. These are comparisons with manually entered owned-fixture values, with no accuracy threshold:

| Scenario | Retained inferred sum (ms) | Entered fixture duration (ms) | Signed difference (ms) |
| --- | --- | --- | --- |
| Idle | 57,464 | 57,465 | −1 |
| Screen handoffs | 49,263 | 48,841 | +422 |

[Separate current-native replay](../../artifacts/android-timing-analysis/run-0705fbf4-f8c4-4f57-8f5d-724e2fa16c51/native-replay-247052f4-f5d7-429f-bad1-85067ef64854/validation.json) passed both captured traces and four invalid-input rejections, using synthetic consent/query/paired host clocks around exact source epochs. The wall-only query cursor remains separate from the actual report wall/elapsed pair; query-cursor elapsed and original OS batch clocks remain unavailable. Report timezone/offset attest formatting context only. File hashes bind local evidence without authenticating the platform report or manual fixture values.

The same owned API 36 guest completed a separate 0.2.4 run and was then closed with verified launcher/QEMU exit and an empty crash buffer. Its [native audit](android-local-inspector-0.2.4-validation.json), generated at **11:10:05.321123 UTC**, passed 33 collector/comparison and 25 fixture checks plus sixteen coordinator/core and eight separate exact-Application host-substitute checks. Both APKs have zero lint errors/warnings; 56 source bindings show no drift. The inspector is **130,460 bytes**, SHA-256 `df5ae7d7aad1c53818d9ce9812f49a3213c8b02e47caf2f2807f7abc130e6d6c`; the fixture hash remains `28ea22850e7224a5a959c9d614af07f0b76674655db51b96bc0d94ee79e04b46`. The native record's false runtime/SQLite flags retain its build/host-only scope.

The [installation preflight/correction record](../../artifacts/android-read-coordinator-integration/run-0b2e9ece-fb2f-4bef-8007-fa34a26b7177/preflight-install-correction.json) preserves an installed-version rejection before any case or new runtime report, followed by explicit installation of the audited 0.2.4 APK on the verified owned guest. That rejection is not an app assertion failure and overwrote no earlier evidence. The actual [API 36 run](android-emulator-0.2.4-api36-validation.json) passed ten workflows with both installed hashes verified, from **11:14:41.839 to 12:11:58.331 UTC**. The [0.2.4 review](android-local-development-0.2.4.md) retains its 867-file archive, exact timing analysis/native replay and cleanup supplements. The same exact bytes passed [all ten API 35 workflows](android-emulator-0.2.4-api35-validation.json), from 12:19:45.227 to 13:08:47.125 UTC, preserved in an 833-file archive. Both images also passed separate [framework recreation checks](android-lifecycle-recreation-2026-10-07.md) with bounded synthetic work after their ordinary gates were frozen. Both owned guests were closed with empty crash buffers and verified process exits. The [inert reader draft](../../artifacts/android-local-development-0.2.4-doc-draft/run-1ed033e4-4117-4d26-90b6-a4b64448d8cb/android-local-development-0.2.4-draft.md) remains historical preparation. Host modeled replacement authorities and Android/source/store substitutes establish no real Activity lifecycle, Looper, SQLite or garbage-collection result. Any changed APK needs its own completed emulator evidence; the 0.2.3 passes apply only to their recorded bytes.

After a full passing report is preserved, use the [exact timing analysis guide](android-timing-analysis-guide.md) for fixture-only numeric source/UI binding and separate audited native replay. Workflow passes, partial/unknown estimates and timing differences remain distinct. No host check or emulator workflow establishes phone/OEM behavior, production timing accuracy, source completeness, background/battery quality, OAP eligibility or M2/M3 completion. Agent integration and Linux remain deferred; no hosted delivery service is introduced.
