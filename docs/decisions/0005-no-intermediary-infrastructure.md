# ADR-0005: No intermediary delivery infrastructure

Date: 2026-10-03. Status: **accepted constraint from the user's explicit instruction**. Protocol and implementation details remain proposed.

## Context

The user does not want to operate, maintain, subsidize or charge for an intermediary carrying activity from a user's device to their agent. Lower reliability is accepted; improve it within the device software.

## Decision

The activity path contains the device and the chosen agent's existing receiving infrastructure. No project-run server, hosted adapter, remote consent store, queue, broker, callback registry or delivery guarantee. Do not substitute free hosting, a third-party relay, required user-hosted forwarder or shared cloud credential.

The agent provider's own supported ingress is part of the destination. A receiver inside an existing local agent runtime can qualify; a desktop process merely forwarding to a different cloud agent does not. Verify topology and operator for every network destination.

All provider-side collection, consent, filtering, pending activity and retry state remain local and bounded. Use persistence, backoff/jitter, reconnection recovery, receipts where supported, deduplication and gaps. Accept that records may never arrive. Do not require billing or a delivery-service subscription. Existing agent plans and device/network arrangements are outside that promise.

## Consequences

Remove the previous hosted-adapter proposal and remote consent lease. MCP Events is conditional on compliant onboarding/control and delivery. Unsupported hosts remain deferred; an intermediary cannot be introduced as a routine implementation choice.

Related requirements: OAP-NFR-002/009, OAP-FR-008/010/011/014. Evidence: AC-04/11/22/27/28/29.
