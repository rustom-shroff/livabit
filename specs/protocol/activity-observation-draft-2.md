# OAP activity observations, 0.2.0-draft.2

Date: **2026-10-12**. Status: **experimental Android sender and final local receiver contract**.

Apply the representation, ordering, byte, window, expiry, scope and delivery rules in [draft 1](activity-observation.md), with these explicit replacements:

- `protocol_version` is exactly `0.2.0-draft.2`; `event_name` remains `activity.observation`.
- A positive `foreground_duration_ms` is an unverified estimate within the declared window, including an open or continuing foreground sequence. It does **not** require two transitions inside that window. `transition_count` counts only projected app lifecycle records in the window, so a continued-use estimate may have zero transitions.
- A null duration remains unknown. A zero numeric duration is invalid. Duration must not exceed the window; coverage remains `unknown` and quality remains `unverified_estimate`.

The [draft-2 schema](../../schemas/oap/0.2.0-draft.2/activity-observation.schema.json) preserves draft 1's shape and structural limits. Neither positive duration nor a transition count establishes attention, initial state or source completeness. Package overlap can produce non-exclusive totals.

The native [continuity estimator](../../android/publisher-app/src/main/java/org/liveabit/publish/ForegroundContinuity.java) bounds private adjacent-window context under [ADR-0020](../../docs/decisions/0020-android-foreground-continuity.md). This is Android implementation behavior, not a portable guarantee that another producer knows current foreground state.

The desktop receiver accepts both drafts and keeps the two-transition semantic check for draft 1. Existing queued bodies retain their original revision, bytes, sequence and expiry. An older receiver must be updated before using Sender 0.8.0. The OpenClaw wrapper introduces the declared draft as untrusted activity data; hook acceptance still means run admission. The receiving liveabit Skill recognizes both drafts, and ordinary responses stay local under the existing host policy.

OAP 0.1.0 measured summaries and their accepted reference remain unchanged. This experimental revision does not establish production interoperability, measured coverage or physical-phone behavior.
