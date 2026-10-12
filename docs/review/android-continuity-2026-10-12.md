# Android 0.8.0: uninterrupted selected-app use

Date: **2026-10-12**. Implements [ADR-0020](../decisions/0020-android-foreground-continuity.md) directly in Android.

## Result

An observed app session can now continue into later send windows without another resume/pause event. Each observation estimates only time inside its own window; transition counts include only new source records. A real fixture remained foreground across two collection calls: its second request had positive estimated duration, zero new transitions, a new event ID and the next sequence. A new engine reopened the actual persisted state for that second call. After the actual pause, the next empty call sent no request.

Small private context is committed with the scan cursor and queue, bounded to selected apps and 24 hours. Stop clears it. Gaps, boot/clock discontinuities, collection failure and screen boundaries invalidate or close inference. Android screen-off timestamps stay local and can end an inferred interval after a missed broadcast. Durations still have unknown coverage and unverified quality; this advances useful continuous delivery without claiming precise measurement.

New requests declare [OAP 0.2.0-draft.2](../../specs/protocol/activity-observation-draft-2.md). The final receiver accepts positive estimates with zero transitions for this revision. Actual Android-to-receiver checks also confirmed that draft 1 still requires two transitions for a positive duration and accepts valid older records. Earlier schemas, queued bodies, OAP 0.1.0 and local-inspector sources remain unchanged. The installed OpenClaw liveabit Skill recognizes both drafts; the OpenClaw configuration and private delivery-policy/state hashes stayed unchanged during installation. No model, reasoning, goal, recipient or transport setup was chosen or replaced.

## Verification

- Exact production APK: [liveabit Sender 0.8.0](../../artifacts/android-publisher/liveabit-sender-0.8.0-poc.apk), **244,172 bytes**, SHA-256 `10d7610980b861ebbd12d7f90f1fc4bdee965f27efdf2cf230fed9fbfa02f175`.
- [Build and lint](../../artifacts/android-publisher-build-0.8.0-final.txt): success, **0 errors / 10 warnings**. Pinned JDK 17.0.20.1+1, Gradle 9.4.1, Android SDK compile 37.
- [Native run](../../artifacts/android-publisher/run-382ff97d-b091-41cb-a9cc-7024aee21f03/validation.json): **63 checks passed** on the owned Android 15/API 35 emulator. The installed APK was pulled and its hash matched the production APK.
- Eleven added native continuity checks cover window clipping, closure/idle, unknown input, internal activity overlap, same-time ambiguity, screen boundaries, gaps/boot/clock/age, scope redaction, real open use, AtomicFile reopening and Stop. Two added actual final-receiver checks cover the revised and older draft semantics. All previous 50 checks passed, including real screen power, actual JobScheduler requests, receiver warning, queue recovery, setup/UI and OpenClaw contract checks.
- The installed OpenClaw gateway admitted the final Android request with run ID `fba9b9b0-0431-4a6f-b09b-b776c7b544dc`. This establishes run admission only; no new model response or selective WhatsApp coaching claim is made.
- [Structured record](android-continuity-2026-10-12.json) binds source hashes with CRLF normalized to LF. Baseline specification validation is retained separately; the live receiver compiled both observation schemas and exercised their semantics.

The real uninterrupted fixture trials use short windows and the actual automatic engine entry point; they do not wait five minutes or establish process-kill continuity. The unchanged background-job workflows are exercised separately. Synthetic clock/boot/gap/age cases run against production estimator code inside the installed Android APK. The one-minute screen cutoff and outage settings exercise real elapsed time; defaults are checked without waiting fifteen minutes or an hour. Physical/OEM background timing, battery, complete coverage and precision remain unproved or deferred.

The isolated test receiver and owned emulator were stopped. OpenClaw remains running. The user's receiver and phone were not controlled. [Receiver cleanup](../../artifacts/android-publisher/run-382ff97d-b091-41cb-a9cc-7024aee21f03/receiver-cleanup.json), [emulator cleanup](../../artifacts/android-publisher/run-382ff97d-b091-41cb-a9cc-7024aee21f03/emulator-cleanup.json). No relay, foreground service, exact alarm, new runtime permission or dependency was added.

## Next steps

Development can continue independently. The exact APK has met the emulator gate and is ready for an optional phone update using the existing connection. Restart the independent display receiver from updated source if using that route. No new approval, pairing or private goal input is needed for local development; an actual goal-grounded coaching trial needs goals supplied directly to OpenClaw and separate phone observations.
