# Product requirements

Version: baseline 0.2 with agreed OAP 0.1.0 refinements and user-authorized Android local inspection priority. Date: 2026-10-03; G1/Windows progression acceptance: 2026-10-04; current priority: 2026-10-05. These are agreed requirements, not universal runtime success. [ADR-0008](../docs/decisions/0008-windows-baseline-and-android-integration-priority.md) accepts the Windows reference and defers Linux; [ADR-0009](../docs/decisions/0009-android-local-inspection-first.md) supersedes its parallel work priority with the local Android collector/inspection first. Actual agent selection/integration is deferred until local findings. The [contract agreement](../docs/review/phase-3.md) and [reference evidence](../docs/review/phase-4.md) retain separate decisions and results.

## Purpose and boundaries

**Open Activity Protocol (OAP)** lets any compatible personal agent receive and interpret activity signals. Initial signals describe smartphone application usage. The provider knows sharing permissions and delivery settings; it does not need the user's goals, private memories, or a judgment about whether usage is excessive.

The optional **liveabit Skill** teaches compatible agents to interpret those signals using context available in the agent host. Its public name is fixed; the prepared local package and synthetic scenarios are retained, with actual host packaging and behavior still to be verified.

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

The current development step is an isolated [Android local collector and inspection app](android/local-inspector.md), before agent choice or M2. A user selects exact packages, grants Android usage access separately, starts local inspection, switches apps and returns to request a manual read. Bounded activity stays in RAM; Stop, a fresh Start, scope changes and process restart clear it. No network, export, recipient grant, credential or background collector is present. Diagnostic intervals retain unknown source coverage and are not validated OAP summaries or complete M3 evidence.

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
| OAP-FR-015 | Build the isolated Android usage-access collector and local inspection before selecting/integrating an agent; keep manual selected-package reads and bounded diagnostic observations local, with separate inspection consent and unknown source coverage. Extend it into an OAP publisher replacing simulation only after the accepted Windows M1 baseline, local findings and a compliant M2 path; report permission loss, unavailable observations and unsupported environments | Local preparation TASK-P6-F02 before M2; production publisher and measured pass at M3 |
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

No proprietary AI coach, private memory import/export, engagement scoring, addictive-use diagnosis, universal assistant wake API, global assistant interoperability claim, real-time Android guarantee, raw activity stream by default, content inspection, advertising analytics, accessibility blocking, device-owner provisioning, or automatic restrictions. No intermediary hosting, billing-funded delivery service, or free-tier/self-hosted bridge workaround in any phase. No promise that third-party agent subscriptions or AI usage are free. The local Android collector/inspection proceeds first; agent choice is deferred and a production publisher remains gated by the real direct integration.

## Success and approval

M1, M2, and M3 have separate evidence gates in [acceptance criteria](acceptance-criteria.md). [ADR-0008](../docs/decisions/0008-windows-baseline-and-android-integration-priority.md) preserves the Windows progression acceptance and Linux deferral. [ADR-0009](../docs/decisions/0009-android-local-inspection-first.md) authorizes the native local collector/inspection before actual agent selection or integration. It establishes neither M2 nor M3 and makes no APK-build, device or Linux pass claim. The [review brief](../docs/review/phase-1-2.md) records the original baseline; the [Phase 3 review](../docs/review/phase-3.md) records agreement to the concrete contract refinements.
