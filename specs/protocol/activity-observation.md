# OAP activity observations, 0.2.0-draft.1

This revision retains its original closed-estimate semantics for older queued events. Sender 0.8.0 produces [draft 2](activity-observation-draft-2.md), which permits open/continued estimates with fewer than two new transitions. The current final receiver accepts both revisions.

Date: **2026-10-10**. Status: **experimental event draft implemented by Android Sender 0.3.3 and the final local test receiver**. The agreed OAP 0.1.0 summary contract and its reference implementation remain unchanged. This draft is not evidence of Grok support or production transport conformance.

## Purpose

The accepted Android collector reports retrospective foreground-duration estimates without establishing initial state or source completeness. The existing `activity.summary` family requires established observed intervals and positive measured durations. An `activity.observation` can express the actual collector output without inventing coverage or postponing integration for accuracy proof.

An agent must treat these records as estimates about a past window. Unknown usage is not zero usage, a transition count is not a count of distinct app sessions, and an observation does not identify the app currently on screen. Interpretation and any communication remain the existing agent's responsibility.

## Record

The [observation schema](../../schemas/oap/0.2.0-draft.1/activity-observation.schema.json) defines the complete allowed object. It uses the existing UUIDv4 and restricted UTC millisecond timestamp definitions from [OAP 0.1.0](oap.md). No new infrastructure or schema hosting is needed; schema references resolve offline.

| Field | Meaning |
| --- | --- |
| `protocol_version`, `event_name` | Exactly `0.2.0-draft.1`, `activity.observation` |
| `event_id`, `window.window_id` | Immutable random identifiers for this observation and its window |
| `recipient_id`, `subscription_id`, `stream_id`, `scope_revision` | Local sharing-setup identities; public identifiers are not authentication |
| `sequence` | Positive sequence assigned once when the event enters the durable queue |
| `emitted_at`, `expires_at` | Original finalization time and retention/delivery deadline; retries change neither |
| `window.start`, `window.end` | Half-open retrospective interval, positive and at most 15 minutes |
| `observation.metric`, `unit` | `foreground_duration`, `millisecond` |
| `observation.coverage`, `quality` | `unknown`, `unverified_estimate` |
| `observation.apps` | Sorted selected Android packages, nullable duration estimates and projected transition counts |

A record contains 1–32 distinct selected applications, sorted by package ID. IDs use the Android package grammar, at most 128 characters. A duration is null when no closed estimate exists; otherwise it is a positive safe integer no larger than the window, with at least two projected transitions. Each transition count is a nonnegative integer, and their sum is at most 4096. No label, raw lifecycle event, class name, content, URL, prompt or agent instruction is included. Null remains unknown even when a count is zero. Durations across apps need not sum to the window because these are unverified estimates, not an exclusive-time coverage claim.

All timestamps have exactly three fractional digits and `Z`. Window end is no later than finalization; finalization precedes expiry. Expiry is no later than window start plus 24 hours and must still be in the future when consumed. The local implementation uses that 24-hour ceiling; a future authenticated agent profile may narrow it. Collection remains bounded to the latest 15 minutes and current boot; missed older intervals are not replayed as complete history. Unchanged sharing uses successive non-overlapping windows. Changed settings allocate a fresh local setup/stream.

## Representation and delivery

Encode canonical UTF-8 JSON with no BOM, duplicate members, invalid Unicode, floating-point values, unsafe integers or unknown properties. Objects sort keys by UTF-16 order; strings use canonical JSON escaping. The native encoder implements this integer-only JCS subset. The complete event is at most **16,384 bytes**. Freeze its bytes before first dispatch; every retry uses the same bytes, identifiers, sequence and expiry. The receiver checks the exact canonical representation, schema, timestamp chronology, app ordering, count budget and duration bounds before saving.

The current app posts directly to the configured final test receiver's `/events` endpoint with its protected connection key. The existing saved-event acknowledgement matches the event ID and SHA-256 of the exact submitted bytes. It is a local test receipt, not agent execution or OAP 0.1.0 valid-consumption proof. Public IDs in a record do not authorize collection or bind a real agent account. A future agent integration must supply its verified authentication/ingress and explicitly support this event family; do not reinterpret a generic webhook success as agent consumption.

The receiver also accepts the earlier `liveabit.test.activity.v1` envelope so an upgraded app can deliver already queued bytes unchanged. New observations use only the draft OAP family. Android storage migration adds durable local identities without resetting the existing cursor, stream, timer or pending bytes. Saved receiver data can contain both formats; the dashboard identifies and displays each.

## Implementation and evidence

The Android [sender](../../android/publisher-app/README.md) builds and serializes the event directly. The [receiver validator](../../tools/activity-receiver/oap-observation.mjs) is the real desktop consumer, not a JavaScript sender simulation. Native emulator tests exercise real OS collection, canonical wire bytes, receiver rejection of invalid records, immutable retries, notification/recovery and older-format storage migration. The [0.3.3 review](../../docs/review/android-sender-0.3.3-2026-10-10.md) records the exact APK and results.

The draft deliberately makes no assertion of precise duration, complete source coverage, a production authorization ledger, production publication rate, physical-phone background timing or commercial-agent compatibility. These limits do not block continued Android development.
