# Phase 3 contract review

Contract prepared: 2026-10-03. OAP 0.1.0 agreed: 2026-10-04. The user's “i like what i see proceed to next steps” approved revised Phase 1/2 baseline 0.2. After the contract review, “ok keep going if there is no further input required from my side” agreed to this contract, including its disclosed AC-05 refinement, and authorized Phase 4. Specification agreement preceded implementation.

## Result

The protocol now defines one retrospective summary family, formal schemas, examples, typed provider/consumer interfaces, local authorization/subscription rules, direct delivery profiles, bounded recovery, compatibility and safe errors. All 33 requirements reference concrete sections/artifacts; all 29 acceptance cases map to 37 conformance cases. A separate catalogue names 22 structural/semantic/context predicates.

The no-intermediary constraint is unchanged and mandatory. Device consent, aggregation, storage and retries stay local; the destination belongs to the existing chosen agent. Neither this contract nor an installed liveabit Skill establishes that a commercial host can receive these events directly.

## Read in order

| Artifact | Purpose |
| --- | --- |
| [OAP contract](../../specs/protocol/oap.md) | Event, time, metric, coverage, pages, capabilities, versions |
| [Authorization](../../specs/protocol/authorization.md) | Device approval, scope changes, offline disconnection and supported pairing |
| [Delivery](../../specs/protocol/delivery.md) | Persistent state, immutable replay, budgets, expiry, gaps and health |
| [Direct receiver profile](../../specs/protocol/profiles/direct-https.md) | Proposed receiver interface with authenticated outbound discovery and delivery |
| [Conditional MCP Events](../../specs/protocol/profiles/conditional-mcp-events.md) | Full direct-lifecycle gate; candidate, no compatibility claim |
| [Schemas](../../schemas/oap/0.1.0/activity-summary.schema.json), [fixture manifest](../../examples/oap/0.1.0/example-manifest.json), [interfaces](../../specs/protocol/interfaces.ts) | Machine-readable contract and positive/negative examples |
| [Errors](../../specs/protocol/errors.md), [conformance](../../specs/protocol/conformance.md) | Exact rejection/recovery rules and milestone evidence |
| [ADR-0006](../decisions/0006-immutable-finalized-summary-pages.md) | Simplification of projections and multi-page semantics |

## Agreed concrete choices

| Choice | Effect / trade-off |
| --- | --- |
| Finalized windows are immutable; no corrections or replacement projections in 0.1.0 | Simple deduplication and no double counting; narrowing discards old-stream pending history, late source observations are omitted. G1 agreement accepted this disclosed refinement to AC-05 |
| Up to 128 selected apps, 32 per page, 15–60-minute interval | More than 32 apps requires slower sharing; all pages share the four-fresh-event/hour budget. Unsupported scope fails visibly |
| Original window-start deadlines; history age must exceed its interval | Retry/renewal cannot make older observations appear fresh; short retention leaves less delivery opportunity |
| Canonical JSON and safe integer counters | Same logical body has a stable identity across adapters; strict serialization avoids ambiguous duplicates |
| Direct HTTP reference uses two routes and receiver-issued scoped credentials | No inbound device service, hosted consent or invented consumer-agent API; actual receiver setup must support its binding/renewal |
| Four active recipients, one subscription each, bounded control/cursor/operation state | Predictable on-device storage/work; more recipients need a later reviewed profile |
| Six attempts per cycle and independent persistent fresh/read/cycle budgets | Reconnect and delayed catch-up cannot spin or evade limits; delivery may still expire or exhaust |

These are engineering choices, not distraction thresholds or promises of notification frequency. Payload field maxima still require an actual UTF-8 byte check; overflowing groups are visibly suppressed rather than truncated. Empty/unavailable windows do not imply zero usage. Already-dispatched or receiver-held data cannot be recalled by local disconnection.

## Validation evidence

The offline [artifact checker](../../scripts/validate-spec.mjs) validates every schema against Draft 2020-12, resolves references locally, asserts date formats, checks all declared examples against structural/static predicates, evaluates synthetic grant/binding/group cases and audits local document links plus requirement/AC mappings. [Reproduction instructions](../../scripts/README.md) and the [saved result](phase-3-validation.json) identify exact dependencies, environment, outcomes and input hashes.

These checks demonstrate consistency of the contract artifacts. They do not prove a running publisher/receiver, persistent revocation races, actual TLS/destination enforcement, recovery, runtime quotas, latency, Windows/Linux M1 portability, real-agent M2 or Android M3. Subsequent runtime evidence is reported separately in the [Phase 4 review](phase-4.md); the historical Phase 3 result retains its original inputs and limits.

## Agreement and implementation gate

G1 agreement established the protocol/acceptance baseline, including the AC-05 refinement. The original Phase 4 gate required Windows/Linux evidence from one simulated device process with embedded local state and a separate final deterministic mock receiver. On 2026-10-04, the user accepted the Windows evidence for progression and deferred Linux under [ADR-0008](../decisions/0008-windows-baseline-and-android-integration-priority.md). No real AI, Android app, bridge deployment or agent credentials were needed for the accepted reference scope. MCP remains conditional until an eligible complete direct path is proven. M2 cannot be replaced by a new API coach or forwarding service.

| Item | Decision | Evidence |
| --- | --- | --- |
| Revised Phase 1/2 baseline 0.2 | User approved | Explicit instruction to proceed, 2026-10-03; recorded in [prior review](phase-1-2.md) |
| Phase 3 contract 0.1.0 | User agreed; G1 satisfied | Instruction to keep going after the contract review, 2026-10-04 |
| Phase 4 reference | Windows scope accepted for progression; Linux deferred and untested | [Runtime report](phase-4.md), [accepted priority amendment](priority-change-2026-10-04.md) |
| Existing-agent integration and Android feasibility | Local preparation proceeds in parallel | [Preparation review](phase-5-preparation.md); actual M2/M3 runtime gates remain unsatisfied |
