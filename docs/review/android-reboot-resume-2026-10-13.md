# Android sharing restart review

Date: **2026-10-13**. Release **0.10.0-poc**, version code **12**. [Machine-readable evidence](android-reboot-resume-2026-10-13.json), [ADR-0022](../decisions/0022-android-sharing-restart.md).

The exact APK passed **87 native Android 15/API 35 checks**, including **two actual emulator reboots**. Its SHA-256 is `577b0a5cb5274c12038dab5b4bb7a222284928a40c4214d83863e3d19b862fb1`; size **268,532 bytes**. Build and lint completed with zero errors. The suite installed and verified those APK bytes, exercised the final isolated receiver, and confirmed admission by the existing dedicated OpenClaw gateway.

Before the enabled-state reboot, the native test saved a real meaningful pending observation, encrypted connection, selected app, sharing stream and custom 3/17/73-minute timing settings. It removed every sender job, including persisted jobs. After reboot, the harness checked storage and restored automatic/outage jobs **without opening liveabit or running instrumentation**. Configuration, cursor, sequence, pending event identities and original bodies, and outage timestamps survived. A real Android job then delivered the original packet and received the matching identity/body-digest acknowledgement using the saved encrypted key.

After Stop sharing, a second real reboot preserved the disabled state and setup. No automatic/outage job remained and the receiver received no new packet. Boot counters advanced for both reboots. The manifest StartupReceiver restores existing scheduling after boot/unlock or an app update; its callback creates no OAP observation or HTTP request. Disabled restoration also cancels obsolete jobs. The existing atomic saved enabled flag remains authoritative, and the feature adds no service, dependency, permission or relay. Settings explains the remembered choice.

The first full attempt reached the new reboot fixture but failed because its `Files.writeString` call is unavailable on Android 15. Fixture backup save and restore now use supported native file streams. That attempt and its failure are preserved separately; it performed no real reboot. The final complete 87-check pass includes the existing meaningful-activity suppression, adaptive scheduling, continuity, UI, connection checks, retry and warning behavior. Historical [0.9.0 evidence](openclaw-task-aware-2026-10-13.md) is unchanged.

The test receiver and owned emulator were stopped; the user's receiver, OpenClaw settings, models and WhatsApp connection were not reconfigured. OAP schemas and the agent destination are unchanged. Setup, timing preferences and sharing choice remain when installing this version over an existing app with the same signature. The native backup used only synthetic emulator data and was removed after restoring the original test setup.

Normal startup restoration occurs after the first unlock, preserving credential-protected storage. See [Android's boot broadcast contract](https://developer.android.com/reference/android/content/Intent#ACTION_BOOT_COMPLETED) and [persisted jobs](https://developer.android.com/reference/android/app/job/JobInfo.Builder#setPersisted(boolean)). Tests used an emulator without a PIN and force-triggered the delivery job after restoration; exact job timing, manufacturer background policies, physical-phone behavior, precise duration, complete coverage and battery performance remain unproved. Android Force stop remains a separate intentional stopped state until user interaction.

## Next steps

Install the tested 0.10.0 APK over the existing app. Keep a correct saved connection; no reimport or repeated Start is required for this feature. Development can continue independently without approval or a required phone test.
