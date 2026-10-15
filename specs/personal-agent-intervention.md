# Personal-agent intervention

Version: **0.2**. Updated: **2026-10-15**. Status: user-authorized product direction under [ADR-0024](../docs/decisions/0024-personal-agent-behavior-change.md), extended by [ADR-0025](../docs/decisions/0025-durable-activity-analysis.md) for durable analysis and an isolated activity session. This document defines requirements; implementation, local tests, installation, physical observation and usefulness are separate evidence levels in the [current system guide](../docs/current-system.md).

The product helps the user's continuing personal agent support voluntary behavior change. The agent can ask about feelings, understand obstacles, relate activity to wider personal context and revisit its advice over time. OAP provides permitted activity facts; it does not decide what the user should do. The initial implementation uses the existing OpenClaw host and companion chat, retains the Android/OAP baseline and keeps automatic accountability emails disabled.

## Relationship and reasoning

The user's existing main agent owns the relationship, personal context and intervention history. Routine activity reasoning belongs in a separate activity session of that same agent, not a new coach persona or the ordinary main-chat transcript. Meaningful activity dialogue can grow over time; raw packet memory need not. Workboard remains the canonical shared task store, but open tasks are only one input. Relevant context can include user-supplied priorities, values, career plans, constraints, commitments, available energy, preferred support style, intended leisure and emotional state. Include sensitive details only when the user supplies or authorizes them and when they are relevant; do not assume that the host exposes all previous chats or memories. Session isolation requires explicit supported context/reply sharing rather than an inference that common agent identity makes every transcript visible.

The model decides whether an observation warrants conversation and what to say. Possible choices include silence, a factual reflection, a question about how the user feels, a concrete alternative, encouragement, a persuasive challenge, later follow-up or reconsideration. No application identity, elapsed-time threshold, task priority or fixed attempt count defines behavioral failure by itself. Explicit user preferences can set mechanical interruption limits; those limits are distinct from the model's interpretation.

For example, repeated use of an app during a stated focus period may invite: “How are you feeling about starting that application?” The answer might reveal intentional rest, fatigue, fear of rejection or a changed plan. The agent should use that answer to choose its next approach. It must not turn the observation into a claim that the user is lazy or that the app caused a particular feeling.

Persuasion should refer honestly to the user's own stated reasons and real circumstances. The agent can be persistent when the user has asked for persistence, while honoring a current refusal, pause or change of goal. After repeated unsuccessful attempts, reconsider the explanation and approach: ask about obstacles, make the next step smaller, change timing, offer another strategy or revisit whether the goal still matters. The model chooses the adaptation; the runtime does not escalate tone according to an attempt counter.

## State and evidence

| Record | Contents and purpose | Ownership |
| --- | --- | --- |
| Observation inbox | Permitted original OAP event, source/stream/event identity, hash, original window/expiry, received time and processing status | Deterministic host runtime |
| Factual summaries | Deduplicated per-app/window estimates, covered input ranges, unknown coverage, missing/truncated ranges and derivation version | Deterministic host runtime |
| Personal context | User-supplied statements, preferences and corrections with source, timestamp and explicit provenance | User-owned host; agent retrieves relevant records |
| Intervention episode | Referenced observations/context, the agent's interpretation, choice, rationale, proposed message, previous attempts and user responses/outcomes | Model-authored, durably recorded by runtime |
| Delivery record | Authorized channel/destination, reservation, invocation/acknowledgement, failure/uncertainty and timestamps | Deterministic host runtime |

An episode links related conversations and attempts; it is not a diagnosis or a declaration that behavior was undesirable. Observations, explicit user reports and model interpretations remain distinguishable. Corrections supersede earlier context without silently rewriting what happened. An outcome can remain unknown. No response does not prove agreement, failure, motivation or notification display.

The October 14 foundation covers durable observations, summaries, episode/context records, tools to retrieve or record them and a restrictive notification tool. The October 15 increment adds separately scheduled durable analysis, bounded recovery and activity-session isolation, subject to its own implementation and evidence. A record-writing tool alone does not prove scheduling, reply linkage, effective adaptation or dependable physical background notification.

### Foundation interface and limits

The following records the **October 14 foundation** and its dated verification. New scheduling, session and delivery behavior is governed by [durable analysis and conversation isolation](#durable-analysis-and-conversation-isolation) and the [current system guide](../docs/current-system.md). Historical main-session success or an offline guard is not a pass for a changed pipeline.

The October 14 plugin exposed the following four optional tools, confirmed in its dated [native verification](../docs/review/personal-agent-host-2026-10-14.json). Today's [plugin source](../integrations/openclaw/personal-agent/index.mjs) adds scheduling and changes trusted session access. Mechanical tool/hook checks are separate from positive-activity model execution or a real conversation.

| Tool | Foundation role | Limit |
| --- | --- | --- |
| `liveabit_context` | Return host-computed recent daily summaries, a referenced admitted event and recent episodes with their durable notification outcomes/reasons/timestamps | Bounded evidence retrieval; agent-authored decisions/reports remain distinct from runtime delivery evidence; no claim of complete daily activity or access to every old chat/personal memory |
| `liveabit_record_decision` | Record the model's choice, approach, rationale and optional prompt in an episode | Writes evidence only; sends no notification and schedules no follow-up |
| `liveabit_record_feedback` | Record a user report, observed behavior or delivery outcome with type/provenance | Agent-recorded report, not independent verification of feeling, display, reading or causality |
| `liveabit_notify` | Deliver the prompt from an existing question/nudge decision to the exact privately saved companion destination; runtime enforces freshness, quiet hours/cooldown and reserves one attempt atomically | Accepts a decision ID, never caller-selected text/destination; uncertain outcomes consume the interruption budget and are not retried; literal native acknowledgement is not physical display or reading |

The [notification source](../integrations/openclaw/personal-agent/notification.mjs) uses the native runtime's nodes interface under the private policy. Local evidence/delivery/configuration/installer suites pass; the live host loads the final matching source and all four tools. Native main-session context, decision, feedback and recall return HTTP 200, as does shared Workboard access. Foreign-session context is denied with HTTP 404. The notification guard returns `companion_unavailable` for the offline saved phone; no new phone delivery or reply loop is claimed. The authenticated hook persists a synthetic empty observation before HTTP 204 and starts no model run. The foundation creates no alternate channel, email sender, scheduled follow-up or offline notification queue. A replay with an already recorded decision cannot create another intervention; a still-fresh duplicate without a decision can proceed to native run admission after an earlier post-commit failure. The foundation does not automatically resume model work that failed after admission.

The first notification source limits a decision and its supporting observation window to a 15-minute useful lifetime, checks for a still-retained/unexpired event when referenced and conservatively counts reserved/uncertain attempts toward cooldown. This is a delivery freshness/safety budget, not a threshold declaring the user's behavior unwanted. Preference changes or missing timezone/destination authority must fail closed before dispatch.

Rich personal context remains in the existing agent's authorized conversation/native sources. These foundation tools are not a general personal-memory editor or complete context-correction interface. Setup adds no calendar or email connection; those sources are usable only if actually available and separately authorized. The [store source](../integrations/openclaw/personal-agent/store.mjs) separates raw packet expiry from bounded derived history and episode retention; replay must refresh neither. Its summary excludes overlapping and local-midnight-crossing windows rather than inventing proportional estimates. Installed settings and tested limits need separate evidence.

The enabled plugin registers retention cleanup at startup and every 60 seconds while valid settings and an available gateway allow its service to run; ordinary store operations also prune. The installed service is loaded, while physical deletion at every timer boundary is not independently claimed. Disabled plugin, invalid settings or a stopped/unavailable gateway can prevent scheduled cleanup; it resumes when those prerequisites are restored. The retention service schedules deletion, not behavioral follow-up or failed model-work recovery. The plugin has no email route, and the workflow disables automatic accountability email; preservation of main's unrelated native tools does not establish independent action-level isolation of every inherited outbound capability.

### Durable analysis and conversation isolation

Receipt must perform deterministic validation, duplicate/conflict checks and an atomic commit of both observation and analysis obligation before acknowledging durable acceptance. Do not claim model completion or invent a run identifier. An endpoint/acknowledgement migration must preserve the existing sender's truthful behavior until compatible setup/build support is verified. OAP event identities, original bytes, expiry and Android consent boundaries remain unchanged.

A host-local worker must coalesce bounded input, claim due work with an expiring lease and distinguish pending work, native run admission, terminal completion and retryable failure. A crash after acknowledgement cannot discard the review obligation. Late packets arriving during analysis remain pending. New packets cannot postpone already due work indefinitely. Retry uses finite backoff, attempt/resource limits and observable reasons; after an outage the model must reassess current retained evidence rather than replay old prompts. A recorded partial decision is not automatically a completed review. Jobs and coverage checkpoints must not create a permanent second copy of expired raw packets.

Use `agent:main:liveabit-activity` for background reasoning and meaningful activity dialogue while preserving the user's main-agent identity/model and ordinary `agent:main:main` chat. Activity input must not select an agent, session, model or destination. Main chat can use only explicitly exposed bounded evidence/reply mechanisms. A deliberately linked user report may request a new review; an ambiguous reply must not be guessed into an episode. No arbitrary ingestion of ordinary-chat, email or calendar transcripts follows from this specification. Existing authorized shared memory and Workboard can be queried through actual available tools.

A linked main-chat user report must atomically retire old unreserved queued/checking prompts with its review request; possible native effects keep their one-attempt ledger. A fresh trusted review can record a new choice citing an already-used factual event without weakening event-owner checks. Retries of the same review and legacy packet replay remain deduplicated. Do not force the model to omit evidence to adapt, infer a no-intervention choice from missing records, or retry a successfully completed run merely because it recorded no structured decision.

Model-selected follow-up must use a declared scheduling tool when installed; a free-text `followup` field is descriptive evidence, not a timer. Runtime bounds the schedule, prevents unbounded recursive work and honors current pause/permission settings. No mandatory behavioral threshold or fixed escalation algorithm is introduced.

The implemented execution budget requires a live scheduled review and its recorded decision, permits one idempotent follow-up request per review and at most three agent-requested follow-ups before fresh accepted activity or a deliberately linked main-chat report resets the count. Duplicate packets must not reset it. This budget bounds model work, not unwanted behavior, and is not a researched intervention dose. Trusted tool-call hooks must bind native run/call identity before activity tools act; missing, expired or replaced scheduled invocations cannot fall back to unrestricted legacy work.

An advisory reconsideration marker after two recorded questions/nudges since the latest reported benefit is a product heuristic, not an optimal researched dose or proof of failure. Earlier benefit cannot permanently suppress later reconsideration. Lifetime support/native-attempt counts remain separate; same-millisecond cross-table ordering is explicitly unknown rather than invented. The marker invites the model to rethink its approach; it must not determine tone, motives, emotional state or escalation. The [research discussion](../docs/research/personal-agent-behavior-change-2026-10-14.md) distinguishes promising mechanisms from evidence about sustained usefulness.

Background notification recovery is a separate stage. Known disconnection before invocation may wait within a bounded useful lifetime, with destination/permissions/preferences/freshness rechecked before dispatch. An uncertain invocation consumes its attempt and must not be blindly repeated. Stale decisions, policy changes, quiet hours or revoked permission must not be bypassed. Exact queue/retry semantics require source/tests and native evidence; no endpoint, scheduler or connection claim establishes physical phone display.

### Processing stages

1. The existing gateway authenticates the direct Android request. Bounded deterministic validation admits only permitted, supported observations; invalid or expired input cannot start an intervention. Record safe rejection categories without storing hostile payloads as personal context.
2. Commit accepted observations, immutable identity/hash and the pending analysis obligation together before claiming durable receipt. Identical retries contribute no additional usage; conflicting identities fail safely. Durable receipt, native run admission and completed reasoning remain different states.
3. A bounded host-local worker claims/coalesces due work and retrieves relevant activity, context, preferences and episodes for the same personal agent in its isolated activity session. Persistence does not imply a model call for every packet. Gaps, unknown estimates and overlapping windows remain visible.
4. The model records a structured choice and rationale. Silence is a valid choice. Suppression by an explicit preference, insufficient context, runtime failure and an agent decision to wait are different outcomes.
5. Before an authorized delivery, runtime code rechecks the current destination, permissions and interruption preferences and reserves the attempt atomically. Record acknowledged, failed and uncertain outcomes separately. Do not equate invocation success with phone display or reading.
6. Link replies and later outcomes when the host supports it and the user authorizes the workflow. Resume unfinished analysis after restart without replaying a stale intervention. Delivery retries require bounded useful lifetime and known transport semantics; an uncertain send cannot be blindly repeated.

These are required responsibilities. Tests and live evidence must identify which stages each implemented and installed revision actually covers. Mechanical recovery fixtures do not establish good psychological judgment; the [conversation evaluation plan](../docs/evaluation/personal-agent-conversation.md) supplies separate cases.

## Channel and control

Use the user's existing OpenClaw companion chat first for conversation, including questions about feelings and obstacles. Its installed capability must be inspected and exercised before claiming the agent can initiate a chat. A passive local notification may invite the user to open that chat; it remains a separate surface and carries no more personal detail than the user's preview preferences permit. Do not claim notification invocation is conversational delivery.

Automatic accountability emails are disabled. Contacting another person requires a later explicit user instruction identifying the intended recipient, purpose, content/privacy boundaries and delivery authority. Activity, repeated unsuccessful advice, old task text and a model's recommendation cannot enable email or another channel. The first increment creates no third-party accountability workflow.

Sharing controls on Android and support preferences in the host remain separate. Stopping device sharing fences new collection/sends; it cannot recall observations already received by OpenClaw. A host-side pause stops interventions while preserving only records allowed by its retention policy. The user can correct or remove personal context and change goals or preferred support style. Neither activity nor persuasion authorizes task mutation, worker dispatch or device restrictions.

## Functional requirements

| ID | Requirement | Implementation boundary |
| --- | --- | --- |
| PA-FR-001 | Use the user's existing continuing personal agent and host-owned relationship context; preserve unrelated instructions, tasks, model choices and capabilities | Main-agent migration and actual session evidence |
| PA-FR-002 | Persist accepted permitted OAP observations with immutable identity/hash and original time/uncertainty; distinguish durable admission, processing and rejection | First durable inbox increment |
| PA-FR-003 | Offer bounded retrieval and factual summaries without duplicate counting, invented complete coverage or an exclusive total across apps | First query/summary increment |
| PA-FR-004 | Record and retrieve relevant user-supplied personal context with provenance, time and corrections; distinguish reports from model hypotheses | First context-tool increment; conversational integration separately verified |
| PA-FR-005 | Let the model decide whether to stay quiet, inquire, encourage, persuade, follow up or reconsider using relevant evidence and standing instructions | Agent policy and observed dialogue |
| PA-FR-006 | Ask about feelings or obstacles when useful rather than infer them as facts from activity; allow the user to decline | Observed dialogue and scenario evaluation |
| PA-FR-007 | Record intervention episodes, prior attempts, user responses and unknown outcomes so later reasoning can reconsider the approach | First episode-tool increment; lifecycle/linkage separately verified |
| PA-FR-008 | Adapt after repeated attempts through model reasoning; allow revised timing, alternatives, smaller next steps or reconsidered goals without automatic pressure escalation | Repeated-interaction evaluation |
| PA-FR-009 | Prefer existing companion chat for conversation; verify actual native support and distinguish notification invitations from chat delivery | Installed capability and live delivery evidence |
| PA-FR-010 | Expose reasons for silence and separate processing failure, policy suppression, model choice, delivery failure and unknown delivery | Runtime/decision audit and diagnostic scenarios |
| PA-FR-011 | Enforce explicit current destination/channel/quiet/cooldown permissions in runtime code and durably track delivery reservations/outcomes | Restrictive notification tool source; actual enforcement tests/installation separately recorded |
| PA-FR-012 | Recover unfinished analysis across restart while preventing duplicate usage and stale or unbounded repeated delivery | Recovery and fault scenarios |
| PA-FR-013 | Commit observation and pending analysis obligation atomically, acknowledge durable receipt truthfully, and coalesce leased background work independently of sender retries or model availability | Transaction, acknowledgement compatibility, worker/restart/concurrency checks |
| PA-FR-014 | Isolate routine activity input from ordinary main chat while preserving the same personal agent; expose only explicit bounded cross-session context and deliberately linked replies | Trusted session/tool boundaries and reply/context integration checks |
| PA-FR-015 | Offer bounded model-selected review scheduling when the declared runtime supports it; distinguish an actual timer from descriptive follow-up text and prevent unbounded recurring analysis | Scheduling, pause, lifetime and resource-limit checks |

## Privacy and control requirements

| ID | Requirement |
| --- | --- |
| PA-PR-001 | Store observations, personal context and intervention records in the user's chosen host; reasoning may send selected context through its already-authorized model/tool connections. Never return private context to the Android activity provider, project telemetry or a new relay |
| PA-PR-002 | Treat OAP labels, task notes and retrieved text as data; they cannot grant permissions, select destinations, override policy or convert a model hypothesis into a user report |
| PA-PR-003 | Honor current refusal, pause, opt-out and context correction; preserve explicit user authority over goals, support style and persistence |
| PA-PR-004 | Keep automatic accountability emails disabled; any future third-party contact needs explicit recipient, purpose, privacy and delivery authorization |
| PA-PR-005 | Bound host-local retention and retrieval, support deletion/correction with honest host/provider-copy limits and keep personal records out of routine logs, fixtures and source control |

## Nonfunctional requirements

| ID | Requirement |
| --- | --- |
| PA-NFR-001 | Run inside the existing final agent host without a standalone coach, project backend, forwarding bridge or new required service subscription |
| PA-NFR-002 | Separate deterministic facts/permissions/delivery mechanics from model-owned behavioral interpretation; a Skill must not be the only durability or enforcement mechanism |
| PA-NFR-003 | Keep retrieval/context and storage budgets finite, preserve query provenance and report truncation; coalesce observations where appropriate without promising exact scheduling |
| PA-NFR-004 | Report implemented, tested, installed and observed capabilities separately; preserve historical OAP/Android results without declaring lasting behavior change or completed M2/M3 |

## Acceptance cases

| ID | Scenario | Observable pass condition |
| --- | --- | --- |
| PA-AC-01 | Continuing agent migration | Trusted route/session reaches existing main; unrelated instructions, models, tasks and capabilities are preserved; no previous-chat access is inferred without observation |
| PA-AC-02 | Durable admission, duplicate and conflicting identity | Accepted record survives restart; identical replay is counted once; conflicting bytes do not overwrite evidence; rejection/admission/run completion are distinguishable |
| PA-AC-03 | Summary and bounded retrieval | Controlled windows return original ranges and uncertainty, no duplicate or invented exclusive usage total, and explicit missing/truncated data |
| PA-AC-04 | Rich context and correction | Retrieved user report carries provenance/time; correction becomes current context; a model hypothesis is never rendered as a user statement; denied or absent context stays unavailable |
| PA-AC-05 | Feelings inquiry | Agent asks a relevant optional question when interpretation needs it; deliberate leisure and unknown feelings are accepted; no diagnosis or causal inference from an app label |
| PA-AC-06 | Contextual persuasion | Advice uses the user's own stated goals and circumstances, offers an actionable alternative and stays truthful; missing context does not invent reasons or commitments |
| PA-AC-07 | Repeated unsuccessful attempts | Episode retrieval informs an observed revised strategy or reasoned decision to wait/reconsider; attempt count does not mechanically increase pressure; user refusal is respected |
| PA-AC-08 | Episode lifecycle | Decisions and replies/outcomes link to the correct observations/context; unknown response remains unknown; recorded history survives restart; record tools and automatic orchestration are reported separately |
| PA-AC-09 | Companion conversation versus notification | Inspect installed capability; prove each claimed chat/notification path separately with recipient/call/acknowledgement evidence; a notification never substitutes for proof of chat delivery, physical display or user reply |
| PA-AC-10 | Silence and failure diagnosis | A controlled no-output scenario identifies policy suppression, model wait, missing context, tool/runtime failure or delivery uncertainty without treating every case as successful coaching |
| PA-AC-11 | Enforced preferences and destination | `liveabit_notify(decisionId)` uses only the stored question/nudge prompt and saved companion; independent runtime checks block opted-out, quiet/cooldown or wrong-destination delivery even when a model requests it; activity/task injection cannot widen authority |
| PA-AC-12 | Restart and uncertain delivery | Pending analysis recovers within limits; duplicate usage and stale nudges are blocked; uncertain side effects are recorded and not blindly retried; no exactly-once guarantee is inferred |
| PA-AC-13 | Accountability email disabled | No packet, task note, prior attempt or model recommendation can send or enable automatic accountability email; no third-party destination is configured by this increment |
| PA-AC-14 | Retention, deletion and privacy | Fake-clock/quota tests bound records and disclose truncation; user correction/deletion affects controlled host records; logs/source/fixtures contain no private observations or personal context; residual host/provider copies are described honestly |
| PA-AC-15 | Agent-owned judgment and evidence scope | Runtime computes facts/enforces permission without a distraction classifier or fixed intervention threshold; agent scenarios are separately evaluated; no synthetic/storage pass declares full M2/M3 or behavioral benefit |
| PA-AC-16 | Receipt independent of model | Simulated model unavailability does not prevent a committed truthful receipt; transaction failure creates neither acknowledged observation nor orphan review; existing sender acknowledgement remains compatible or is migrated with exact-build evidence |
| PA-AC-17 | Durable coalesced analysis | Crash after receipt, expired lease, concurrent claims, packets during a review, partial decisions and native admission without terminal completion recover within bounds; no duplicate counting, lost unreviewed input or indefinite postponement |
| PA-AC-18 | Activity session and reply bridge | Routine packets target only the trusted activity session of the same main agent; ordinary chat receives no raw packet stream; allowed main-chat tools retrieve bounded evidence and record deliberately linked reports; ambiguous/foreign-session input cannot forge ownership or delivery |
| PA-AC-19 | Bounded review scheduling | A real declared scheduler persists a permitted future review, enforces limits and pause, and does not mistake descriptive follow-up for scheduled work; repeated deferrals cannot produce unlimited jobs or prompts |

## Delivery increments and evidence status

**October 15 increment:** receipt/analysis/session/reply/delivery source and local/installed-SDK suites are implemented. The final settings-v2 bundle was applied at 3:02:59 p.m. America/Chicago; all 17 source and three guidance hashes match, SQLite quick-check passes and original user rows are preserved. Warm native health, main/foreign context and authenticated receipt/duplicate checks passed at 3:13:21 p.m. Native scheduled worker/model execution remains unproved. Sender 0.12 passed build/lint and all 97 exact-APK Android emulator checks, including both real reboots; physical legacy-hook migration remains pending. See the [processing review](../docs/review/personal-agent-processing-2026-10-15.md) for exact evidence and the unresolved seven-minute cold-start/readiness delay observed during concurrent development/emulator work. This is not a physical background delivery, full dialogue/adaptation or usefulness pass.

The final read-only warm-host observation passed: 30 regular health checks over a 29-minute span plus a healthy follow-up give 31 healthy checks spanning 31 minutes 47 seconds. SQLite integrity passed, original evidence counts stayed unchanged and no analysis/notification jobs were observed. This bounded observation does not close the cold-start investigation or prove native model execution or physical delivery.

**Historical October 14 foundation baseline:**

| Increment | Required evidence | Status at this specification revision |
| --- | --- | --- |
| Host-local foundation | Inbox/query/summary/context/episode/notification tests, source audit, install/configuration evidence and main-session routing check | Implemented/local tests pass; installed matching source, four registered tools, main context/record/recall, Workboard, session denial and empty-hook persistence exercised; no positive-activity model or full adaptation pass |
| Conversational support | Actual companion capability/delivery, feelings inquiry, user correction and episode linkage | Planned/partially assessable; no end-to-end pass claimed |
| Repeated-attempt adaptation | Multi-turn scenario results and observed changes in strategy under user preferences | Planned; storing episodes does not pass this increment |
| Deterministic delivery/recovery | Independent permission enforcement, delivery ledger, crash/offline/uncertain-send checks | One-attempt mechanics pass local fixtures; native offline-phone guard exercised without sending. Physical delivery and full recovery/queueing remain unproved/future work |
| Sustained usefulness | User-assessed relevance, burden and outcomes over time, with limitations | Future evaluation; no behavior-change guarantee |

The table above preserves the October 14 evidence baseline. The October 15 processing/delivery increment must be reported separately in the [current system guide](../docs/current-system.md); no new code inherits its predecessor's installed or physical evidence. See the [roadmap](../docs/project-roadmap.md#personal-agent-work) and [PA traceability](requirements-traceability.md#personal-agent-requirements) for work IDs and mappings. PA-AC-01 through PA-AC-19 supplement the 33 historical OAP requirements and 29 AC cases; they do not replace protocol conformance or complete historical milestones.
