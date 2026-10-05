# ADR-0002: Local retrospective summaries by default

Date: 2026-10-03. Revision: 0.2. Status: accepted in the user's approved Phase 1/2 baseline 0.2. Concrete protocol refinements remain subject to G1 agreement.

## Context

Usage metadata is sensitive, Android background execution is constrained, and raw app-lifecycle events can generate excessive traffic and model wakes. Usage duration is not proof of distraction. See [Android feasibility](../research/feasibility.md#android-observations-and-execution-limits).

## Decision

Keep raw permitted observations on the provider/device. Publish locally computed retrospective application-duration windows with coverage/measurement metadata and per-recipient redaction. Propose 15-minute windows and at most 4 fresh summaries/hour/recipient, with slower user-selected cadences. Suppress empty/unchanged windows. Do not emit denied-application counts or totals.

Defer completed-session and live-update families to a separately justified extension. Phase 3 must define boundary splitting, missing observations, overlap, replay identities, and oversized-summary handling. Aggregation is technical, not coaching: neither window size nor rate limit expresses excessive usage.

## Alternatives and consequences

Raw remote events offer reconstruction flexibility but expose more behavior and increase traffic. Remote aggregation makes the server responsible for sensitive raw history. Session updates enable faster context but add precision, ordering, battery, and wake costs. A daily total alone is economical but limits timely interpretation.

Local windows balance these concerns without promising an OS wake cadence. They may arrive late and may overlap in measurement across apps. Data coverage must be explicit. Optional lower-precision sharing can improve privacy, but cannot reveal excluded apps through residual totals. Aggregates and pending delivery stay on the device, then go directly to the agent; remote aggregation is excluded from the selected architecture.

Related requirements: OAP-FR-003/004/005, OAP-NFR-003/008, OAP-PR-001/004. Planned areas: PA-01/05. Evidence: AC-03/07/12/25/26.
