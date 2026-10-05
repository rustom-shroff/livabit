# ADR-0006: Immutable finalized summary pages

Date: 2026-10-03. Status: accepted through G1 contract agreement on 2026-10-04. Refines the approved baseline 0.2; it does not change the mandatory direct topology.

## Decision

OAP 0.1.0 exports only locally aggregated `activity.summary` pages. A finalized recipient-specific window has one identity and cannot be corrected, projected under a new ID or republished in this initial version. Permission narrowing purges the old stream's retained/queued windows, then future observations use a new epoch. Retries keep canonical bodies/identities unchanged.

An approved roster of at most 128 apps is partitioned into up to four pages of at most 32 apps. Every page counts toward the same four fresh events per rolling hour. Larger rosters require a visibly slower interval; absent pages remain unknown. Whole-window conclusions require complete consistent groups. Oversized actual data causes visible suppression/error, never silent field/app loss. Empty windows and unavailable observations use local health rather than another event family.

## Rationale and consequences

This keeps consumer interpretation and deduplication small enough to implement independently while honoring the accepted bandwidth and privacy limits. It deliberately loses some eligible pending history on scope changes and ignores late observations for an already finalized window. Correction/replacement semantics can be added only with a separately reviewed version and explicit handling to avoid double counting.

The approved Phase 2 AC-05 allowed fresh-ID projections if they could not double count. The agreed OAP 0.1.0 contract defers that optional behavior entirely and makes the simpler purge rule normative. The [updated acceptance criteria](../../specs/acceptance-criteria.md) and [Phase 3 review](../review/phase-3.md) disclose this refinement and record subsequent G1 agreement.

Canonical JSON plus SHA-256 establishes a comparable event body across adapters. TLS and receiver-issued credentials provide the selected direct profile's authentication/integrity; this ADR invents no signing protocol or hosted service. [OAP P2–P5](../../specs/protocol/oap.md#p2-representation-and-schemas)
