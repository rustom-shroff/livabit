# Phase 1 and 2 review brief

Date: 2026-10-03. Revision: 0.2 approved baseline. **The user approved this revised package and progression to Phase 3.** No intermediary infrastructure remains mandatory.

## Revised direction

OAP activity goes directly from the user's device to the chosen agent's existing receiving infrastructure. The device owns consent, aggregation, protected credentials, bounded pending activity and retries. The project supplies software and protocol/skill documentation; it operates no activity-delivery service and requires no delivery-service subscription.

This replaces the earlier hosted adapter, remote consent synchronization and 20-minute lease. Local disconnect now stops affected future sends and retries even while offline. Delivery is best effort; stale data, gaps, ambiguous receipts and expiry are explicit.

A free cloud tier, public proxy, third-party tunnel or required user-hosted forwarding bridge is not an alternative. Receiving code inside an existing local agent runtime may qualify because it is the destination. Provider-owned ingress may qualify where actually supported. [Accepted ADR-0005](../decisions/0005-no-intermediary-infrastructure.md)

MCP Events is now conditional. Its discovery/subscription/refresh path must work as well as its outbound callback. OpenAI-owned private connectivity is a research candidate; Android runtime, events, eligibility and distribution are not proven. No host gets a compatibility claim solely because it accepts webhooks in some other integration. [Feasibility](../research/feasibility.md#direct-delivery-without-an-intermediary)

## Package

| Artifact | Focus |
| --- | --- |
| [Product requirements](../../specs/product-requirements.md) | 33 stable requirements; hard no-hosting requirement; revised direct lifecycle |
| [Architecture](../../specs/system-architecture.md) | Four diagrams with device and final recipient only; local reliability and consent |
| [Privacy/security](../../specs/privacy-security.md) | Local state, direct destination authentication, granular sharing and deletion |
| [Acceptance criteria](../../specs/acceptance-criteria.md) | 29 planned cases; direct topology audit and separate milestones |
| [Traceability](../../specs/requirements-traceability.md) | Requirements to components, planned areas, tasks and evidence |
| [Roadmap](../project-roadmap.md) | Six phases without an intermediary deployment |
| [ADR-0001](../decisions/0001-independent-oap-mcp-adapter.md) | Independent OAP; direct reference and conditional MCP |
| [ADR-0002](../decisions/0002-local-summary-aggregation.md) | Local retrospective summaries |
| [ADR-0003](../decisions/0003-minimal-durable-reference.md) | Device-local persistence and best-effort direct delivery |
| [ADR-0004](../decisions/0004-host-owned-agent-context.md) | Host-owned goals/context and optional liveabit Skill |
| [ADR-0005](../decisions/0005-no-intermediary-infrastructure.md) | Accepted operational/business boundary |

## Assumptions and resolutions

| ID | Assumption / uncertainty | Resolution and evidence gate |
| --- | --- | --- |
| A-01 | A real existing agent has compliant direct receiving, onboarding and renewal | Prove the complete path in TASK-P5-002 / AC-22. Preferred host compatibility is unverified; do not add a bridge |
| A-02 | Standing instructions and relevant existing context reach event-triggered work | Supply instructions in the host and observe AC-22/23; never import private memories |
| A-03 | Proposed 15-minute windows/cadence are useful at acceptable device/host cost | Engineering proposal, no distraction threshold or wake guarantee; user can select slower sharing/notification |
| A-04 | Proposed local history is sufficient | Bound to 24 hours/4 MiB per recipient, or shorter consent limits; original ages persist; explicit gaps; AC-11/12/19 |
| A-05 | Offline controls can immediately stop future sharing | Sole consent authority is on device; persist/fence operations and clear affected queue/credentials. Host cleanup is optional; in-flight/already-received data cannot be recalled |
| A-06 | A chosen MCP profile works through direct/provider-owned ingress | Prove full lifecycle and selected result shapes, Android/runtime suitability and distribution eligibility; AC-28/29; conditional candidate, not default support |
| A-07 | Android metadata represents the selected metric accurately | Report coverage/overlap; immediate filtering and consent clipping; real measurements before M3 |
| A-08 | Gemini/Claude can provide compliant direct existing-agent paths | Native MCP/scheduling documentation alone does not prove phone reachability or inbound wake; mark unverified/deferred |
| A-09 | Open-source licensing and host-side data handling are appropriate | Select software/spec licenses before public distribution; disclose destination host retention; no project hosting/operator decision |
| A-10 | Android scheduling/accuracy/battery meet acceptable budgets | Measure, choose supported matrix and approve numeric thresholds before M3 |

A-01/02 are real-host prerequisites. A-03/04 are approved engineering defaults for protocol formalization, not measured product results. A-05 follows the accepted direct topology. A-06/08 are feasibility obligations that cannot be resolved by hosting a relay. A-07/10 prevent unsupported Android claims. A-09 concerns distribution and the destination, not a delivery business.

## Review status

The user said “i like what i see proceed to next steps,” approving revised baseline 0.2 and authorizing Phase 3. Do not request that approval again or relax the no-intermediary boundary. The specification-before-implementation process still applies. [Phase 3 review](phase-3.md) records concrete refinements and artifact evidence; reference runtime and Android remain unstarted.

Language, local storage library, optional package identifiers and licenses remain later choices. There is no hosting-provider choice to make. No deployment, new cloud account or API credential is needed for this documentation revision.

| Item | Reviewer | Decision | Date | Notes |
| --- | --- | --- | --- | --- |
| No intermediary delivery infrastructure | User | Accepted | 2026-10-03 | Explicit instruction; best-effort delivery accepted |
| Phase 1/2 proposal 0.1 | User | Superseded | 2026-10-03 | Hosted adapter/remote consent direction replaced; was never approved |
| Revised proposal 0.2 technical details | User | Approved | 2026-10-03 | “i like what i see proceed to next steps”; Phase 3 authorized |

Revision 0.2 documentation checks pass: 33 unique requirements and traceability rows, 29 unique acceptance cases, 14 task definitions, 43 local links, five ADRs and four Mermaid source diagrams. Independent review found no remaining hosted-delivery requirement. These are document checks; protocol conformance, direct real-host and Android runtime tests remain unrun.
