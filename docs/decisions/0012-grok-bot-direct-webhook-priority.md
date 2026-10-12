# ADR-0012: Prioritize the direct Grok Bot routine webhook

Date: **2026-10-08**. Status: **accepted route priority by the user's explicit answer: “Prioritize the direct Grok webhook”**.

The first product remains the user's existing Grok Bot on the base plan under [ADR-0011](0011-grok-bot-first-integration.md). Prioritize its documented direct routine webhook instead of waiting for custom MCP Events support. Retain the MCP research, the dots research and all historical evidence. This is a distinct native integration; do not advertise it as MCP Events compatibility or claim AC-28 passed.

The [primary-source follow-up](../research/grok-bot-webhook-feasibility-2026-10-08.md) establishes a provider-issued POST URL, bearer authorization, JSON input and a 200 acceptance/run-start report. The producing device can be the outbound client; no inbound phone server, desktop forwarder, external tunnel or project infrastructure is required. Endpoint ownership, account eligibility and actual behavior still need verification.

Build an isolated **synthetic-only, single-attempt connection probe** and its [pilot packet](../integration-drafts/grok-bot-webhook-pilot.md) now. It uses fixed synthetic observations, exact protected pairing, HTTPS certificate/peer validation, public-address checks, synchronous local permission fences, finite local setup deadlines and bounded waits. It accepts no private activity payload and makes no automatic retry. After uncertain submission, stop for reconciliation rather than assume idempotency. An already received 200 is receipt/run-start evidence only, never a valid OAP consumption receipt or observed evaluation.

An explicit test-only local TLS variant may exercise a final owned mock with synthetic data. It is not a forwarding bridge, live account or selectable production profile. The probe does not change the approved `DirectAdapter`, publisher state, wire schemas or profile enums. An actual protected account setup is required before any live probe; this decision authorizes no purchase, upgrade, on-demand spending or credential disclosure.

Before a production integration, review the actual native receipt/auth/capability differences, finite key lifetime/rotation/revoke behavior, receiver admission/ledger, payload limits, cost-aware cadence and observed existing-Bot behavior. A local send deadline is not provider-enforced key expiry. A bare webhook and natural-language Skill instructions do not establish deterministic validation or durable deduplication. See [AC-22/23/24/29](../../specs/acceptance-criteria.md).

Collector acceptance, deferred precise-duration/coverage investigation and Linux hold remain. Unknown coverage stays unknown. The local-only Android inspector and tested APKs remain unchanged; production publication is separate, and any changed phone-trial APK still needs its exact-byte emulator gate. M2/M3 are not passed by this decision or by mock tests.
