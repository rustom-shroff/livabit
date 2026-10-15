# ADR-0025: durable analysis and a separate activity conversation

Date: **2026-10-15**. Status: **Accepted for implementation by the user's instruction**. Extends [ADR-0024](0024-personal-agent-behavior-change.md). Supersedes its use of the ordinary main conversation for routine OAP input, while retaining the same personal agent, user-owned model, shared Workboard and private companion route. See [current system status](../current-system.md) for implementation and verification; acceptance of this decision is not deployment evidence.

## Context

The foundation commits observations to SQLite before requesting model execution, but its native hook still requests a run for each eligible packet. The Android sender's existing acknowledgement expects `ok:true` and a `runId`; neither confirms finished reasoning or a displayed notification. A model outage after admission can leave analysis unfinished. Routine packet text also accumulates in the ordinary main chat, even though structured activity already exists in SQLite.

The user approved separating receipt from reasoning, then asked to finish the MindShift-inspired conversation direction, make background delivery dependable and align the surrounding specifications. The earlier authorization to apply tested changes to the running host remains in force. Automatic accountability emails remain disabled. The design must stay within the existing chosen host and add no forwarding bridge, project service, required subscription or shared cloud database.

## Decision

Treat packet receipt, analysis, a model decision and delivery as distinct durable stages. Validate and deduplicate observations deterministically. Commit an accepted observation and its pending analysis obligation in one SQLite transaction, then acknowledge durable receipt. Do not claim a run ID for work that has not been admitted. A new receipt endpoint and a matching sender acknowledgement contract must be versioned together; an old sender remains on its truthful supported path until compatible setup is applied.

Run a bounded background worker inside the existing OpenClaw plugin/runtime. Coalesce observations into a pending review, claim work with an expiring lease, use bounded retry after model failure and preserve a clear checkpoint of what was reviewed. A packet arriving while analysis runs remains pending for the next review. New arrivals must not indefinitely postpone already due work. A process restart can recover uncompleted work; it must not resurrect expired raw packets or replay obsolete nudges. Admission and run completion remain separate states, and no exactly-once model or external-side-effect guarantee follows.

Use the **same main personal agent in an isolated activity session**, `agent:main:liveabit-activity`, rather than a second persona or the ordinary `agent:main:main` conversation. The activity session can develop meaningful dialogue, retrieve bounded usage evidence and episode history, and use authorized shared personal context. Routine packets do not need to be copied into ordinary chat. Isolation does not automatically make every other chat or memory visible; any reply/context bridge needs explicit implementation, bounded provenance and verification.

Let the model choose whether to ask about current intention or feelings, offer a relevant alternative, reflect, wait, or reconsider its previous approach. Existing calendar, email, tasks and standing goals are useful only where available and authorized. No open task is required for support. Intended leisure, rest and changed goals remain legitimate. The growing conversation preserves meaning; structured records anchor usage estimates, prior attempts and user reports. Neither a database nor a longer transcript establishes understanding or effectiveness.

Keep transport recovery independent of behavioral escalation. A known-disconnected phone may support bounded waiting until it reconnects, provided the message remains fresh and permissions are rechecked before invocation. Once an invocation has an uncertain side effect, do not blindly repeat it. Quiet hours, refusal, revoked notification permission, stale evidence and changed destination must not be bypassed by retry, a replacement decision, another channel or direct native tools. Physical background connectivity depends on the installed companion and OS and requires its own evidence.

## Consequences

The phone can learn that its packet is safely retained without waiting for a model. The worker can batch recent evidence and recover from temporary model failures. The ordinary chat avoids routine telemetry growth while the personal relationship and user-selected agent remain. SQLite remains an embedded file in the final chosen host, with no separate database service.

More durable stages create migration, resource-budget and lifecycle responsibilities. Tests must cover transaction failure, duplicate identity, crash after receipt, lease expiry, concurrent work, late packets, partial decisions, model admission without completion, host restart and stale catch-up. Delivery tests must distinguish known pre-invocation unavailability from ambiguous invocation. The [PA acceptance cases](../../specs/personal-agent-intervention.md#acceptance-cases) and [conversation evaluation plan](../evaluation/personal-agent-conversation.md) separate mechanical reliability from model judgment and sustained usefulness.

Old ordinary-chat copies are not removed merely by changing routing. SQLite pruning does not erase native transcripts, provider copies or backups. Local storage also does not imply local inference; the configured model provider still receives the context supplied to it. These limits must be explicit in setup and deletion explanations.

## Rejected shortcuts

Returning an invented run ID would conceal a changed acknowledgement meaning. Moving the same raw stream to a separate agent would reduce ordinary-chat growth but weaken continuity unless context were deliberately shared. Adding only a timer without durable jobs would still lose work across restart. Retrying every failed notification could duplicate an uncertain send. A fixed sequence of gentle, harsh and third-party messages would replace the user's requested intelligent adaptation with an unvalidated pressure ladder.

## Evidence boundary

The [system guide](../current-system.md) records what is implemented, tested, installed and physically observed at the current revision. Historical October 14 foundation results remain scoped to that source and configuration. The decision itself does not establish native SDK support, compatibility of the installed Android build, successful phone background operation, automatic reply linkage or behavior change.
