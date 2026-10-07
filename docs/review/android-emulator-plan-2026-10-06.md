# Emulator validation before phone trials

Date: **2026-10-06**. Status: **complete revised suite passed ten cases, with zero failures, on Android 15/API 35**. The user explicitly requires emulator testing of both delivered APKs before another personal phone trial. The [frozen complete rerun](android-emulator-0.2.2-rerun-validation.json) verifies exact audited inspector 0.2.2 and fixture 0.1.0 bytes and meets that gate for a personal local diagnostic trial. It does not establish phone/OEM accuracy, other Android versions or production readiness. This supersedes the phone-first trial sequence in earlier local build reviews; earlier incomplete APK/runtime outcomes and qualitative phone feedback remain historical evidence with their original limits.

Test the exact audited inspector **0.2.2-local (version code 4)** and lifecycle fixture **0.1.0** packages from the completed [frozen native build manifest](android-local-inspector-0.2.2-validation.json). Inspector SHA-256 is `87fb356e1619f64a9b9ac418da455b0055d05c454a18a452d9d901044797cf40` (116284 bytes); the fixture remains `28ea22850e7224a5a959c9d614af07f0b76674655db51b96bc0d94ee79e04b46` (66627 bytes). The [historical 0.2.0 review](android-emulator-0.2.0.md), [versioned runtime output](android-emulator-0.2.0-validation.json) and [archived harness source](../../artifacts/android-emulator-0.2.0-test/attempts/04-harness-source.mjs) preserve six recorded passes, the subsequent input-navigation automation failure and a partial handoff estimate. Later 0.2.1 attempts are preserved in the [human runtime review](android-emulator-2026-10-06.md). They do not establish a complete pass or validate the new APK. Use a dedicated project-local AOSP Android 15/API 35 x86_64 emulator with no personal account/data. Target only the owned `liveabit-api35-test` AVD on `emulator-5580`; never install, grant permissions or issue device actions on a physical phone. A successful build or unit fixture does not substitute for this runtime exercise.

Attempt 7 [raw evidence](../../artifacts/android-emulator-attempt7-test/validation.json) and its [archive index](../../artifacts/android-emulator-attempt7-test/archive-index.json) record eight passing cases before a stale permission-label failure in case nine. The session was stopped and observations were empty while AppOps was allowed, but the visible label had not refreshed. The 0.2.2 source patch notifies the observer on a handled usage-access change even when inspection is inactive; collection, reconstruction and active-session invalidation remain unchanged. Do not transfer historical pass counts to the new build's phone-testing gate. The historical harness hash was `94a03c46dd219ab12e260ef64aa368e921eb27a246a97c271d82c937db0076e5`; its source remains frozen with the archived attempts. The current harness changes the overall budget and adds a bounded budget option without changing app assertions. Attempt 6's numerical partial-estimate warning was observed only on 0.2.1; attempt 7's numerical comparisons had no discard trigger.

The [focused 0.2.2 permission-display smoke](android-permission-refresh-0.2.2-validation.json) passed four inactive-session label changes without Start/Inspect actions. Its original offscreen Inspect assertion failed and remains [archived](../../artifacts/android-permission-refresh-0.2.2-test/initial-smoke-validation.json); the final narrow scope verifies visible permission labels and Stopped state only. The full-suite Inspect-disabled assertion is unchanged.

The earlier 0.2.2 run initialized at **2026-10-06T22:15:10.030Z**, verified both exact installed byte hashes, and ended at **2026-10-06T22:22:25.648Z** after the user's requested wrap-up and owned emulator shutdown. Fresh launch/denial and stock Settings grant versus session consent passed. The picker case was interrupted when ADB lost the deliberately closed emulator; seven later workflows were not run. The [versioned annotated result](android-emulator-0.2.2-validation.json) preserves that distinction beside the [raw harness report](../../artifacts/android-emulator-0.2.2-test/raw-validation.json). That historical run produced no controlled timing measurements or captured crash-buffer evidence, and its launcher and QEMU processes were verified absent after cleanup.

The user's later [rerun](android-emulator-user-run-2026-10-06-validation.json) initialized at **2026-10-07T03:19:49.963Z** and ended at **2026-10-07T04:04:51.724Z**—October 6, approximately **8:19–9:04 p.m. Pacific**. It verified the same installed APK hashes and passed startup/denial, Settings grant, scope/picker, no pre-consent backfill, idle comparison, screen-handoff comparison and comparison validation/input erasure. Case eight, Stop/fresh horizon/restart, failed because the **global 45-minute budget expired**; the report contains no app assertion failure for that case. Revocation/rapid regrant and Clear selection/fixture data were not reached. Idle and handoff differences were unverified comparison observations, not production accuracy passes. The [raw report](../../artifacts/android-emulator-user-run-2026-10-06/raw-validation.json), [original harness](../../artifacts/android-emulator-user-run-2026-10-06/harness-source.mjs) and [archive index](../../artifacts/android-emulator-user-run-2026-10-06/archive-index.json) preserve this attempt without transferring passes to the next run.

The authorized revised suite initialized at **2026-10-07T05:29:59.339Z** and finished at **2026-10-07T06:09:21.611Z**—October 6, approximately **10:29–11:09 p.m. Pacific**, taking **39 minutes 22 seconds** under its 90-minute budget. All ten workflows passed, including the previously unproven Stop/restart case and the two previously unexecuted revocation/Clear cases. The harness verified six actual Home departures and returns, a stock Settings grant without AppOps fallback, and a positive system-picker selection; picker cancellation and unknown comparison UI were not exercised. The idle comparison was 55,051 ms entered and retained (difference 0); the handoff comparison was 47,064 ms entered and 3,203 ms retained (difference −43,861). The latter is explicitly partial because ambiguous events discarded estimates; warnings and reasons were verified in both the main summary and comparison. Workflow success does not certify timing accuracy or completeness. The [frozen result](android-emulator-0.2.2-rerun-validation.json) and [archive index](../../artifacts/android-emulator-0.2.2-rerun-test/archive-index.json) preserve exact run evidence. The [crash buffer](../../artifacts/android-emulator-0.2.2-rerun-test/crash-log.txt) was empty, so no owned-app crash was encountered in this scoped run; [cleanup](../../artifacts/android-emulator-0.2.2-rerun-test/cleanup.json) records the owned emulator closed and launcher/QEMU absent. No new APK build was needed.

## Setup and isolation

Google's stable repository metadata identifies emulator 37.2.12 and `system-images;android-35;default;x86_64` revision 2, both under the previously accepted `android-sdk-license`. Pin official archives/checksums and save installed package/environment provenance. Keep AVD content, caches and logs under `artifacts/`. Reuse existing hardware acceleration if available, with software graphics; otherwise try the documented slow software CPU fallback with a bounded boot deadline. Do not enable Windows features, install hypervisor drivers, change BIOS or reboot without separate authorization.

The initial SDK installer stalled. The [setup script](../../scripts/setup-android-emulator.ps1) downloaded/reused the same official pinned archives, verified their byte counts and published SHA1 checksums, added local SHA256 hashes and extracted them into the project SDK. The [setup report](android-emulator-setup.json) records this direct extraction rather than claiming an SDK-manager installation. Existing license files were neither fabricated nor widened; their hash remained unchanged. No IDE, account or delivery service was introduced.

AVD creation initially saw no system image because the externally located `avdmanager` inferred its SDK from its own launcher path. Copying/verifying command-line tools 22.0 under `artifacts/android-sdk/cmdline-tools/22.0` corrected that discovery. The SDK legacy loader generated registration for the image, but the generic emulator archive needed a local `package.xml`. Setup derives that emulator registration from the exact official stable metadata only after checking version 37.2.12 and the reviewed archive URL/name, byte count and SHA1. Its provenance explicitly distinguishes manual metadata-derived emulator registration from SDK-generated image registration; it does not create an acceptance file.

The [startup script](../../scripts/start-android-emulator.ps1) then created the named AVD and launched it using usable existing WHPX and software graphics. Optional image `devices.xml` warnings did not prevent this AVD from being created and booted. The [startup record](../../artifacts/android-emulator/run.json), [acceleration output](../../artifacts/android-emulator/logs/acceleration.txt) and [preflight](../../artifacts/android-emulator/preflight.json) record the actual launch and observed API35/x86_64 boot. Preflight is a one-time host process observation, not continuous attestation or an app runtime pass.

## Reproduce setup and runtime checks

Run from the project root after preparing the existing pinned build tools and accepting the SDK terms. The emulator setup requires the existing `android-sdk-license` file. It neither accepts additional terms nor changes Windows settings.

```powershell
.\scripts\setup-android-emulator.ps1
.\scripts\start-android-emulator.ps1
```

Setup resumes partial official downloads with a bounded transfer, reuses verified complete archives and stages/verifies CLI files from the already pinned official archive. `-RegistrationOnly` can repair registration/stage CLI against an existing verified extraction without reextracting either large emulator/image archive. The installed-package listing must recognize both pinned packages before setup passes. Startup verifies the project-local AVD registration and available dedicated ports before resetting only that owned guest. It does not terminate an existing device on a busy port.

Wait for a completed boot with a finite deadline. For existing hardware acceleration, this example allows three minutes. Software CPU fallback is considerably slower; if attempted, use a separately stated finite deadline rather than an indefinite wait. ADB's `device` status alone is not a completed boot.

```powershell
$taskAdb = Join-Path (Get-Location) 'artifacts\android-sdk\platform-tools\adb.exe'
$taskDeadline = [DateTime]::UtcNow.AddMinutes(3)
$taskBooted = $false
while ([DateTime]::UtcNow -lt $taskDeadline) {
    $taskBoot = @(& $taskAdb -s emulator-5580 shell getprop sys.boot_completed 2>$null)
    if ($LASTEXITCODE -eq 0 -and ($taskBoot -join '').Trim() -eq '1') { $taskBooted = $true; break }
    Start-Sleep -Seconds 5
}
if (-not $taskBooted) { throw 'Owned emulator did not boot within the stated deadline; inspect its saved launch logs.' }
$taskAvd = @(& $taskAdb -s emulator-5580 emu avd name)
if ($LASTEXITCODE -ne 0 -or $taskAvd[0].Trim() -ne 'liveabit-api35-test') { throw 'Unexpected AVD; no APK installed.' }
if ((& $taskAdb -s emulator-5580 shell getprop ro.kernel.qemu).Trim() -ne '1') { throw 'Target is not an emulator.' }
if ((& $taskAdb -s emulator-5580 shell getprop ro.build.version.sdk).Trim() -ne '35') { throw 'Unexpected Android API.' }
```

Install the exact audited APKs, run the [owned UI harness](../../scripts/test-android-emulator.mjs) and clean up only the owned emulator:

```powershell
try {
    & $taskAdb -s emulator-5580 install -r .\artifacts\android-local-inspector\liveabit-local-inspector-0.2.2.apk
    if ($LASTEXITCODE -ne 0) { throw 'Inspector installation failed.' }
    & $taskAdb -s emulator-5580 install -r .\artifacts\android-local-inspector\liveabit-lifecycle-fixture-0.1.0.apk
    if ($LASTEXITCODE -ne 0) { throw 'Fixture installation failed.' }
    node .\scripts\test-android-emulator.mjs --serial emulator-5580 --expected-avd liveabit-api35-test --idle-ms 30000 --timeout-minutes 90
    if ($LASTEXITCODE -ne 0) { throw 'Runtime checks failed; use the saved case/failure evidence.' }
} finally {
    & $taskAdb -s emulator-5580 emu kill
}
```

These commands reproduce the completed revised suite and are available for another user-run suite. The harness rejects physical-device targets, binds the expected AVD/API to its fresh project startup record, checks account-free state and verifies installed package versions and APK byte hashes against the native manifest before app mutations. It now defaults to a **90-minute overall deadline** and accepts `--timeout-minutes` as an integer from 45 through 120. Each device command remains limited to 45 seconds and cleanup to 15 seconds. Ninety minutes is a maximum budget, not an expected duration or a completion guarantee; the recorded complete run took 39 minutes 22 seconds. App assertions and exact APKs are unchanged. It stops only the two owned apps; the final console command stops the test AVD. An already running dedicated emulator may be reused only with its fresh startup record and all harness guards passing; startup refuses occupied ports instead of terminating it. Do not issue an unscoped ADB install, reset, grant or `kill-server`, and do not delete unrelated AVDs. No recursive filesystem cleanup is required for a rerun.

The [latest runtime result](android-emulator-validation.json) records scoped cases and limitations and will be replaced by a subsequent run. The gate is supported by the stable [frozen complete result](android-emulator-0.2.2-rerun-validation.json), whose [archive index](../../artifacts/android-emulator-0.2.2-rerun-test/archive-index.json) lists 517 synthetic UI hierarchies and 517 matching viewport records. The [frozen user-run result](android-emulator-user-run-2026-10-06-validation.json) preserves the deadline attempt; its [index](../../artifacts/android-emulator-user-run-2026-10-06/archive-index.json) lists 445 hierarchies and 445 viewport records. The [human review](android-emulator-2026-10-06.md) separates the complete result from earlier attempts. The older [interrupted-run index](../../artifacts/android-emulator-0.2.2-test/archive-index.json) retains 77 hierarchies and 77 viewport records. A deadline expiry leaves the affected workflow unproven, while a user-requested interruption is not a product failure. Setup/boot alone, an AppOps fallback, a conservative unknown comparison or a partly completed run must not be relabelled as a complete runtime pass.

Primary setup references: [official emulator repository](https://dl.google.com/android/repository/repository2-3.xml), [AOSP image repository](https://dl.google.com/android/repository/sys-img/android/sys-img2-3.xml), [startup options](https://developer.android.com/studio/run/emulator-commandline), [acceleration](https://developer.android.com/studio/run/emulator-acceleration), [local paths](https://developer.android.com/tools/variables).

## Required runtime checks

Record actual API/ABI/build, acceleration, exact installed APK identity/hash, commands, safe synthetic outcomes and limitations. Exercise both visible screens and real Android usage-history reads:

- Fresh launch and stopped/empty initial state; record observed crashes and capture crash-buffer evidence before claiming an absence of crashes.
- Exact selection/fallback and picker where available; invalid/empty scope, permission denial, OS Settings grant and explicit Start. Grant alone must not start a session.
- Pre-consent exclusion and fixture-only results, empty/unknown output and conservative activity-level labels.
- Owned idle and internal-screen-switch trials, frozen fixture markers, retained closed intervals and same-window comparison. Check arithmetic independently; retain actual differences and unknown results without inventing a production accuracy threshold.
- Repeated manual reads, malformed/outside-session comparison inputs, screen hiding/input erasure and process restart.
- Stop/Clear, saved selection semantics, usage-access revocation and rapid revoke/regrant. Regrant must require fresh local consent rather than revive observations.
- Fixture reset and bounded-state behavior; clock changes and further lifecycle/limit cases only where actually exercised. Identify omitted cases instead of claiming universal runtime coverage.

UI hierarchy assertions are the primary visible evidence because both apps deliberately use secure windows that can obscure screenshots. Only synthetic owned-emulator snapshots may be saved. The development emulator/ADB processes are test tools, not activity delivery infrastructure. Shut down only the owned emulator after testing; do not stop unrelated devices or debugging servers.

The result must distinguish pass, fail and untested cases. Fix runtime defects and repeat affected scenarios before recommending another phone trial. API 35 emulator success cannot certify OEM permission behavior, later Android versions, battery/background quality, source completeness or M3. Agent choice and Linux remain deferred.
