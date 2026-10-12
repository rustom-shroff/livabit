# Android sender 0.3.2 development review

Date: **2026-10-09**. Native Android development under [ADR-0015](../decisions/0015-android-first-test-receiver.md), extending the [0.3.1 baseline](android-sender-0.3.1-2026-10-09.md).

## What this advances

The connection screen now has **Connect over Wi-Fi** and **Connect by USB** buttons with instructions inside the Android app. Wi-Fi instructions explain the receiver launch, shared network, dashboard setup and Windows private-network prompt. USB instructions include debugging authorization and the bundled adb reverse command. The status identifies the configured connection and address; this describes saved settings rather than proving network reachability.

Repeating **Start sharing** with the same receiver, key and selected apps keeps the existing stream, pending event bytes, collection cursor, last acknowledgement and outage timer. A warning-interval change also preserves that session. Changing receiver, key or selected apps asks before clearing unexpired pending events. **Cancel** retains the saved sharing setup; **Switch and clear** creates the new session. Setup import continues to fill fields without starting sharing.

The native test harness now launches its own copy of the actual desktop receiver on an ephemeral port, with separate data under the unique Android test run. It stops only that process in cleanup. It does not read the user's receiver key, change their acknowledgement modes or control their receiver on port 8765. All sender behavior remains implemented and exercised in Android.

## Verified result

The exact [0.3.2 APK](../../artifacts/android-publisher/liveabit-sender-0.3.2-test.apk), SHA-256 `077dd025fa08a69ad9232d4569ffa2cf67fda6ebad6785104defebe0ff246c6e`, passed **22 real Android checks** on the owned Android 15/API 35 emulator. The installed APK was pulled and matched against the candidate before testing. [Run report](../../artifacts/android-publisher/run-193fdb48-a0dc-4af0-9a56-88ce627c2470/validation.json), [native checks](../../artifacts/android-publisher/run-193fdb48-a0dc-4af0-9a56-88ce627c2470/native-tests.txt), [receiver cleanup](../../artifacts/android-publisher/run-193fdb48-a0dc-4af0-9a56-88ce627c2470/receiver-cleanup.json), [source bindings](android-sender-0.3.2-2026-10-09.json).

New checks cover rendered Wi-Fi/USB dialogs, connection descriptions, repeated configuration preserving pending bytes and the outage timer, and actual cancellation/confirmation of a changed setup. Existing checks cover selected-app OS observations, correct and incorrect acknowledgements, durable retry, receiver deduplication, real outage notification, recovery, Stop, native clipboard/document import, bad keys, unreachable receivers, force-stop/reopen, JobScheduler delivery and denied notification permission.

The outage warning used a real **one-minute** user setting. The default **60 minutes** was checked without waiting an hour. The full suite also ran successfully through **Windows PowerShell 5.1**. Its device helper captures adb progress output and checks the actual exit code, avoiding PowerShell 5.1 treating successful stderr progress as failure. The edited PowerShell scripts remain ASCII and passed the legacy parser. Android's uppercase accessibility button labels required a case-insensitive exact label match in the instrumentation; the document picker still uses an exact filename match.

Build and lint passed with **zero errors**. Nine warnings remain: seven English UI localization warnings and two spelling false positives for the `.ps1` extension in the instructions. [Build log](../../artifacts/android-publisher-build-0.3.2.txt). The accepted inspector APK remains unchanged, and earlier sender APKs/reviews are preserved. Failed test attempts remain in ignored local artifacts.

## Limits and next steps

The receiver is the final local test consumer and forwards nothing. No hosted bridge, JavaScript sender prototype, Grok account or subscription was introduced. Physical-phone behavior, exact durations, source coverage and background battery timing remain unproven. JobScheduler delivery was force-triggered; Android can delay background sends and warnings. The development envelope remains `liveabit.test.activity.v1`, without claiming final OAP wire conformance or Grok execution.

Native development can continue independently. No approval, purchase or phone test is required to keep building. An optional phone trial can use this exact emulator-validated APK and the [connection guide](../../android/publisher-app/README.md). Actual Grok testing later requires supported account/webhook access.
