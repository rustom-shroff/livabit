# Product requirements

**Current product direction, 2026-10-14:** [ADR-0024](../docs/decisions/0024-personal-agent-behavior-change.md) makes liveabit a source of evidence for the user's ongoing personal agent, with rich host-owned context, questions about feelings, contextual persuasion and reconsideration after repeated attempts. The existing OpenClaw main agent owns this relationship; Workboard is one source of context. Behavioral judgment is model-owned. Durable observations, factual summaries, explicit permissions and delivery mechanics belong to the host runtime. Use the existing companion chat first and keep automatic accountability emails disabled.

The [personal-agent specification](personal-agent-intervention.md) defines separate PA functional/privacy/nonfunctional requirements and PA acceptance cases. Its first implementation scope is a bounded inbox, summary/query, episode/context tools, restrictive stored-decision notification and tested live-host migration. Implemented source remains separate from tests and actual installed behavior. Full conversations, repeated-attempt adaptation, automatic post-admission processing recovery and usefulness require their own evidence. This direction creates no standalone coach or forwarding service and changes no OAP packet semantics or existing Android evidence. All 33 OAP requirement IDs and 29 AC cases remain stable; no M2/M3 completion is claimed.

## Preserved integration evidence

The following dated results describe earlier implementations. Their agent/channel choices are historical; ADR-0024 governs current personal-agent work.

**Previous POC route, 2026-10-13:** [ADR-0021](../docs/decisions/0021-task-aware-liveabit-agent.md) targeted the dedicated liveabit agent and shared Workboard personal tasks. [ADR-0023](../docs/decisions/0023-openclaw-companion-reminders.md) replaced WhatsApp reminders with local notifications through the official OpenClaw Android companion. Sender 0.11.0 and OAP semantics remained unchanged. Native command acknowledgement, physical notification display and useful task coaching are separate evidence.

**Phone confirmation, 2026-10-11:** The user reported that both WhatsApp connection-check messages arrived with a notification. [Confirmation](../docs/review/openclaw-phone-notification-2026-10-11.md). Use the existing tested 0.6.0 APK for the [real-activity phone trial](../docs/integration-drafts/openclaw-phone-pilot.md); its bytes are unchanged.

Version: baseline 0.2 with agreed OAP 0.1.0 refinements and user-authorized POC progression. Active update: **2026-10-11**. [ADR-0010](../docs/decisions/0010-collector-accepted-and-chatgpt-dots-priority.md) accepts the collector; [ADR-0018](../docs/decisions/0018-existing-main-agent-context.md) selects existing main and the server-owned canonical conversation. The [verified 0.5.0 baseline](../docs/review/openclaw-main-agent-2026-10-11.md) retains 37 native checks, actual admission and separate main output; no previous-chat import is claimed. WhatsApp is linked/connected. Sender 0.6.0 clarifies local replies and separately authorized selective nudges, and passed all 37 native checks; [review](../docs/review/openclaw-whatsapp-2026-10-11.md). The user-owned Sol 6.1 choice completed a separate operator run; medium is verified inherited configuration without direct effort telemetry. WhatsApp returned a provider message ID for the explicit self-chat check, preserving agent/model settings. Phone receipt and notification for the checks are user-confirmed; selective coaching remains unproved. Initial full 0.6.0 attempts returned live-hook HTTP 5xx after 36 passes; the final exact APK passed all 37 checks. Earlier failures retain their unconfirmed cause. A separate main-agent policy/native-message check succeeded, without independently establishing phone display/read or goal-grounded coaching. The user subsequently confirmed receipt and notification display for the connection checks. Context stays in OpenClaw. Preserve earlier evidence; accuracy/coverage and Linux remain deferred. Production M2/M3 retains its full scope.

## Purpose and boundaries

The personal-agent product supports voluntary behavior change within the user's existing relationship with their assistant. Activity can prompt reflection or inquiry, rather than just task reminders. User-supplied values, commitments, constraints, feelings and intended leisure can shape advice. The agent decides whether to remain silent, encourage, persuade, follow up or revise its interpretation. A measured fact, a user report and a model hypothesis must remain distinguishable. Personal support does not depend on creating an open task, and a packet does not prove that support is needed.

**Open Activity Protocol (OAP)** lets any compatible personal agent receive and interpret activity signals. Initial signals describe smartphone application usage. The provider knows sharing permissions and delivery settings; it does not need the user's goals, private memories, or a judgment about whether usage is excessive.

The optional **liveabit Skill** guides interpretation using available host context. Dedicated-agent 0.4.0 and main-agent 0.5.0 each have their own observed output evidence. Main's existing workspace/configuration is reused, but old chats or private-goal use are not inferred from the new canonical conversation. The Skill transfers no goals or memories to the provider.

The user owns OpenClaw's model/thinking settings; migration and activity setup preserve those choices. The current design moves explicit channel/timing/permission checks into the runtime rather than depending only on a Skill. The first foundation does not by itself prove that delivery enforcement is complete. Missing personal context remains unknown, and the agent can ask the user in the companion chat when useful. Chat delivery, notification invocation, phone display, user reply and usefulness require separate evidence. Connected-gateway reachability is required; offline notification recovery remains unverified.

An activity provider runs on the user's device, collects and aggregates observations, and sends permitted signals directly to the chosen agent's receiving infrastructure. A replaceable on-device adapter maps OAP to a verified host-supported integration. A personal agent chooses whether and how to coach. An optional future enforcer has a separate authorization boundary and is excluded from the initial release.

**Hard operating constraint:** liveabit must require no project-operated, separately user-hosted, or free-tier intermediary backend, relay, proxy, broker, tunnel, consent server, or forwarding service. Local aggregates, consent, credentials, and the bounded outbox remain on the device. A receiver may be part of the user's existing chosen agent runtime or provider infrastructure. It cannot be a separately maintained bridge that forwards to an agent. Delivery is best effort; there is no delivery SLA. An unsupported agent integration remains unsupported until a direct path is verified.

## Initial use cases

| ID | User outcome | Phase and limit |
| --- | --- | --- |
| UC-01 | Connect a chosen agent and select the device, applications, fields, and cadence it may receive | Simulated in M1; real connection in M2 |
| UC-02 | Receive retrospective, locally aggregated usage information without exporting screen or message contents | M1 simulator, M3 Android |
| UC-03 | Recover retained information after a connection interruption and identify any missing history | M1; bounded recovery, no indefinite delivery promise |
| UC-04 | Pause sharing, narrow permissions, or disconnect one agent without disconnecting others | M1; device controls arrive in M3 |
| UC-05 | Have an existing agent use standing instructions to offer an appropriate alternative, respect leisure, or stay silent | M2; requires a supported host and user instructions |
| UC-06 | Replace the collector or transport with another platform implementation | Core design at M1; additional implementations later |

The initial release is for voluntary use by an adult controlling their own device and agent account. Workplace monitoring, parental surveillance, shared-device attribution, medical treatment, and coercive controls require separate product and privacy reviews.

The accepted collector remains the isolated [inspection app](android/local-inspector.md), with [0.2.4 evidence](../docs/review/android-local-development-0.2.4.md). The separate [native sender](android/test-publisher.md) implements saved agent selection and mapped main delivery while preserving nullable estimates/unknown coverage. The [guide](../docs/integration-drafts/openclaw-direct.md) separates verified 0.5.0 from the dedicated-agent baseline. No new account, purchase or accuracy experiment is needed to continue. Changed APKs still need their own emulator checks; 0.5.0 has met that gate. Preserve historical [Grok](../docs/research/grok-bot-webhook-feasibility-2026-10-08.md), [Muse](../docs/review/meta-muse-direct-dialogue-2026-10-08.md) and [ChatGPT](../docs/research/chatgpt-dots-integration-2026-10-07.md) work.

## Functional requirements

| ID | Requirement | First evidence |
| --- | --- | --- |
| OAP-FR-001 | Publish an independently implementable, versioned activity contract with formal schemas, valid/invalid examples, and publisher/consumer interfaces | Phase 3, M1 |
| OAP-FR-002 | Require a user-approved monitoring grant before collecting for OAP or exporting activity; grants identify the user/device binding and recipient | M1 simulated; M3 OS permission |
| OAP-FR-003 | Let the user select application allowlists, permitted fields, event families, cadence, and retention separately for each recipient; requests cannot exceed the grant | M1 |
| OAP-FR-004 | Aggregate permitted application activity locally; default to retrospective window summaries; express observation coverage and uncertainty | M1, validated on Android at M3 |
| OAP-FR-005 | Use immutable event identities/bodies for retransmission, explicit observation and publication times, and platform-namespaced application identities without a mandatory Android field | Phase 3, M1 |
| OAP-FR-006 | Define discoverable capabilities and recipient-scoped, filtered subscriptions with idempotent creation/renewal and finite lifetimes; keep authority on-device and map controls only to mechanisms actually supported by the selected direct host profile | M1; host mechanism M2 |
| OAP-FR-007 | Distinguish receipt, valid consumption, and host/user response; expose safe delivery health, stale data, and permanent errors | M1; host evidence M2 |
| OAP-FR-008 | Retain a bounded on-device outbox and replay history across process restart/reboot; retry transient network failures with backoff and jitter, resume within limits, coalesce catch-up, and report expired/overflowed history without promising eventual delivery | M1; reboot M3 |
| OAP-FR-009 | Allow duplicates and out-of-order arrival; provide identities and ordering metadata so consumers can deduplicate and avoid treating late activity as current | M1 |
| OAP-FR-010 | Support pause, revocation, and permission narrowing at the authoritative on-device consent store; immediately stop new reads, sends, and retries after the local change commits, persist that state across restart/reboot and while offline, and disclose that in-flight/already-received data cannot be recalled | M1; reboot M3 |
| OAP-FR-011 | Evaluate MCP Events as a conditional replaceable direct host profile; select it only after verifying endpoint onboarding, authentication, subscription/control lifecycle and device-originated delivery without intermediary infrastructure; preserve OAP semantics outside MCP | M1 conditional fixtures; real host M2 |
| OAP-FR-012 | Provide a reproducible on-device publisher simulator and deterministic direct receiver that demonstrate authorization, local subscription state, publication, recovery, consumption, and revocation without AI calls or intermediary infrastructure | M1 |
| OAP-FR-013 | Provide optional liveabit Skill guidance for existing host context, uncertainty, intentional leisure, alternatives, quiet periods, and interruption budgets | M2, Phase 5 |
| OAP-FR-014 | Demonstrate direct delivery to a real eligible personal-agent host executing user-provided standing instructions without transferring goals or private memories into the provider; a separate API coach or forwarding backend does not satisfy this gate | M2 |
| OAP-FR-015 | Retain the accepted isolated Android usage-access collector/local inspection baseline: manual selected-package reads, bounded diagnostics, separate inspection consent and unknown coverage. Develop the native sender against the selected existing OpenClaw agent and server-owned conversation mapping under ADR-0018, preserving host instructions/context/configuration, nullable estimates, selected-app controls, protected pairing and admission limits. No goals or chat history are copied into the provider. Preserve legacy agent setup/queued bytes and require consent to switch recipients. Do not require further accuracy/coverage proof first; verify every changed phone-trial APK on the emulator. Extend into production only with the accepted Windows baseline, reviewed Android mapping and compliant M2 path; report permission loss, unavailable observations and unsupported environments | Accepted local TASK-P6-F02; authorized native POC TASK-P5-001/002 and TASK-P6-F04; production publisher and measured M3 remain separate |
| OAP-FR-016 | Keep all device-modifying actions unavailable in the initial capability catalog; future restrictions require separate capabilities, explicit authorization, and feasibility/policy review | M1 negative checks; future expansion |

## Nonfunctional requirements

| ID | Requirement | Verification boundary |
| --- | --- | --- |
| OAP-NFR-001 | Core schemas and interfaces must require no provider SDK, proprietary agent behavior, or OS-specific lifecycle | Independent deterministic consumers at M1 |
| OAP-NFR-002 | Keep the reference system to one simulated on-device publisher/adapter process with embedded durable state and one direct deterministic receiver; require no hosted dependency, external database, broker, forwarding process, or model service | M1 |
| OAP-NFR-003 | Bound event sizes, publication rate, retries, history, and memory/disk growth; suppress unchanged/empty windows and batch catch-up without model-per-observation execution | M1 load evidence |
| OAP-NFR-004 | In the healthy local reference environment, achieve publication-to-valid-consumption p95 <= 2 seconds across 100 accepted summaries; exclude window collection time and real-host/OS latency | M1 deterministic benchmark |
| OAP-NFR-005 | Detect unsupported major versions and malformed data before consumption; define additive compatibility, negotiated capabilities, and recovery behavior | Phase 3, M1 |
| OAP-NFR-006 | Maintain stable traceability from every requirement to component, protocol area where relevant, task, and acceptance evidence | All phases |
| OAP-NFR-007 | Publish repeatable setup/demo instructions and test outputs with exact dependencies; accept recorded Windows reference evidence for current M1 progression; defer Linux extensibility and require actual Linux verification before claiming Linux support | Windows M1; Linux deferred by ADR-0008 |
| OAP-NFR-008 | Measure Android data quality, collection delay, battery impact, and OS/OEM limits; publish supported configurations and avoid a universal near-real-time promise | M3 |
| OAP-NFR-009 | Require no intermediary infrastructure maintained or funded by the project operator or separately by the user, including a free-tier backend, relay, proxy, broker, independent tunnel, remote consent authority, centralized activity logging, or intermediate upload/forwarding endpoint; only the device and the user's chosen agent infrastructure may handle activity delivery | Architecture/source/configuration audit at M1 and real path at M2 |

## Privacy and security requirements

| ID | Requirement |
| --- | --- |
| OAP-PR-001 | Retain, aggregate, or export only approved usage fields. Filter incidental broader OS metadata immediately in local memory before OAP state or diagnostics. Exclude screen contents, messages, keystrokes, passwords, URLs/browsing history, location, and unrelated personal information |
| OAP-PR-002 | Authenticate the device and chosen agent endpoint using the vetted selected profile; enforce its applicable issuer/audience/expiry/scopes plus device/recipient binding on every access and dispatch; isolate recipients; use agent-provided pairing/OAuth only where supported, without a new liveabit OAuth server |
| OAP-PR-003 | Protect deployment traffic with TLS, profile-appropriate integrity/replay checks, and destination/SSRF protections; cloud destinations reject private/reserved addresses; an explicitly configured authenticated local-agent endpoint may use a narrowly permitted private LAN destination; isolate insecure localhost simulator tests from deployment profiles |
| OAP-PR-004 | Retain the minimum data for the approved duration; provide local deletion and recipient disconnection with honest limits for data already received by third parties |
| OAP-PR-005 | Treat labels and payloads as untrusted data, never instructions or authorization; reject unsafe fields and hostile/incompatible payloads |
| OAP-PR-006 | Keep credentials and signing secrets out of events, logs, fixtures, and source control; protect persistent state and rotate credentials |
| OAP-PR-007 | Show collection permission, sharing grants, effective scope, expiry, pause/revocation state, last delivery, gaps, and retention without exposing activity in routine diagnostics |
| OAP-PR-008 | Require fresh on-device consent to widen scope; fail closed on unknown/corrupt local consent state, denied OS access, expired grants, or unusable endpoint credentials; network loss never changes or postpones local revocation |

## Approved initial operating defaults

These are approved engineering defaults, not thresholds for unwanted use. [OAP 0.1.0](protocol/oap.md) supplies the agreed exact semantics and limits.

| Parameter | Proposed baseline |
| --- | --- |
| Observation | Per-application foreground-duration summaries in non-overlapping 15-minute windows; empty windows suppressed |
| Publication | At most 4 fresh summary events/hour/recipient; recipient may choose a slower cadence; sessions/live updates deferred |
| Payload | Maximum 16 KiB OAP event; maximum 64 KiB catch-up read batch; oversized summaries require documented pagination/coarser aggregation, never silent application loss |
| Retained history | Maximum age 24 hours and maximum 4 MiB/recipient, whichever expires first; explicit gap on eviction |
| Grant/subscription | Default 24-hour finite lifetime; renewal never expands consent; renewal must remain within the monitoring grant |
| Consent authority | On-device durable state; pause/revocation immediately blocks new reads, sends and retries, including offline; no remote lease or pending remote grant synchronization |
| Retry | At most 6 attempts per delivery cycle; exponential backoff with jitter; honor retry hints within expiry; offline recovery/replay uses a new bounded cycle |
| Delivery destination | One explicitly selected authenticated endpoint in the chosen agent infrastructure per recipient/profile; no intermediary fallback |
| Delivery guarantee | Best effort within bounded storage, authorization and retry limits; expose receipts, timeouts, deduplication horizon and gaps; no eventual-delivery or production latency SLA |
| Agent interruption | User/host-owned policy; liveabit Skill suggests quiet periods and a user-selected budget. The provider neither infers unwanted usage nor stores coaching goals |

Fifteen-minute windows define aggregation granularity, not an Android wake-up guarantee. Window delay, notification delay, host wake frequency, and model cost must be reported separately. A transport receipt is not evidence of agent evaluation or user notification. Disconnection or local deletion cannot recall an in-flight request or erase copies already in an agent host. Retention deadlines derive from original observation/window times, not retry, renewal, or replay time; shorter user-selected limits also govern underlying local aggregate/checkpoint state.

Suppress re-publication of the same unchanged window, not different windows that happen to contain equal durations. This preserves chronology without invoking a model per raw observation. Bounded publication reduces opportunities for host wakeups; it does not guarantee the host's model cost or batching behavior.

## Explicit exclusions

No proprietary AI coach, private memory import/export, engagement scoring, addictive-use diagnosis, universal assistant wake API, global assistant interoperability claim, real-time Android guarantee, raw activity stream by default, content inspection, advertising analytics, accessibility blocking, device-owner provisioning, or automatic restrictions. No intermediary hosting, billing-funded delivery service, or free-tier/self-hosted bridge workaround in any phase. No universal promise that third-party agent subscriptions or AI usage are free or unlimited. The collector is accepted for continued development; Grok Bot is the chosen target with the intent to use its lowest eligible plan. The user has no account and no purchase is authorized or needed for local development; actual webhook entitlement remains unobserved. Neither a paid API agent nor an assumed upgrade substitutes for the requested personal Bot. Further duration/coverage proof is deferred; production Android publication remains separate from the current local inspector and needs a functioning compliant direct integration.

## Success and approval

M1, M2, and M3 have separate evidence gates in [acceptance criteria](acceptance-criteria.md). [ADR-0008](../docs/decisions/0008-windows-baseline-and-android-integration-priority.md) preserves the Windows progression acceptance and Linux deferral. [ADR-0009](../docs/decisions/0009-android-local-inspection-first.md) authorizes the native local collector/inspection before actual agent selection or integration. It establishes neither M2 nor M3 and makes no APK-build, device or Linux pass claim. The [review brief](../docs/review/phase-1-2.md) records the original baseline; the [Phase 3 review](../docs/review/phase-3.md) records agreement to the concrete contract refinements.

Under [ADR-0010](../docs/decisions/0010-collector-accepted-and-chatgpt-dots-priority.md), pairing and synthetic delivery used to prove M2 may proceed before M2 is complete. Acceptance of the collector changes progression, not reported evidence or OAP wire semantics. Continue to label unknown/partial observations truthfully. Further accuracy investigation is deferred and can resume when practical use identifies a problem; it is not a prerequisite for current integration work.

[ADR-0014](../docs/decisions/0014-resume-grok-bot-direct-webhook.md) returns the first target to Grok Bot and resumes protected local synthetic setup. The [plan/webhook refresh](../docs/research/grok-bot-plan-and-webhook-refresh-2026-10-08.md) separates primary-source facts from the lowest-eligible-plan webhook inference and actual untested entitlement. Local single-attempt tests prove their recorded local scope only; native HTTP 200 is receipt/run-start, not valid OAP consumption. A real attempt needs supported account access and exact protected destination/recipient setup. Native receipt/auth differences, receiver admission/ledger and same-device direct evidence still need review before production sending or profile selection. MCP Events remains conditional. Preserve all Muse/dots work and frozen Grok evidence without relabeling it.
