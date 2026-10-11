# ADR-0015: Build the Android sender directly with a display receiver

Date: **2026-10-09**. Status: **accepted by the user's explicit instruction**.

The user wants faster progress toward the working Android product, with implementation and failure testing on the eventual target platform. Stop creating JavaScript reference implementations of sender features before implementing them in Android. Explain how each development step advances the app before starting it. Keep earlier research and evidence as historical work; it is not a prerequisite for new Android development.

Build `android/publisher-app` as a separate native Android app using the accepted collector core. Its test connection sends selected-app activity directly to a final desktop receiver that saves and displays it. This receiver is not an intermediary: it forwards nothing and requires no hosting, paid service or account. Grok remains the later agent target, but its account availability does not block Android transport development.

The app keeps unacknowledged events in bounded private on-device storage and retries their unchanged bytes and identity. It shows an Android notification when acknowledgements have been absent for a continuous configured interval, default **60 minutes**, editable **1–1440 minutes**. A matching acknowledgement clears the warning. Stop disables scheduled sending and clears pending activity. Notification permission and Android background scheduling determine when a warning can actually appear; do not promise an exact alarm time.

The accepted inspector 0.2.4 remains unchanged. The new sender is explicitly a test build with Internet permission, user-enabled sharing and background scheduling. Unknown coverage and unverified duration estimates remain visible. Its development envelope `liveabit.test.activity.v1` carries those nullable estimates without claiming conformance to the existing OAP summary grammar, which cannot represent entirely unknown coverage. Native Grok profile and final OAP mapping can follow this functioning Android path; no fake provider receipt is added.

Use the current Android SDK/build tools and actual emulator tests. Every APK proposed for a phone trial still needs testing of its exact installed bytes on the emulator first. Further duration/coverage proof and Linux remain deferred. No production Grok, M2 or measured M3 claim follows from a test receiver.

See the [sender specification](../../specs/android/test-publisher.md) and [connection guide](../../android/publisher-app/README.md).
