# Personal-agent activity runtime

Updated: **2026-10-15**. This native OpenClaw plugin runs inside the user's existing gateway. It provides durable OAP receipt, bounded factual summaries, independently scheduled analysis, episode/user-report records and guarded companion notifications. The existing personal agent chooses its approach and owns the meaningful conversation. There is no standalone coach, relay, cloud database, accountability email sender or deterministic behavioral classifier. Source, automated tests, installation, native execution and physical display are separate evidence levels; consult the [current system guide](../../../docs/current-system.md).

The [October 15 review](../../../docs/review/personal-agent-processing-2026-10-15.md) and [sanitized host evidence](../../../docs/review/personal-agent-host-2026-10-15.json) record the final settings-v2 deployment: all 17 source and three guidance hashes match, SQLite quick-check passes, and warm native health/receipt/duplicate/context-isolation checks pass. Thirty regular healthy checks plus a healthy follow-up span 31 minutes 47 seconds with data unchanged and no jobs. Sender 0.12 passed all 97 exact-APK Android emulator checks, including both real reboots. The controller earlier timed out while cold startup took about seven minutes during concurrent development/emulator work; its cause remains unresolved. Native scheduled model execution, future availability and physical delivery remain separate. The physical phone APK/setup was not changed. Existing `/hooks/liveabit` remains compatible; the phone gains independent durable receipt only after the compatible phone update and explicit setup migration.

## Receipt and model execution

The plugin exposes **POST `/liveabit/activity`** using the existing separate activity hook bearer token. It validates the observation, deduplicates immutable identities and commits both the observation and pending analysis obligation in one SQLite transaction. Only after commit does it return HTTP 200 with `ok:true`, `format:liveabit.activity-receipt.v1`, `durable:true`, matching `event_id`, `body_sha256`, disposition and `analysis_scheduled`. The digest binds exact HTTP wrapper bytes, distinct from the stored canonical OAP digest. This endpoint admits no model run and returns no invented `runId`.

The legacy **`/hooks/liveabit`** mapping remains a compatibility path with its native `ok:true`/`runId` acknowledgement. Eligible packets still request per-packet runs through that path, now in the isolated activity session; it does not create a parallel durable analysis job. A legacy sender must not be switched to the new acknowledgement contract without matching app support and setup. No observation identity, original expiry, unknown-coverage semantics or Android consent changes follow from this split.

The host-local service checks due work every 30 seconds. Default activity coalescing is five minutes; new packets do not push already due work later. Jobs use a 90-second lease, at most five dispatch attempts, failure backoff from 30 seconds to five minutes and a useful deadline of scheduled due time plus 15 minutes. An observation already at least 15 minutes old is stored without scheduling a new activity review. The worker records native admission separately from terminal completion and uses a stable job idempotency identity across uncertain admission. A partial decision is not a completed review. Later arrivals during an active review remain pending for another generation. Expiry/exhaustion is recorded honestly rather than credited as successful reasoning.

If a native run completes successfully without a bound recorded decision, the job settles as `completed_without_decision` in `analysis_state.last_outcome` and returns `decision_recorded:false`. It is not silently reclassified as `no_intervention` and is not retried merely for lacking a decision. An explicit recorded no-intervention choice remains distinguishable. This diagnosis survives reopening the database; the ordinary context/episode tool does not imply a separate worker-status API.

Analysis and delivery have independent checks so slow model admission cannot starve notification work. Availability/admission/run-status transport are bounded at 5/45/5 seconds respectively; inventory reads at 15 seconds. Service stop/restart generations fence old continuations. Jobs persist the exact retry message: JSON evidence is bounded at 48 KiB and the whole prompt at 52 KiB, with truncation disclosed and context retrieval available. These snapshots contain derived evidence/episode context rather than a second archive of original packet bytes.

These are execution/resource defaults, not thresholds declaring use unwanted or an empirically optimal intervention frequency. Host/service downtime delays work. No eventual-delivery, exactly-once model or exactly-once side-effect guarantee is made.

## Runtime tools and sessions

| Tool | Role | Trusted surface |
| --- | --- | --- |
| `liveabit_context` | Recent local-day estimates and bounded episode history, including runtime delivery outcomes | Activity session and exact ordinary main chat |
| `liveabit_record_decision` | Record question, nudge, reflection, deferral or silence with approach/rationale; sends nothing | Activity session |
| `liveabit_record_feedback` | Record a bounded report/outcome with provenance and supported episode/decision link | Activity session and exact ordinary main chat |
| `liveabit_notify` | Request delivery of a stored question/nudge to the private companion under current policy | Activity session |
| `liveabit_schedule_review` | After recording the current review decision, request one idempotent future review with `minutes` from 1 to 1440; at most three follow-ups until fresh accepted input | Live scheduled activity review |

The same main agent owns `agent:main:liveabit-activity` and ordinary `agent:main:main`. Trusted invocation context determines access; caller arguments cannot select ownership, a storage file, a destination or another native command. Foreign/sandboxed sessions are denied. Main chat can read the shared activity ledger and record a deliberately linked `user_report`, which atomically requests immediate activity review. It cannot use these tools to create decisions, notify or schedule directly. Ambiguous replies need clarification, not guessed attribution. Common identity does not automatically import another transcript or every memory.

That linked main report atomically retires old unreserved queued/checking notification intent with reason `new_user_report`; existing native reservations are not cancelled or replayed. A fresh trusted reply/follow-up review may record a different choice using the same supporting event ID. Scheduled retries deduplicate by review identity; legacy direct-hook replay retains event-based deduplication and all foreign-owner checks. A report/scheduling write failure rolls back the report and old-intent cancellation together.

Meaningful activity dialogue can grow while routine observations stay in structured history. Existing authorized shared memory and Workboard are usable through actually available host tools. This setup adds no calendar/email connector or arbitrary transcript ingestion. A descriptive decision `followup` field is not a timer; the declared scheduler creates real review work. A narrow trusted legacy episode-owner alias preserves access to existing foundation episodes without rewriting transcripts.

Tool-call hooks bind authoritative agent/session/run/call identities because the installed SDK factory context omits run ID. Every activity tool checks that live binding and scheduled-job deadline; missing or stale bindings fail closed. A lost admission response or early tool cannot create an unlinked review decision. Agent-requested follow-ups are idempotent per recorded review and limited to three since fresh accepted activity or a deliberately linked main-chat user report; duplicate packets do not reset the budget. Legacy per-packet hooks do not acquire a scheduler review identity merely because the tool name is installed. These are execution limits, not a researched behavioral dose.

## Setup and compatibility

Requirements: configured token-authenticated local OpenClaw gateway, separate activity hook token, saved paired Android companion policy, and **Node 24.16 or later** with `node:sqlite`, matching the package engine requirement. The managed Windows baseline is OpenClaw 2026.9.9; verify the installed SDK's plugin HTTP route, agent run/wait and nodes interfaces rather than assuming newer online documentation matches it. From the repository:

```powershell
./scripts/configure-openclaw-personal-agent.ps1 -RestartGateway
```

The helper packages immutable source in the chosen host, validates its configuration patch using OpenClaw, installs the plugin, maps the legacy hook to the isolated activity session, preserves ordinary main chat, copies existing private companion preferences/state and adds managed guidance without discarding custom instructions. It retains user-selected model/reasoning settings, global messaging accounts, shared tasks and original observations. It writes settings v2 and private rollback backups, not a new account connection. No test notification is sent.

The controlled update captures fresh trusted pairing facts bound to unchanged settings, pauses the managed gateway for installation and restores its previous running state on failure. Native source/tool/service loading and the new route must be verified afterward. The database migration is additive; the October 14 [foundation review](../../../docs/review/personal-agent-foundation-2026-10-14.md) is evidence for its original bundle, not a pass for the new worker.

An existing Android wrapper may still name `liveabit`; trusted host configuration owns the real agent/session. An unchanged legacy endpoint/key can remain in use, but continues legacy per-packet run admission. Using independently scheduled receipt requires a compatible sender and a private setup that selects `/liveabit/activity`. A changed APK needs its own exact-build emulator gate; old test results do not transfer.

## SQLite and retention

The plugin creates its own **`activity.sqlite`** through Node `node:sqlite`; the embedded engine needs no separate database installation/server. The private configured path is inside the chosen host and is separate from native conversation/Workboard stores. The phone instead maintains a bounded private `sender.json` retry/settings file. See [the full data inventory](../../../docs/current-system.md#data-and-database).

The five evidence tables are `events`, `episodes`, `decisions`, `feedback` and `notifications`. The new runtime adds `analysis_state`, `analysis_events`, `analysis_jobs`, `analysis_decisions` and `notification_jobs`: ten application tables in total. These track work/checkpoints and stable review-decision identity without a second raw packet archive. Raw event JSON expires at its original producer deadline; installed foundation defaults retain derived per-window estimates for 30 days from window end and episodes/children for 90 days from episode creation. Replay never renews retention. Settings limits and actual installation require separate verification.

The store uses WAL, full synchronization, foreign keys and finite quotas. Startup/periodic cleanup requires an enabled plugin, valid settings and an available host/service; normal store operations also prune. A stopped host cannot delete at every timer boundary. Logical deletion does not claim forensic erasure from journals/backups or removal of native chat/provider copies. Local storage does not mean local model inference.

Summaries are calculated on read. They retain unknown coverage and unverified-estimate quality, exclude ambiguous overlapping source windows and local-midnight-crossing windows rather than invent proportional allocations, and leave null values unknown. App totals are not exclusive phone time, measured attention, current foreground state, background media or complete multi-device daily usage. A transition count is not a session count.

Decisions and feedback are agent-authored evidence. After two support decisions since the latest reported benefit, an advisory marker invites reconsideration; historic benefit does not permanently suppress it. Lifetime support/native-attempt counts remain distinct. Equal-millisecond cross-table order stays explicitly unknown rather than being invented. The cue does not establish reading, failure or resistance and never escalates tone or enables email. The [conversation evaluation plan](../../../docs/evaluation/personal-agent-conversation.md) separately checks optional inquiry, relevant alternatives, changed goals/rest and meaningful strategy adaptation.

A duplicate decision is not a duplicate notification attempt. If a review crashed after storing its decision but before requesting delivery, recovery reuses the stored decision ID and may request its still-current unrequested delivery through the same guarded tool. Existing intent/reservation/outcome remains authoritative; a duplicate result cannot authorize a replacement decision, resend after uncertainty or policy bypass.

## Notification recovery and limits

`liveabit_notify` takes only a stored decision ID. It persists a private policy-bound intent before checking inventory. An exact still-paired Android phone with declared notification command/permission may wait if disconnected. Inventory lookup failure may also receive a bounded pre-dispatch retry. Missing, ambiguous, unpaired or permission-denied nodes cannot authorize delayed delivery. Changed policy, opt-out, stale evidence, quiet hours and cooldown remain enforced.

The queue permits at most eight pre-invocation checks, backing off from 30 seconds to four minutes. Its deadline is the earliest of decision creation plus 15 minutes, supporting observation end plus 15 minutes and original expiry. A newer queued prompt supersedes an older unreserved queued/checking prompt for that owner. A durable reservation prevents replay once invocation might have occurred. An interrupted/uncertain invocation consumes its attempt and counts conservatively toward cooldown; no model retry or replacement decision may bypass it. A pre-invocation suppression is recorded without consuming a native send budget.

`delivery_queued:true` means waiting, not sent. Native acknowledgement proves command handling, not displayed notification, reading or benefit. This host queue cannot wake a force-stopped app, fix its Android service lifecycle or maintain connectivity while the gateway is stopped. Physical background reliability requires actual device/OS/app-version evidence. The read-only [companion diagnostic](../../../scripts/inspect-companion-background.mjs) reports available permission/service/battery facts without changing settings.

Questions invite replies in the existing companion chat. Notification inline replies and deep links are not implemented. Feedback linkage is deliberate through the main-chat bridge; arbitrary replies are not automatically attributed. Automatic accountability email, alternate-channel fallback and device restrictions remain disabled.

## Verification

Run relevant evidence, analysis, receipt, conversation, delivery, configuration and instruction-regression suites plus the specification checker:

```powershell
node --test test/personal-agent*.test.mjs test/mindshift-workflow.test.mjs test/companion-background-health.test.mjs
node scripts/validate-spec.mjs
```

Fixtures use synthetic packets, temporary SQLite and controlled native interfaces. They can exercise crashes, offline nodes, restart, late input and uncertain acknowledgements, but do not establish native SDK behavior, physical background delivery, model psychology or sustained benefit. Record actual installation and native calls separately, then complete physical checks when a device is available. [Requirements and acceptance](../../../specs/personal-agent-intervention.md).
