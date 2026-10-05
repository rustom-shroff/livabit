# Android local inspector build review

Date: **2026-10-05**. Status: **APK built and audited; phone trial pending**. The [local-inspection-first decision](../decisions/0009-android-local-inspection-first.md) governs this work. The user accepted Google's SDK terms and identified their Android 15+ phone as the first trial environment. Agent selection and Linux portability remain deferred.

## Delivered scope

The [development APK](../../artifacts/android-local-inspector/liveabit-local-inspector-0.1.0.apk) implements the [local collector specification](../../specs/android/local-inspector.md). Follow the [phone trial guide](../../android/README.md) to choose a test app, enable Android usage access, explicitly Start, switch apps and manually Inspect. Observed transitions stay in bounded process memory. Only selection/control preferences persist in private no-backup storage. Stop, a new Start, scope changes, process restart and authority/clock failures clear retained activity.

There is no network permission, endpoint, agent connection, export or background collector. Reports show bounded selected-package transitions and unverified closed-interval estimates. Initial state and source completeness remain unknown; missing or empty results do not establish zero usage. No valid OAP summary or delivery receipt is generated.

The source review tightened query generation/lifecycle fencing, permission-change handling, required access-change listener registration, post-query deadline checks and SQLite control commits. Android callbacks and actual OEM behavior still need a phone trial. These reviews and fixture checks are not runtime Android measurements.

## Recorded checks

The [native evidence manifest](android-local-inspector-validation.json) records exact source hashes, tool pins, outcomes and limits. The audited APK is 96,307 bytes with SHA-256 `93ade977b624ff1ecc94de6fbff4ef9f7cf5119b91a346bd8f6dba2ba28d479c`, signed with a local development key.

| Check | Result |
| --- | --- |
| Dependency-free Java collector fixtures | 19 passed |
| Native Android compilation and debug packaging | Passed |
| APK signature | Verified; local debug signature only |
| Actual packaged permissions | Only `android.permission.PACKAGE_USAGE_STATS`; no `INTERNET` |
| Actual minimum / target API | 35 / 37 |
| Android lint | 0 errors, 3 warnings |
| Input hashes during native verification | No drift |
| Physical phone / emulator runtime | Not tested |
| Existing-agent integration / M2 / M3 | Not proven |

Lint's three warnings cover the prototype's missing custom application icon and two untranslated display strings. The single usage-access declaration has a targeted `ProtectedPermissions` suppression: Android documents this app-op permission as granted through the user's usage-access Settings choice. The declaration grants no access itself; the implementation separately requires `MODE_ALLOWED`. No global lint suppression or disabled error checking is used. [Android permission reference](https://developer.android.com/reference/android/Manifest.permission#PACKAGE_USAGE_STATS)

Pinned official tooling is Temurin 17.0.20.1+1, Gradle 9.4.1, AGP 9.2.1, platform 37.0 revision 2 and Build Tools 36.0.0. Portable tool archives were checksum-verified; tooling, build cache and the debug key are under the workspace. Required stable SDK terms were explicitly accepted using the actual package prompt. No IDE or emulator was installed. Rebuild and audit with [the verification script](../../scripts/verify-android.ps1); each run builds current source before checking the binary.

## Remaining device evidence

A read-only development connection check found no connected, unauthorized or offline devices. Its temporary development server was stopped. No phone installation, usage grant, selection or private activity collection occurred. The development server is a build/trial tool and is not part of the app or any activity delivery path.

The first trial must establish picker usability, permission denial/revocation including quick revoke/regrant, known app-switching intervals, unknown/empty observations, lock behavior, scope changes, Stop and process restart on the user's phone. Keep any recorded timeline deliberately consented and private. Background timing, battery use, accuracy thresholds, production signing/distribution and compliant direct-agent delivery remain later work. The [Windows reference evidence](phase-4-validation.json) remains separate; native build checks do not expand its accepted M1 scope.
