# Android local collector and inspection prototype

Revision: 0.1, 2026-10-05. Authorized by [ADR-0009](../../docs/decisions/0009-android-local-inspection-first.md). Task: TASK-P6-F02. This is a local measurement app, not an OAP publisher or evidence of M2/M3 completion.

## User flow

1. Add one or more apps using a system picker where available, or enter an exact package identifier. Show the resulting selected identities. Never request all-package visibility or enumerate an app inventory.
2. Explain that Android usage access is broad OS permission while this app reads only selected packages. Open usage-access Settings on request and recheck AppOps; returning from Settings is not approval. Device must be unlocked. Only MODE_ALLOWED permits a read.
3. Start an explicit local inspection session. It begins now, clears old observations and commits control/settings before showing readiness. Empty or invalid scope cannot start. Maximum 32 packages in this local prototype; source queries are explicitly filtered by package and resume/pause type. An empty set must never reach the API because Android interprets it as all packages.
4. Switch to selected apps, then return and tap Inspect now. This is a manual foreground read; no collection occurs while the inspector is hidden. Show source status, observation times, bounded recent transitions and diagnostic duration estimates. Coverage remains unknown and estimates are not current attention, exclusive screen time, zero-use evidence or complete OAP summaries.
5. Stop clears observed activity and prevents further reads. Clearing selection also removes stored selected package settings. Starting again establishes a new consent horizon and does not backfill the stopped interval. Process restart is stopped and has no old activity to inspect.

## Authority and read boundaries

Local inspection consent is separate from recipient sharing and from Android's usage-access grant. No receiver or recipient grant is created. Reads begin no earlier than this session's original authorized start, no earlier than a bounded 24-hour horizon, and never from OS daily aggregate buckets. Query only selected package/timestamp/type data, redact every unexpected package before reading its other event fields, and do not access class names, labels, content, extras or interaction payloads.

Capture session/scope generation, lifecycle read epoch and clock anchors before the query. Recheck actual OS permission, unlock state, foreground lifecycle, exact scope and generation after return and before displaying or ingesting observations. Discard stale results. Scope changes, Stop, settings/storage failure and permission loss stop the session and clear RAM. Lifecycle hiding cancels pending reads without forcing a new consent horizon, so normal app switching remains usable. A new process always requires a new session.

Use wall time for OS query timestamps and elapsed realtime to detect rollback, reboot/discontinuity and implausible drift. Unknown timing stops inspection and clears observations; a new explicit Start can establish new anchors. Queries and event outputs have finite bounds; overflow suppresses the read with a safe reason rather than silently truncating an apparently complete result.

## Reconstruction and honest inspection

Pair only permitted package-level resume/pause observations after consent, with half-open timing and union semantics. Multiple activities or duplicate-looking transitions are ambiguous without instance/class identity. Do not guess a baseline idle state or fabricate a closing time at a query/window boundary. Missing starts/stops and conflicting transitions reduce usable diagnostic evidence. Same-package intervals may be merged only where justified; different packages may overlap.

A successful or empty query attests neither completeness nor initial state. Every diagnostic report declares unknown source coverage. Show no duration from a missing period as zero. Closed inferred intervals may be presented with that limitation; there is no OAP conversion or validity/consumption receipt. The earlier [synthetic model](../../src/android-observation-model.mjs) has fixture-only attestations that are unavailable here.

## Storage and app boundary

Keep at most 4096 projected transitions in RAM, with an active observation horizon no longer than 24 hours. Clear activity on Stop, scope mutation, fresh Start, process restart and authority/clock failure. Persist only bounded settings/control under getNoBackupFilesDir() in normal credential-encrypted storage, with explicit backup/transfer exclusions and no Direct Boot support. Corrupt/unknown or failed settings writes fail closed; no device identifier, token or raw observation is written to diagnostics.

The manifest contains usage-access declaration and the launcher activity only. No INTERNET, ACCESS_NETWORK_STATE, QUERY_ALL_PACKAGES, Accessibility, device-management, boot receiver, background service or exported data provider. No sharing/export button, endpoint configuration, analytics, automatic agent invocation or cloud library. Selected package preferences remain locally until Clear; Android's own history is outside the app's deletion control.

## Verification and next evidence

Run JVM core fixtures for scope redaction, no pre-consent history, ambiguity/open intervals, interval overlap, state/generation races, clock failures, bounds and process-reset semantics. Inspect source and the eventual merged APK manifest for the absent network/inventory/enforcement surfaces. Build with pinned official tools and retain source/tool hashes plus exact outcomes; a source review is not an APK/runtime audit.

Physical trials must show permission denial/revocation, actual app selection, known controlled app switching, empty/unavailable history, screen lock, process kill/restart, scope changes and Stop. Compare reported diagnostic intervals with a consented fixture timeline, retaining omissions in the denominator. Background and battery quality measurements remain a later stage; this app makes no automated monitoring promise. Existing AC-02/04/05/07/18/19/25/26 associations are partial preparation until actual device observations are recorded. AC-29's no-intermediary boundary applies; absent networking does not establish a real direct host.
