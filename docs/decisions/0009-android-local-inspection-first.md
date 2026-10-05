# ADR-0009: Android collector and local inspection first

Date: 2026-10-05. Status: **accepted by the user's explicit priority instruction**.

## Decision and authorization

The user said: “I’d proceed with the Android collector and local inspection first ... some things need to fall in place before we can think about which agent to integrate with.” This supersedes ADR-0008's parallel execution priority. Build and inspect a local Android collector before selecting or activating an agent integration. The accepted Windows reference remains sufficient for progression; Linux remains deferred.

The first app is an isolated local diagnostic prototype: explicitly selected apps, usage-access checking, a separate local inspection session, manual foreground reads, bounded in-memory observations, and conservative duration estimates. It has **no Internet permission, endpoint, credential, transport, export or background collector**. An agent choice is not a prerequisite. The [local collector specification](../../specs/android/local-inspector.md) defines its concrete behavior before native implementation.

## Scope and limits

Use Android 15/API 35+ package/type-filtered UsageEventsQuery. Read only approved package identity, timestamp and resume/pause type. Do not enumerate installed apps or read class/content/extras. A system app picker may return a user-selected package; its selected activity class is never read or stored. Exact package entry is a fallback where a system picker is unavailable.

The initial prototype uses plain Java and Android platform UI/storage rather than the earlier provisional Kotlin/Room/WorkManager candidate. This removes third-party runtime dependencies and background scheduling from the first measurement. Preserve a small JVM-testable core. Revisit native product technology after local evidence; no wire change follows from implementation language.

Activity stays in RAM and is cleared by Stop, a fresh Start, selection changes and process restart. Persist only settings/control in credential-encrypted no-backup storage. A local session can remain ready while the user switches apps, but the inspector queries only on a visible user's request. Process restart requires a fresh Start. No timers or OS wakeup guarantees are introduced.

Public Android history queries do not attest complete source continuity or initial resumed state. Display observed events and inferred closed intervals as local diagnostics with unknown coverage. They are **not validated OAP summaries**. Missing, empty, ambiguous, revoked or unavailable data never means zero usage. Stop on unsupported or uncertain authority/clock state.

## Gates

TASK-P6-F02 (native local collector/inspection) precedes actual TASK-P5-002 (real-agent pilot). AC-25/26 may receive partial local Android evidence before M2; M3 still requires physical-device quality/security measurements, approved thresholds and a functioning compliant direct M2 integration. Building an APK or passing a JVM fixture is neither M2 nor M3.

Production publication, receiver pairing and delivery remain gated by M2. The no-intermediary constraint, OAP 0.1.0 semantics, privacy requirements and stable 33 requirement/29 acceptance IDs are unchanged. The optional liveabit Skill package is retained; no account selection, activation or installation is required now.

## Environment

Pin official build versions and verify archive hashes. Keep development tools/caches inside the workspace; do not modify system PATH or install an IDE/device silently. Google's SDK agreement requires user acceptance before download/use, and package-license acceptance is a separate explicit setup step. Prepare source and JVM checks while that prerequisite is pending. Identify an owned device or emulator before installing/running the prototype; actual usage access and app selection occur visibly on that device.
