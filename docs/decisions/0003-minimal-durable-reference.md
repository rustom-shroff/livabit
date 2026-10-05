# ADR-0003: Device-local durable state and direct delivery

Date: 2026-10-03. Revision: 0.2. Status: accepted in the user's approved Phase 1/2 baseline 0.2. Concrete protocol refinements remain subject to G1 agreement.

## Context

The project supplies software and a protocol, not an activity-delivery service. A sleeping or disconnected phone can lose delivery opportunities. Reliability must fit local storage, battery, consent and existing agent receiving capabilities.

## Decision

Store grants, permitted aggregates, credentials, outbox, retry checkpoints and diagnostics on the device. Local transactional persistence supports recovery and consent fencing. Proposed activity limits remain 24 hours/4 MiB per recipient; local diagnostics 7 days/1 MiB per installation. No cloud database, queue or operator backend.

Send directly to the chosen agent's verified receiver. M1 uses a final local mock recipient; M2 proves the real path, including pairing and renewal, without forwarding infrastructure. Best-effort delivery may lose records and exposes gaps.

Disconnect completes locally while offline and stops affected future operations. Remove remote synchronization and consent leases. Optional host cleanup is best effort; in-flight requests and already-delivered copies cannot be recalled.

## Alternatives and consequences

Memory-only state fails restart evidence. Hosted relays improve reachability but violate the user's operational/business constraint. Free hosting, public proxies and user-hosted bridges retain that disallowed dependency. Embedded local storage provides persistence without an operator.

The device can evict expired/overflowed records; receivers tolerate gaps, duplicates and lateness. Android can delay sends despite network availability. Retry logic cannot solve missing host onboarding.

Related requirements: OAP-FR-008/010/012, OAP-NFR-002/003/007/009, OAP-PR-004/006/008. Areas: PA-03/04/05/07/08. Evidence: AC-04/11/18/19/20/27/29.
