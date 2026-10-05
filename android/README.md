# liveabit local inspection

The first Android collector is a local diagnostic app. It lets you choose apps, begin a separate inspection session, use those apps, then inspect their permitted transitions. Agent selection is deferred under [ADR-0009](../docs/decisions/0009-android-local-inspection-first.md). See the [local specification](../specs/android/local-inspector.md) and [measurement plan](../docs/android-feasibility-plan.md).

The app has no Internet permission, agent connection, export, background collector or enforcement capability. Observed activity stays in process memory. Only selection/control settings use private no-backup storage. Stop, a fresh Start, selection changes, authority failure and process restart clear activity. Android's own usage history is outside this app's deletion control.

## First device trial

Use your **Android 15/API 35 or later** phone. The [development APK](../artifacts/android-local-inspector/liveabit-local-inspector-0.1.0.apk) is ready; see its [build review](../docs/review/android-local-inspector.md) and [audit evidence](../docs/review/android-local-inspector-validation.json). An APK build does not prove device behavior. It uses a local development signature and is not a production or Play release.

1. Copy the APK to your phone, open it in the phone's file manager and follow the installation prompts. Any installation permission is a visible device choice; the app cannot grant it itself.
2. Open **liveabit Local**. Its screen is titled **Local inspection**. Add a deliberately selected test app with **Add app**, or enter its exact app identifier if the system chooser is unavailable. The inspector supports up to 32 selected packages and does not scan installed apps.
3. Tap **Open usage access settings** and enable the Android grant for this app. Android's grant is broader than this app's exact filters. Returning to the inspector does not start a session.
4. Tap **Start local session**. Use a selected app for a known short interval, return, and tap **Inspect now**. The inspector makes a manual read only while visible; a ready session does not schedule background collection.
5. Inspect the permitted transition times and inferred duration estimates. Initial state and source completeness stay unknown. Empty results do not establish zero use; overlapping apps are not exclusive screen time. Estimates are not validated OAP summaries.
6. Tap **Stop and clear observations**. Confirm the display clears and Inspect becomes unavailable. **Clear local data and selection** also deletes saved app preferences. Reopening after a process restart must show Stopped and require a new Start.

Also test denied/revoked usage access, quick revoke/regrant, empty scope, scope changes, ordinary app switching, process kill/reopen, clock changes and known missing/unavailable observations. Save only deliberately consented fixture results. Do not paste private activity into build logs or chat. A system picker, OEM permission notifications, lock behavior and source accuracy remain actual-device questions.

## Build and checks on Windows

Pinned tools: Temurin JDK 17.0.20.1+1, Gradle 9.4.1, AGP 9.2.1, Android platform **37.0 revision 2**, Build Tools 36.0.0. The app's minimum SDK is 35 and target SDK is 37. It uses Java and platform UI/storage with no third-party runtime library.

Portable tools, caches, the development signing key and build artifacts stay under this project. Google SDK download/use requires explicit acceptance; the user accepted its terms on 2026-10-05. The setup command still requires an explicit flag and displays only the selected packages' license prompts. No generated acceptance files or unrelated package terms are substituted.

```powershell
.\scripts\setup-android-tools.ps1 -Stage Jvm
.\scripts\test-android-core.ps1
# Only after accepting Google's SDK terms:
.\scripts\setup-android-tools.ps1 -Stage Sdk -AndroidSdkTermsAccepted
.\scripts\verify-android.ps1
```

The verification command runs the JVM fixtures, builds and lints the APK, checks its actual permission/API/signature surface and source hashes, then copies the audited package to the artifact location above. Every verification runs the native build; an existing APK is not treated as proof of changed source. Download or JVM failures caused by environment restrictions must be resolved using the environment's normal permissions, not by bypassing them.

No emulator, physical-device install, runtime UI trial, battery trial or agent delivery is implied by these checks. Production Android publication and M3 still require actual measurements, approved quality thresholds and a functioning compliant direct M2 path.

Primary build references: [AGP 9.2 compatibility](https://developer.android.com/build/releases/agp-9-2-0-release-notes), [Java-only configuration](https://developer.android.com/build/migrate-to-built-in-kotlin), [SDK package manager](https://developer.android.com/tools/sdkmanager), [Gradle checksums](https://gradle.org/release-checksums/), [Temurin release assets](https://github.com/adoptium/temurin17-binaries/releases/expanded_assets/jdk-17.0.20.1%2B1).
