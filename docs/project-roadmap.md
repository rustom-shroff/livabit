# Project roadmap and phase gates

Date: 2026-10-05. Revision: **0.6 user-authorized Android local inspection priority**. Phase 1/2 baseline 0.2 is approved; OAP 0.1.0 is agreed at G1. The accepted Windows reference remains sufficient for M1/G2 development progression; Linux extensibility stays deferred. Build the Android collector and local inspection first. Actual agent selection and integration are deferred until local findings inform that choice; the prepared optional liveabit Skill is retained. Actual M2/M3 remain unproven. [ADR-0009](decisions/0009-android-local-inspection-first.md) supersedes the parallel priority in [ADR-0008](decisions/0008-windows-baseline-and-android-integration-priority.md); the [October 4 priority review](review/priority-change-2026-10-04.md) retains the historical Windows acceptance evidence. No hosted delivery component may be introduced.

## Phase deliverables

| Phase | Deliverables | Exit evidence / dependency |
| --- | --- | --- |
| 1: Research and feasibility | docs/research/feasibility.md; current primary sources, capability comparison, limitations and initial strategy | Findings distinguish stable/documented/draft/unverified behavior; no runtime claims |
| 2: Product and architecture | Five specs, four diagrams, five ADRs, review brief, stable traceability and acceptance cases | G0: revised baseline 0.2 approved by the user's instruction to proceed |
| 3: OAP contract | specs/protocol/oap.md, transport profiles, formal JSON schemas, valid/invalid examples, interfaces, compatibility and error catalog; section-level traceability | G1: agreed contract covers all PA areas and planned ACs before reference code |
| 4: Reference implementation | Simulator, device-local publisher/outbox/adapter, direct final mock receiver, conformance suite, repeatable Windows demo; conditional MCP profile only if selected | G2/M1: accepted Windows reference scope; Linux held, no cross-platform claim |
| 5: Existing-agent integration and skill | Retain prepared optional liveabit Skill, capability matrix, native profile proposals and standing-instruction scenarios; select and pilot a host after local Android findings | Actual selection/integration deferred; G3/M2 still requires a real personal-agent direct lifecycle and observed behavior |
| 6a: Android collector and local inspection first | Current API/permission/policy research; isolated Java app with selected-package manual reads, local inspection controls, bounded RAM diagnostics and measurement plan | TASK-P6-F02 precedes actual agent selection/pilot; no networking, publisher, M2, physical-device, quality or release success inferred |
| 6b: Android publisher | Usage-access client, immediate local redaction/aggregation, recipient controls, compliant publication/outbox, compatibility/battery/policy report | Functioning compliant M2 path first; G4/M3 requires actual usage, measurements and approved quality budgets; no blocking |

Do not let Linux portability or an agent choice block the local Android collector. Its [specification](../specs/android/local-inspector.md) defines a manual, foreground, local diagnostic app before M2: no Internet permission, destination, credential, transport, export or background collection. Diagnostic intervals have unknown source coverage and are not validated OAP summaries. The full Android publisher replacing simulation and M3 still require a compliant direct real integration. Unsupported hosts remain deferred rather than trigger a hosted workaround. Enforcement stays optional and deferred. Revisit research before choosing SDKs, provider connection profiles or OS support.

## Planned tasks for traceability

TASK-P4-001..005 provide the accepted Windows reference. The [portable Linux handoff](linux-verification.md) is parked for later. TASK-P6-F02 is the current implementation priority, supported by TASK-P6-F01 research. TASK-P5-001 preparation is retained and actual TASK-P5-002 selection/pilot is deferred. The [dated direct-host follow-up](research/direct-host-follow-up-2026-10-04.md) retains a native Workspace Agent candidate without selecting a profile. Full Android publication TASK-P6-001..003 remains gated by actual M2. The [Phase 4 report](review/phase-4.md) maps test names and limits; the priority decision changes progression rather than inventing runtime evidence.

| ID | Work and output | Depends on |
| --- | --- | --- |
| TASK-P3-001 | Specify taxonomy/envelope/identities/time/metric/coverage; formal JSON schemas and valid/invalid fixtures (PA-01) | G0 |
| TASK-P3-002 | Specify local grants/filter configuration, supported pairing/authentication, consent boundaries, expiry and offline revocation races (PA-02/03) | G0 |
| TASK-P3-003 | Specify retry/error/receipt/ordering/deduplication/replay, retention/rate/size/batch limits and safe status (PA-04/05/08) | G0 |
| TASK-P3-004 | Specify direct reference and conditional host/MCP profiles; onboarding/control reachability, compatibility and conformance (PA-06/07) | G0 |
| TASK-P4-001 | Build simulator, local aggregation/redaction and device-local transactional consent/outbox/recovery | G1 |
| TASK-P4-002 | Build device-resident direct adapter; authenticate destinations, exercise pairing/lifecycle/errors; add MCP only if selected and compliant | G1 |
| TASK-P4-003 | Build independent deterministic final receivers and ordering/deduplication ledger | G1 |
| TASK-P4-004 | Build fault-injection conformance/security/performance suite with approval-revision evidence | Reference components |
| TASK-P4-005 | Document/run clean Windows setup and lifecycle demo; preserve M1 scope/limits and parked Linux handoff | Reference suite; Windows scope accepted |
| TASK-P4-L01 | Resume clean Linux lifecycle/portability verification before offering Linux support | Deferred until user reprioritizes or Linux release planned |
| TASK-P5-001 | Retain tested liveabit Skill guidance and synthetic scenarios/rubric; revisit supported host packaging after local findings; no goal/memory transfer | Accepted Windows baseline; actual host packaging deferred/conditional |
| TASK-P5-002 | Retain capability/profile preparation; later prove eligible real-agent direct onboarding, credential issuance, delivery, renewal/disconnect and host context/control/notification; publish M2 report | Deferred until TASK-P6-F02 local findings inform host choice; chosen existing host and supported setup required for actual run |
| TASK-P6-F01 | Maintain Android API/security/background/policy feasibility, conservative collection/coverage model and physical-device trial plan | Accepted Windows baseline; supports the local collector first |
| TASK-P6-F02 | Build/test isolated local Android collector and inspection app: selected packages, separate inspection consent, manual foreground reads, RAM-only diagnostics, Stop and conservative uncertainty | Accepted Windows baseline + [local collector specification](../specs/android/local-inspector.md); no agent choice or M2 prerequisite |
| TASK-P6-001 | Extend the locally inspected collector into an OAP publisher with immediate redaction, validated aggregation/coverage, no pre-consent export | M1 + compliant M2 + local findings |
| TASK-P6-002 | Build local recipient controls, persistent offline consent, bounded outbox and direct outbound recovery; no remote authority/lease | M1 + M2 |
| TASK-P6-003 | Measure OS/OEM/profile/data-quality/background/battery behavior; review Play disclosure; approve thresholds/support matrix and publish M3 report | Android client |

## Required demonstration evidence

At M1, save the approved revision, Windows setup, fixtures, configuration, commands and report. Show direct final-recipient delivery, isolated scopes, network loss/restart, duplicates, malformed records, gaps and offline revocation. Capture topology/destinations proving absence of forwarding infrastructure. Preserve accepted limits and Linux's deferred/untested status. Receipt and consumption remain separate.

For TASK-P6-F02, save source/tool revisions and exact JVM, build and device outcomes separately. Check selected-package redaction, consent horizon, permission loss, clock/scope/lifecycle races, Stop, process restart, unknown coverage and bounded observations. Inspect source and the eventual merged APK manifest for absent networking, inventory and enforcement. An APK or synthetic JVM fixture does not establish physical behavior or complete AC-25/26, M2 or M3.

At M2, record host/account eligibility, supported direct pairing/control path, actual scoped credentials, adapter/skill versions, device-to-agent destinations, host-owned standing instructions and observed response. Test renewal, receipt ambiguity and offline local disconnect. No project or user forwarding service may carry activity. A new API-runner agent cannot substitute for the existing-agent milestone.

At M3, retain M1 lifecycle/security cases and replace synthetic observations with device data. Save API level/OEM/profile/permission configuration, known-session fixture, coverage/errors/latency distributions, battery trials, policy findings, and selected support matrix. Approval of numeric quality thresholds is needed before calling the milestone complete.

## Change control

The revised Phase 1/2 baseline and OAP 0.1.0 are already agreed; do not request those approvals again. The [Phase 3 review](review/phase-3.md) records G1, including the disclosed AC-05 refinement. No phase authorizes hosting a bridge. Public distribution/restrictions remain outside current work. Requirements, ADRs, tests and evidence revisions change together. See [CONTRIBUTING.md](../CONTRIBUTING.md).
