# Proposed Workspace Agent native trigger profile

Date: **2026-10-04**. Status: **proposed, unselected, unimplemented**. Tentative identifier: `openai-workspace-agent-trigger-v1`. This is a concrete amendment proposal for review, not an enabled OAP profile or a pilot result. No source adapter, token, account action, new agent, or AI call has been created.

The target must be the user's **existing published ChatGPT Workspace Agent** with suitable established instructions/context. It is a distinct surface from an OpenAI dot and from a new Platform API coach. The current official endpoint is `POST https://api.chatgpt.com/v1/workspace_agents/{agtch_id}/trigger`, with required string `input`, optional `conversation_key`, and retry `Idempotency-Key`. It durably queues and returns `202`; beta status observation is optional. [Official API](https://developers.openai.com/workspace-agents/trigger-runs)

## Scope and invariants

Only one immutable `activity.summary` page is submitted per trigger request. The OAP 0.1.0 activity body, window/page identities, sequence, scope revision, original times, and positive-duration/coverage semantics remain unchanged. No content, goals, private memory or coaching response is stored on the device. No device action or restriction authority is added.

All device-local consent fences, offline pause/revocation, narrowing/purge, original-age retention, page/byte limits, four-fresh-events/hour/recipient ceiling, bounded retry cycles and backpressure remain in force. Native API invocation, status polling, or provider batching cannot bypass them. A native acknowledgement never extends event/grant/credential expiry. [Core contract](../../specs/protocol/oap.md), [authorization](../../specs/protocol/authorization.md), [delivery](../../specs/protocol/delivery.md)

Activity goes from the device to the chosen agent's native provider endpoint. No project service/account, shared token, public proxy, user forwarding server, third-party tunnel, intermediate upload or centralized activity log is introduced. Missing host capability leaves the profile unavailable.

## Minimal required amendments

| Current requirement | Proposed native treatment | Exact review/change surface |
| --- | --- | --- |
| Authenticated `{base}/capabilities` and OAP admission registry | Manual verified pairing to an existing published API channel, with a reviewed native capability manifest and actual account eligibility evidence. Do not create a fake capabilities endpoint or claim provider-side OAP admission. | Separate profile pairing/capability rules; add profile ID to [capability schema](../../schemas/oap/0.1.0/capabilities.schema.json) and `DeliveryProfileId` in [interfaces](../../specs/protocol/interfaces.ts). Define what actual evidence substitutes for the profile's native capability check without changing existing direct H4. |
| Opaque device/recipient-bound bearer | Workspace Agents scoped token represents a workspace user and that user's allowed agent operations. Local device/channel binding restricts this publisher but does not narrow the server authority of a stolen token. | Explicit A5 host-native policy and disclosure; protected credential metadata; verified issuance/expiry/reissue/revocation. Existing direct H3/A5 binding requirements remain intact. Broader authority requires explicit review; it cannot be silently treated as conforming. |
| Receiver admission for a narrowed/new scope epoch | Native API documentation does not expose an OAP scope-admission registry. Local narrowing still purges and rotates the epoch, but cannot establish host rejection of an old scope or captured old body. | Explicit A3/A5 native admission treatment or proof of a supported existing-host admission mechanism. Body identifiers, agent instructions and client filtering cannot be reported as server-enforced authorization. |
| Matching `200` durable-valid-consumption receipt | Native `202` is tagged **queued transport acknowledgement**. It is not a `ValidConsumptionReceipt`, and beta completion is not OAP validation or ledger evidence. | Add a tagged delivery result/interface and selected-profile publisher path; update status/conformance/fixtures as necessary. Existing direct H5 and `ValidConsumptionReceipt` stay unchanged. `last_valid_consumption_at` is not set by native success. |
| Direct-profile errors and recovery | Map the documented native errors and unknown outcomes explicitly; preserve bounded local recovery. | Native error table below; a distinct profile implementation and fixtures. Never reinterpret native `409` as an OAP body conflict. |

The current executable publisher accepts only the three direct profile IDs, demands receiver capabilities, and records successful receipt as consumption. It must reject this proposed profile until the amendment is explicitly reviewed and enabled. A native success object must not be made to resemble the current receipt merely to reuse that path. The [integration plan](../agent-integration-plan.md) identifies CP-HOST-01/02/03/05 and the associated review sequence.

OAP's receiver-side immutable conflict/group/expiry and durable ledger requirements remain additional compatibility obligations. A tagged native queue result does not waive them. Before claiming a conforming receiver, establish those properties in the actual existing host; otherwise any weaker native treatment needs an explicitly reviewed amendment and a precise limitation. The liveabit Skill currently requires host-admitted, protocol-validated summaries and a validated ledger; transport queueing alone does not satisfy its invocation premise.

## Manual pairing and authority

Before activation, the user identifies the actual existing agent, workspace and API channel. The saved agent must be published/runnable and shared with the token owner. Workspace admins must enable Workspace Agents and personal-token creation; the token must have the Workspace Agents scope. A Platform key or Codex-only token is insufficient. [Setup example](https://developers.openai.com/cookbook/examples/chatgpt/workspace_agents/workspace-agents-api-trigger), [authentication](https://developers.openai.com/workspace-agents/authentication)

Protected local pairing records hold the verified provider origin, exact channel path, recipient/stream/epoch references, credential handle and real issued expiry. Tokens are obtained through the existing host's secure setup, never placed in activity, source, chat, logs, fixture files or command-line arguments. Channel identifiers are non-secret but remain recipient-isolated local configuration; event fields and response links cannot change them. Reviewed documentation supplies no non-executing OAP capability/admission preflight. No blind trigger is used as an authentication probe; any later synthetic trigger itself requires approved pairing, consent, scope and budgets.

Scoped personal tokens must expire; examples include 7/30/60/90 days. [Token lifecycle](https://learn.chatgpt.com/docs/enterprise/access-tokens) **This proposal does not relax the current 30-day maximum.** Use a real known issued lifetime of at most 30 days unless a separate explicit authentication amendment is approved. A shorter local use deadline does not shorten a 60/90-day issued credential. No undocumented automatic refresh endpoint is invented. Token scope, expiry enforcement, old-token rejection, sharing removal, device/recipient/channel isolation and narrowing limitations require actual evidence before selection.

Native token rotation follows provider reissue/update/revoke setup. Device-local disconnect removes its credential and purges payloads offline before reporting success; remote token revocation remains independent. A per-device token name alone is not server-enforced device binding. If a token can trigger other agents, that residual authority must be disclosed and accepted or this route remains unavailable.

## Input, destination and response handling

The native `input` contains profile-owned constant framing and the canonical unchanged OAP page serialized as data. Any permitted labels/extensions remain untrusted data, never instructions. The final framing, native string/UTF-8 byte limit, wrapper overhead and supported response shape must be pinned before implementation. Do not treat the host's message input as a schema validator or advertise OAP compatibility that it does not expose.

Pair only the fixed official `api.chatgpt.com` HTTPS origin and exact `/v1/workspace_agents/{paired_channel}/trigger` path. Verify TLS, validate public DNS/connected peer addresses on each connection, reject every redirect, and preserve bounded connect/request/response limits. Keep existing SSRF and secret-redaction safeguards. Returned conversation URLs are optional observed UI references, never delivery destinations or automatic fetch instructions. Optional beta polling uses only the locally paired channel and the validated returned run ID; it cannot read unrelated runs or create a second activity submission.

Choose a recipient-isolated conversation-key strategy during pairing. A stable key can continue that agent conversation, but the selection cannot merge unrelated recipients or consent epochs or imply complete paginated windows. Every page retains its own event ID and key. No idempotency key, native run ID or conversation key authorizes collection or changes immutable OAP identity.

## Queue acknowledgement and bounded recovery

Proposed local handling of a well-formed native `202`: atomically mark that event transport-acknowledged, stop further automatic publication of the acknowledged event, retain only bounded correlation/status metadata, and preserve existing original-age payload/history expiry. Do not set consumption, evaluation or notification timestamps. Any locally recorded OAP event ID identifies the submitted request; it is not a provider attestation that the server validated that event ID/body/scope.

Use the same profile-scoped idempotency key for retries of the same unchanged event. The guide documents original-outcome reuse, but does not give its retention horizon or changed-body conflict rules. Until those are established, an ambiguous lost acknowledgement must remain unknown and require attention rather than claim safe indefinite retry. A conservative one-attempt synthetic observation is possible only after profile approval; it does not prove the required dedupe/recovery horizon. Native transport exceptions must be reconciled explicitly with OAP acceptance cases before the route can be declared supported.

The API cannot retrieve the final answer. Beta states are queued, in-progress, suspended, completed and failed; terminal failure categories distinguish dispatch and run failure. [Status reference](https://developers.openai.com/workspace-agents/trigger-runs) Run completion neither proves validated OAP consumption nor promises a notification. Observe interpretation/output in the intended existing agent separately, using only an explicitly authorized destination. Accepted work can run later; an OAP expiry or later local revoke cannot recall an already queued provider request. The liveabit Skill must interpret age/coverage conservatively, with that host behavior recorded as observed guidance rather than a platform TTL guarantee.

| Native outcome | Proposed local treatment |
| --- | --- |
| Valid `202` | Queued transport acknowledgement only; no consumed/evaluated/notified claim. |
| `401` | Stop affected attempts; credential requires attention/reissue. |
| `403` | Stop; account/agent authority denied. Do not try a broader/shared token. |
| `404` | Stop; missing/invisible trigger or run requires pairing review. |
| `409` | Stop this automatic cycle; channel/agent non-runnable. This is not `conflicting_duplicate`. |
| `429`, retryable server response, timeout/reset | Keep bounded backpressure/expiry and native idempotency rules; do not claim safe retry until the provider's applicable semantics are established. |
| Redirect, bad type/body/IDs, undocumented status | Reject redirect or classify unknown safely; never infer consumption or choose a new destination. |

Native request/input/concurrency/rate limits, safe response caps, beta availability and idempotency horizon are selection blockers. Do not infer them from Platform API limits or from the local reference benchmark.

## Context, notification and review questions

An API channel starts the saved agent's workflow; its own instructions, connected resources, permissions and approvals govern behavior. Workspace Agent memory is agent-specific and per-user; the sources do not establish dot-memory inheritance. [Agent memory](https://developers.openai.com/cookbook/articles/chatgpt-agents-sales-meeting-prep) Actual API-triggered context and appropriate silence/response need observation. A conversation link is not a notification guarantee. Device-local purge does not delete provider history, saved notes or output copies; actual host privacy/retention settings must be reviewed.

The concrete proposal above is ready for review; these selection/approval decisions remain pending, with no additional account action implied:

1. Is the user's chosen existing agent actually a published Workspace Agent with a runnable API channel and suitable established context, or is the intended agent a dot requiring the different Events path?
2. Can that account issue a known at-most-30-day Workspace Agents token, and is its broader server-side authority acceptable under an explicit A5 native-profile amendment?
3. Are receipt-only native delivery and the disclosed unresolved consumption/dedupe/context limits acceptable for the proposed profile, without weakening the current direct receiver contract or claiming M2 prematurely?
4. What actual input/rate/idempotency/privacy and output evidence will satisfy the selection blockers? Synthetic integration/development work is already authorized; activation still needs the actual host and reviewed profile.

Until those decisions and proofs exist, this profile remains proposed and disabled. No new agent or intermediary is created to make it selectable.
