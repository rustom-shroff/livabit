# Android sender 0.3.1 development review

Date: **2026-10-09**. Native Android development under [ADR-0015](../decisions/0015-android-first-test-receiver.md), extending the [0.3.0 baseline](android-sender-0.3.0-2026-10-09.md). No JavaScript sender prototype or provider account was used.

## What this advances

The sender is easier to connect and recover on a phone. The receiver exports a single setup file or copied setup; Android imports the address, key and warning interval together. Import fills fields without starting sharing or replacing an active session. Manual setup remains available. The receiver offers USB and emulator choices by default, with private Wi-Fi addresses when explicitly started on the LAN.

Reopening an enabled sender restores missing background delivery and outage jobs, preserving the stream, pending bytes and failure timer. Connection status now distinguishes an unreachable receiver, a refused key, receiver unavailability/rejection and an incorrect acknowledgement. Warning status includes notification permission and channel state, with a route to Android settings when disabled.

## Verified result

The exact [0.3.1 APK](../../artifacts/android-publisher/liveabit-sender-0.3.1-test.apk), SHA-256 `e0fc129ee27190776267227d93609e8f6eeb32f1ed02431bb4f82640259379ca`, passed **18 real Android checks** on the owned Android 15/API 35 emulator against the actual final display receiver. [Run report](../../artifacts/android-publisher/run-abdc1916-abd4-4d8e-8656-552ce69a06dc/validation.json), [native checks](../../artifacts/android-publisher/run-abdc1916-abd4-4d8e-8656-552ce69a06dc/native-tests.txt), [document picker](../../artifacts/android-publisher/run-abdc1916-abd4-4d8e-8656-552ce69a06dc/file-import.txt), [source bindings](android-sender-0.3.1-2026-10-09.json).

Checks cover selected-app OS observations, actual HTTP delivery, matching/incorrect acknowledgements, immutable retained bytes, deduplication, recovery and Stop. Added checks cover receiver setup validation, native clipboard paste without automatic sharing, actual document selection and import, real bad-key/unreachable responses, disabled notification permission, and force-stop/reopen with retained activity and restored jobs. The warning used an actual **one-minute** user setting and Android notification; the default **60 minutes** was checked without waiting an hour.

Build and Android lint completed with **zero errors and seven English UI localization warnings**. [Build log](../../artifacts/android-publisher-build-0.3.1.txt). The accepted inspector APK and collector remain unchanged. Earlier 0.3.0 artifacts/reviews are retained.

The receiver's new setup endpoint returned 401 without a key and exported matching setup only after authentication. Its loopback configuration offered no Wi-Fi connection. [Receiver check](../../artifacts/android-publisher/receiver-setup-validation-0.3.1.json). The dashboard visibly displayed fresh Android events and copied emulator setup successfully. [Dashboard preview](../../artifacts/android-publisher/receiver-dashboard-0.3.1.png). The download action was observed, but the in-app browser supplied no completed download path; generated setup files were separately consumed through Android's real document picker.

Earlier emulator attempts exposed test-fixture problems: replacing an escaped JSON URL did not construct invalid input; direct test delivery raced already-dispatched jobs; checking only the newest window missed transitions already delivered in the first window; filename matching selected the document preview icon. Tests now use structured invalid JSON, the app's serial worker, current-stream observations and exact document labels. The sender APK bytes remained the same throughout these test corrections. Failed reports remain under ignored local artifacts.

## Limits and next steps

This is a final local test consumer, with no forwarding or intermediary infrastructure. Physical-phone behavior, precise usage duration, source coverage, background battery timing and actual Grok integration remain unproven. JobScheduler sends were force-triggered; warnings can be delayed by Android scheduling. Test events retain unknown coverage and unverified estimates in the development envelope, without claiming final OAP wire conformance.

Native development can continue independently. No approval, subscription or phone test is required to keep building. An optional phone trial can use this exact emulator-validated APK and the [setup guide](../../android/publisher-app/README.md). Actual Grok testing later needs supported account/webhook access.
