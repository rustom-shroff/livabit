# Android sender 0.3.3 development review

Date: **2026-10-10**. Native Android development under [ADR-0015](../decisions/0015-android-first-test-receiver.md) and [ADR-0016](../decisions/0016-native-oap-observation-draft.md), extending the [0.3.2 baseline](android-sender-0.3.2-2026-10-09.md).

## What this advances

Android constructs and sends the experimental [OAP observation record](../../specs/protocol/activity-observation.md), `0.2.0-draft.1` / `activity.observation`. It preserves the accepted collector's unknown coverage and nullable estimates. Native code assigns stable local recipient/subscription/stream identities, immutable event/window IDs, restricted UTC millisecond timestamps and expiry derived from the original window start. It serializes canonical UTF-8 JSON and freezes the event bytes before queuing. This is a functioning protocol data path, without a JavaScript sender prototype.

The actual final desktop receiver validates the [schema](../../schemas/oap/0.2.0-draft.1/activity-observation.schema.json), canonical bytes and cross-field timing, ordering and measurement bounds before saving and acknowledging. The dashboard reads `observation.apps` and identifies the received wire format. It also reads older-format events. The server still forwards nothing.

Native storage migration adds missing identities while retaining old pending bodies, stream, cursor and outage timer. The receiver accepts those older queued bytes unchanged. Repeated Start, native Wi-Fi/USB guides, setup import, warnings and recovery retain their existing behavior. The agreed OAP 0.1.0 summary contract, its reference source and current summary-only liveabit Skill remain unchanged; the draft does not imply compatibility with them or Grok.

## Verified result

The exact [0.3.3 APK](../../artifacts/android-publisher/liveabit-sender-0.3.3-test.apk), SHA-256 `a28771d77af160b901c8aab28a5ac1972f9646081bcef23001a168004a2eb241`, **123,828 bytes**, passed **26 real Android checks** on the owned Android 15/API 35 emulator. The installed APK was pulled and hash-matched to the candidate before testing. The suite ran through Windows PowerShell 5.1 with an isolated copy of the actual receiver. [Run report](../../artifacts/android-publisher/run-878e6ff8-2b73-4c64-8fa4-34122f7e3834/validation.json), [native checks](../../artifacts/android-publisher/run-878e6ff8-2b73-4c64-8fa4-34122f7e3834/native-tests.txt), [receiver cleanup](../../artifacts/android-publisher/run-878e6ff8-2b73-4c64-8fa4-34122f7e3834/receiver-cleanup.json), [source bindings](android-sender-0.3.3-2026-10-10.json).

New checks cover native canonical key ordering, Unicode/string escaping, nulls, integer/byte limits and fixed millisecond timestamps; actual OS observations in the OAP envelope; and the received canonical body's digest. Native HTTP probes verify receiver rejection of unsupported versions, unknown fields, fabricated complete coverage, zero/out-of-window durations, duplicate apps, oversized transition counts, invalid chronology/timestamps, expiry, duplicate JSON members, noncanonical bytes and oversized events.

The migration check seeds a representative older private Android storage record, then uses the actual new store/engine and HTTP receiver. It verifies stable added identities, unchanged original stream/cursor/timer/body, and matching digest after successful older-format delivery. It is a native storage-migration test, not a physical-phone installation trial between two historical APKs.

Existing tests cover selected-app lifecycle observations, matching/incorrect acknowledgements, deduplicated immutable retry, Stop, actual one-minute outage notification/recovery, native setup import, rendered connection guides, changed-setup Cancel/Confirm, bad-key/unreachable responses, force-stop/reopen, JobScheduler delivery and denied notification permission. The default **60-minute** value was checked without waiting an hour.

An earlier run passed all 21 instrumentation cases but exposed a harness timing race in background recovery: the restored job could still be active when another forced run was requested. The harness now waits for its completion, records the recovery dispatch and verifies actual acknowledged delivery. The final suite passed all 26 checks without changing the tested APK bytes. Failed reports remain in ignored local artifacts.

Build and Android lint passed with **zero errors and nine warnings**: seven English UI localization warnings and two spelling false positives for `.ps1` in the connection guides. [Build log](../../artifacts/android-publisher-build-0.3.3.txt). No dependency was added; receiver schema validation uses the project's existing locked packages. Earlier APKs, reviews and the accepted inspector remain preserved.

## Limits and next steps

This establishes native record construction and final local test consumption, not production OAP transport/authorization, Grok evaluation, precise duration, complete coverage or physical-phone background timing. JobScheduler delivery was force-triggered; OS scheduling can delay background sends and warnings. The saved-event acknowledgement is not agent execution or a 0.1.0 valid-consumption receipt. The desktop renderer was updated for both formats; no new browser-visual claim is made by the native suite.

The test receiver is stopped after the run. Your primary receiver is not controlled by the harness. **Before an optional phone trial, restart your receiver yourself so it loads the new format, then install this APK over the old one.** Keep the existing receiver connection/data files. [Connection guide](../../android/publisher-app/README.md).

Development can continue independently without approval, purchase or phone testing. Native agent-profile mapping and observation-aware Skill guidance can follow; actual Grok testing still requires supported account/webhook access.
