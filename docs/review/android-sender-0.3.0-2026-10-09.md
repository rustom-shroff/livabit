# Android sender 0.3.0 and display receiver

Date: **2026-10-09**. The user's [Android-first instruction](../decisions/0015-android-first-test-receiver.md) is implemented: selected-app activity now travels from native Android code to an actual desktop test receiver and appears in its dashboard. The receiver is the final test consumer and forwards nothing. No JavaScript sender simulator, Grok account, purchase or hosted infrastructure was used.

## Working build

[liveabit Sender APK](../../artifacts/android-publisher/liveabit-sender-0.3.0-test.apk), version **0.3.0-test**, Android 15/API 35 minimum. SHA-256: `31bbc15c509735419e1832f5561d27d88c11ce6705cee1ccc601fdd759542124`. The installed emulator APK was pulled and checked against these exact candidate bytes.

The Android app includes app selection, explicit sharing controls, the accepted native collector, direct requests, a private bounded pending queue, retry with unchanged event bytes/identity, matching acknowledgements, last-acknowledgement status, and a receiver-outage notification. The alert interval defaults to **60 minutes** and can be changed to **1–1440 minutes**. The connection key is encrypted with Android Keystore; settings and pending activity are excluded from backup/device transfer. Stop disables sending, cancels jobs and clears unsent activity.

The [desktop receiver](../../tools/activity-receiver/server.mjs) saves activity before acknowledging, displays the latest 200 events and deduplicates matching retries. Its dashboard has normal acknowledgement, withheld acknowledgement and incorrect acknowledgement modes for direct Android tests. It is running locally and the authenticated dashboard was opened beside the chat. [Setup instructions](../../android/publisher-app/README.md) cover emulator, USB and local Wi-Fi connections.

## Actual Android checks

All **11 checks passed** on the owned Android 15/API 35 emulator. [Runtime report](../../artifacts/android-publisher/run-b7a893a6-94d3-4bf3-a28c-bde079a4cd54/validation.json), [native instrumentation output](../../artifacts/android-publisher/run-b7a893a6-94d3-4bf3-a28c-bde079a4cd54/native-tests.txt), [build/source record](android-sender-0.3.0-2026-10-09.json).

- Fresh-install warning default is one hour.
- Native connection setup and Android Keystore storage work.
- Actual Android lifecycle observations for the chosen fixture app reach the receiver; matching acknowledgement removes the pending event.
- An incorrect event acknowledgement leaves activity pending.
- Private storage retains pending bytes/identity; actual retries produce one displayed receiver copy.
- A user-selected one-minute interval triggers a real **Receiver is down** Android notification after real elapsed time.
- Correct recovery clears the pending event and outage notification.
- Stop clears pending activity and cancels scheduled jobs.
- The native connection screen opens.
- An actual force-triggered JobScheduler wake sends and receives acknowledgement.
- The rendered connection screen is visible in the emulator hierarchy.

The receiver dashboard was also inspected in the browser: it showed four received native Android events, normal acknowledgements enabled, selected fixture identity, transition counts and unknown estimates/coverage. The [captured receiver data](../../artifacts/android-publisher/run-b7a893a6-94d3-4bf3-a28c-bde079a4cd54/receiver-events.json) and [dashboard image](../../artifacts/android-publisher/receiver-dashboard.png) retain that display evidence. No personal phone activity was involved.

The build and Android lint checks passed. Lint reported **0 errors and 6 warnings** concerning English-only UI text localization. The existing inspector 0.2.4 APK remains unchanged (`df5ae7d7aad1c53818d9ce9812f49a3213c8b02e47caf2f2807f7abc130e6d6c`). No older JavaScript reference suite was run for this new sender.

## Fixes and limits

Initial build access was denied by the workspace sandbox; running the installed build tools with approved access succeeded. Two initial test setups attempted the fixture's private second Activity and failed before sender checks. That setup now uses only its public screen. The next native attempt began before the target Application initialized; waiting for Android's main-thread idle corrected the runner. These failed attempt folders remain recorded under `artifacts/android-publisher/`; the final 11-check report is the completed result.

The default one-hour value is checked; the actual notification delay is tested with the user-configurable one-minute setting rather than a one-hour development wait. Background scheduling is OS-managed and may be delayed by battery restrictions or Doze. Visible warnings require notification permission and an enabled channel. After force-stopping the app, use Start sharing again to schedule background delivery. [Android scheduling documentation](https://developer.android.com/reference/android/app/job/JobInfo.Builder#setMinimumLatency(long)), [notification permission documentation](https://developer.android.com/develop/ui/compose/notifications/notification-permission).

This test build uses a development event format that preserves nullable estimates and unknown coverage. It does not claim final OAP wire conformance, Grok receipt/evaluation, physical-phone timing, battery measurements or improved collector accuracy. Those remain separate work; they do not block this Android development path.

## Next steps

**I can continue native development independently. No approval or Grok subscription is needed.** The exact emulator-validated APK is ready for an optional phone trial against the test receiver. Use the short warning setting for a connection-failure trial. Further provider integration will reuse the Android path once supported Grok webhook access is available.
