# Android 0.7.0: adaptive sending and app pages

Date: **2026-10-12**. Implements the user's timing and UI request under [ADR-0019](../decisions/0019-adaptive-android-delivery.md).

## Result

Automatic sends target **5 minutes** when new selected-app activity is available, and pause all automatic network requests after **15 minutes** with the screen off. Both settings accept 1–1440 minutes. Empty observations are skipped; eligible pending requests retain their original bytes and retry when the phone wakes. Local idle checks do not send events. Manual **Send now** and **Stop sharing** remain available.

The app uses native persisted one-off jobs rather than a fifteen-minute periodic job. Screen timing stays on the phone, with usage-source recovery when the process missed a screen broadcast. Jobs carry their sharing stream and schedule revision. Timing changes and older-state migration retain the queue, stream and outage timer. The receiver-down warning remains configurable, with a 60-minute default and no new outage from a quiet/empty scan.

The native UI has **Activity**, **Setup** and **Settings** pages. Activity shows status and the actions applicable to the current sharing state. Setup holds app selection, import/paste, Wi-Fi/USB help and explicit manual connection editing. Settings groups sending, screen-off and warning intervals. The secure-window flag and protected key storage remain enabled. [Phone guide](../../android/publisher-app/README.md).

## Verification

The exact [0.7.0 APK](../../artifacts/android-publisher/liveabit-sender-0.7.0-poc.apk), **233,764 bytes**, SHA-256 `b8da6fa77f57afdd5d144ec89132a1ccc34ceff0c8f4806457478fd53703f6d0`, passed **all 50 native Android checks** on the owned Android 15/API 35 emulator. [Complete report](../../artifacts/android-publisher/run-c173c804-525c-4461-a5e6-be935fa30d45/validation.json). The installed APK was hash-matched to the candidate. [Build/lint](../../artifacts/android-publisher-build-0.7.0-final.txt) passed with zero errors and ten warnings. [Source/evidence bindings](android-adaptive-2026-10-12.json).

Ten new timing checks exercise actual screen power, a real one-minute off cutoff, Android screen-history recovery, HTTP request counts while paused, wake-up delivery of identical bytes, empty-observation suppression, fresh selected-app activity through actual jobs, preference migration/validation and cancellation of both job slots. Three new UI checks exercise page visibility, protected key placement, native settings save without clearing pending data, and activity recreation. The retained checks cover collection, OAP/canonical bytes, real receiver acknowledgements/refusals, durable retry, notifications, setup import/switching and OpenClaw routing.

The final live check returned OpenClaw run ID `3470a86d-a69c-45f4-b956-2883340174b7`. That proves admission, not a new model response or phone nudge. No model/goal settings were authored. The owned native views were rendered and inspected: [Activity](../../artifacts/android-publisher/run-c173c804-525c-4461-a5e6-be935fa30d45/activity-screen.png), [Setup](../../artifacts/android-publisher/run-c173c804-525c-4461-a5e6-be935fa30d45/setup-screen.png), [Settings](../../artifacts/android-publisher/run-c173c804-525c-4461-a5e6-be935fa30d45/settings-screen.png). These contain owned fixtures, with the production secure-window flag retained.

Earlier incomplete reports remain private. One harness assumed both alternating job slots existed; it now checks the current scheduled slot. Another selected the non-actionable Downloads toolbar label instead of the file-provider row; it now re-queries exact clickable matches. A run passed 49 checks but could not reach OpenClaw: the managed gateway was `not-started`. Starting that existing service restored the same listening port without a model configuration change. The final complete suite then passed. These were not claimed as successful full runs.

## Scope

The one-minute real-time cutoff exercises the configurable rule; the 15-minute default is checked without a fifteen-minute wait. Job dispatch was force-triggered to test the actual service and HTTP behavior. Android can delay background work, so five minutes is a target rather than an exact alarm guarantee. Precise durations, complete coverage, battery behavior and physical/OEM timing remain unproven or deferred. OAP payload/transport and agent-owned goals/model choices are unchanged. No intermediary, foreground service, exact alarm or new permission was added.

The isolated test receiver and owned emulator were stopped after verification. OpenClaw was left running. The user's receiver and devices were not controlled. [Receiver cleanup](../../artifacts/android-publisher/run-c173c804-525c-4461-a5e6-be935fa30d45/receiver-cleanup.json), [emulator cleanup](../../artifacts/android-publisher/run-c173c804-525c-4461-a5e6-be935fa30d45/emulator-cleanup.json). Earlier 0.6.0 and phone-notification evidence remain frozen and separate.
