# Personal-agent foundation

This native OpenClaw plugin and transform run inside the user's existing gateway. They add a durable OAP inbox, bounded factual summaries, intervention episodes, user-feedback records and guarded companion notifications. They make no model call and create no relay, cloud database, email sender or behavioral classifier. The existing agent chooses its approach and maintains the conversation.

## Runtime tools

| Tool | Role |
| --- | --- |
| `liveabit_context` | Read recent local-day activity estimates and episode history, including native delivery outcomes |
| `liveabit_record_decision` | Record a question, nudge, reflection, deferral or choice to stay quiet; returns episode/decision IDs and sends nothing |
| `liveabit_record_feedback` | Record a bounded user report, observed outcome or agent-reported delivery result with provenance |
| `liveabit_notify` | Deliver a recorded question/nudge to the exact private companion, subject to current preferences and a durable one-attempt reservation |

Tools bind agent/session identity from OpenClaw's trusted invocation context. Only the configured personal main session receives them. Caller parameters cannot choose another session or storage file. The agent chooses and records prompt text with `liveabit_record_decision`; `liveabit_notify` accepts only that decision ID and uses its stored text and the private saved destination. Existing unrelated main-agent tools are preserved; the activity workflow does not authorize their use for external accountability messages.

## Setup

Requirements: configured local token-authenticated OpenClaw gateway, separate existing hook token, a saved paired Android companion policy, and Node 24.16+ with `node:sqlite`. The tested target is the managed Windows OpenClaw 2026.9.9 installation. Run the native helper from the repository:

```powershell
./scripts/configure-openclaw-personal-agent.ps1 -RestartGateway
```

It packages the source into the chosen host, validates a configuration patch using OpenClaw, installs the local plugin, maps the existing `/hooks/liveabit` route to persistent `agent:main:main`, copies the existing companion destination/preferences/state and appends a managed instruction section while retaining custom content. It creates private backups inside the host. The dedicated liveabit conversation stays intact; this increment starts journal history from newly received observations and does not import private old chats. It does not change the APK, hook token, model, thinking choice, global messaging accounts or task cards. No test notification is sent. The controlled update captures fresh native pairing facts bound to unchanged settings, pauses the managed gateway for installation and restores its prior running state even if installation fails. This avoids the tested Windows hot-reload symlink error; tool availability must still be verified afterward. Without the switch the helper uses the running gateway, which may fail on replacement. Native runtime verification remains separate; the [review](../../../docs/review/personal-agent-foundation-2026-10-14.md) records what was actually exercised.

The Android sender may still name `liveabit` in its saved wrapper. The trusted server mapping owns the actual receiving agent/session. No connection reimport is needed when the existing endpoint/key already work.

## Evidence and retention

SQLite lives in the host's `plugins/liveabit-personal-agent/activity.sqlite`, separate from OpenClaw's native conversation and Workboard databases. Raw packets expire at their original producer deadline; derived window estimates retain at most 30 days and episodes at most 90 days by installed default. Startup/60-second cleanup requires an enabled plugin, valid settings and an available gateway; ordinary store operations also prune. Plugin disablement, invalid settings or a stopped host can prevent scheduled cleanup, which resumes when those prerequisites are restored. Logical deletion does not claim forensic erasure from SQLite journals/backups or native agent transcripts.

Duplicate identities contribute no additional usage. A stored-but-undecided retry can still reach native run admission; recording a decision suppresses subsequent event replay. Durability does not imply successful model execution. Automatic recovery after an admitted model run fails is not implemented. Native gateway idempotency remains a separate, temporary mechanism.

Summaries retain unknown coverage and unverified-estimate quality. They exclude ambiguous overlapping source windows and windows crossing a local-day boundary instead of prorating unknown time. Null values stay unknown. App totals are not exclusive, measured attention, current foreground state, background media, or complete multi-device daily use. No transition count is treated as a session count.

Recorded decisions and feedback are agent-authored evidence, not independent proof of feelings, intent, reading or causal benefit. After two recorded support decisions without recorded benefit, the model receives an advisory reconsideration marker; the runtime never escalates tone or enables email according to that count.

## Notification behavior

Notification text comes from the stored decision; the private saved policy owns the phone. The runtime checks native inventory, opt-out, timezone/quiet hours, conservative cooldown and a maximum 15-minute age for a decision/supporting observation. One decision can reserve at most one invocation. Interrupted/uncertain attempts remain uncertain and cannot be retried; they count toward cooldown. A preference change or cancellation before invoking the native API is recorded as suppressed, consumes no send budget and cannot replay the same decision. There is no offline queue or alternative channel. A native acknowledgement proves command handling, not physical display or reading.

Questions invite the user to open the existing companion's main chat; inline replies and notification deep links are not implemented. The agent reads/reuses episodes and records the person's answers using the normal conversation and tools. Automatic reply linkage, proactive follow-up scheduling and durable failed-run recovery remain later increments.

## Verification

Run the independent evidence/delivery/configuration suites and specification checker:

```powershell
node --test test/personal-agent*.test.mjs
node scripts/validate-spec.mjs
```

Tests use synthetic packets, private temporary SQLite state and a fake native nodes interface. They establish mechanical behavior, not actual model psychology, physical phone display or sustained behavior change. Actual gateway loading/tool calls are reported separately. [Requirements and acceptance](../../../specs/personal-agent-intervention.md).
