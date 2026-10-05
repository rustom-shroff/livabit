# Direct OpenAI host research follow-up

Date: **2026-10-04**. Status: **research only; no host profile selected**. This additive note follows the [2026-10-03 feasibility research](feasibility.md). It records current official documentation and remaining proof under the accepted no-intermediary constraint.

**Open Activity Protocol (OAP)** remains the activity protocol. **liveabit Skill** remains the optional agent skill name. Phase 5, that skill, and a real-agent integration are **not implemented**. No account-specific onboarding, pilot, live credential, personal context, Android, or host-response test was performed. This note changes no specification, approval, acceptance criterion, or milestone gate. M2 evidence still requires the user's chosen **existing** personal agent; a newly built API coach is not a substitute. Current implementation evidence remains in the [Phase 4 review](../review/phase-4.md).

## Two distinct existing host surfaces

An existing **dot** has documented inbound event support through MCP Events. A published **ChatGPT Workspace Agent** has a separate native API trigger. These are different products, identities, context boundaries, and onboarding mechanisms. Availability of one does not establish access to the other.

| Existing surface | Documented input | Context boundary |
| --- | --- | --- |
| Dot / Work Cloud | User-requested MCP event monitoring; the host supplies a webhook callback after subscription. | A dot uses selected conversation context, relevant ChatGPT memory, and saved notes. Background tasks do not automatically receive every conversation. Connecting a source alone does not start monitoring. [Tasks and memory](https://learn.chatgpt.com/docs/dots/tasks-and-memory) |
| Published Workspace Agent | Native HTTPS trigger into a saved agent's API channel. | Saved instructions, connected context, app permissions, and approvals control the run. The API example warns against assuming current chat, channel, thread, or document context. [Official trigger example](https://developers.openai.com/cookbook/examples/chatgpt/workspace_agents/workspace-agents-api-trigger) |

Workspace Agent memory can maintain per-user notes across that agent's sessions; it is not shared across users. This does not establish inherited dot notes or general personal ChatGPT memory. [Workspace Agent memory](https://developers.openai.com/cookbook/articles/chatgpt-agents-sales-meeting-prep)

## Dot route: Events plus a complete control path

MCP Events is documented for dots, Work web chats, and desktop Work with Cloud selected. It requires MCP 2.0 / `2026-07-28`. The authenticated MCP endpoint must handle discovery and `events/list`, `events/subscribe`, and `events/unsubscribe`. ChatGPT supplies callback and signing material; the publisher verifies the callback before sending signed events. Finite subscriptions are refreshed by another host-to-publisher `events/subscribe` call. The integration supports webhooks, excluding draft polling, streaming, and `gap`/`terminated` controls. [MCP Events](https://developers.openai.com/plugins/build/mcp-events)

The full required path is:

1. The existing host discovers and authenticates the device's MCP endpoint.
2. The user asks that host to monitor the approved activity event.
3. Host control calls create, refresh, rotate, and stop the subscription on the device.
4. The device posts permitted events directly to the verified host callback.

Step 4 alone is insufficient. A private or sleeping phone still needs supported reachability for steps 1–3, including after reconnect and restart.

**Secure MCP Tunnel is a provider-owned candidate for that control path.** OpenAI operates its ingress; an outbound `tunnel-client` forwards queued MCP requests to the private server and returns responses. Setup requires a tunnel ID, runtime key, Platform permissions, ChatGPT workspace association, and a healthy client. The guide supports private/developer connections but expressly excludes public plugin distribution. OAuth discovery can traverse the tunnel; the authorization server is not automatically tunneled. [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)

Inference: a tunnel client integrated into the same device boundary could avoid project infrastructure. The reviewed documentation does **not** establish Android packaging/background lifecycle, Events-through-Tunnel compatibility, or the complete device-local authentication and refresh path. A separate desktop/server forwarder or public proxy remains excluded. Public distribution cannot be inferred from private testing. Neither successful tool retrieval nor streamed MCP responses would prove subscription lifecycle support.

## Workspace Agent route: native provider HTTPS

The current guide documents:

- `POST https://api.chatgpt.com/v1/workspace_agents/{agtch_id}/trigger`.
- Required string `input`; optional `conversation_key` to continue the same agent conversation.
- `Idempotency-Key` reuse for retries of the same source event, returning the originally accepted outcome.
- `202 Accepted` with a conversation link after durable queueing.
- Beta run-status polling when `OpenAI-Beta: workspace_agent_runs=v1` is used; final response retrieval is unavailable through the API.
- `401` for unusable credentials, `403` for denied agent access, `404` for invisible/missing trigger or run, and `409` for a non-runnable agent/channel. These are host meanings, not OAP error meanings. [Trigger API](https://developers.openai.com/workspace-agents/trigger-runs)

This is a real provider endpoint for an existing saved agent, distinct from the Platform Responses API. Eligibility requires Workspace Agents enabled, a published runnable API channel, and the agent shared with the token owner. The API channel identifier is different from the agent identifier. [Official setup example](https://developers.openai.com/cookbook/examples/chatgpt/workspace_agents/workspace-agents-api-trigger)

Inference: HTTPS from the device to this native endpoint can fit the two-party topology without a liveabit relay. It is not an OAP receiver by default: the documented input is message text, not an advertised OAP version, schema, authorization registry, or valid-consumption interface. An existing Workspace Agent qualifies for consideration only if it is actually the user's chosen personal agent and has suitable established instructions/context. No such selection or capability is presumed here.

## Authentication and receipt mismatches

Workspace Agents uses its own workspace access token; a Platform key or Codex-only token does not establish this access. Admins must enable Workspace Agents and personal-token creation. [Authentication](https://developers.openai.com/workspace-agents/authentication) Scoped personal tokens must expire; documented choices include 7, 30, 60, and 90 days, with a minimum custom window of one day. Tokens belong to their creator/workspace and can be revoked through workspace controls. [Access tokens](https://learn.chatgpt.com/docs/enterprise/access-tokens)

The agreed [reference authorization](../../specs/protocol/authorization.md#a5-receiver-authentication-and-pairing) and [direct profile](../../specs/protocol/profiles/direct-https.md#h3-transport-and-authentication) require known issued expiry, at most 30 days, and receiver-enforced device/recipient/scope binding. A 7- or 30-day native token may fit the lifetime ceiling if its actual issuance and expiry are established; 60/90-day issuance does not. Locally stopping use after 30 days does not shorten the credential's issued validity. The reviewed host documentation does not establish per-device/per-recipient issuance, entropy, restriction to one API channel, or OAP scope-epoch admission. A selected channel ID in local configuration is not a server-enforced token restriction. A future provider-native profile may review different authentication semantics; none is implicitly enabled by this note. Receiver credentials also cannot authorize device collection or extend local consent.

MCP webhook `2xx` means receipt with asynchronous processing. The host can batch events and receive them out of order; its documented event limit is 256 KiB. [Webhook receipt](https://developers.openai.com/plugins/build/mcp-events) Workspace Agent `202` means durable queue acceptance. Beta `completed` means a run finished, not that an OAP page passed every validation predicate or committed an immutable deduplication ledger. [Run status](https://developers.openai.com/workspace-agents/trigger-runs)

The existing [direct-https-v1 receipt contract](../../specs/protocol/profiles/direct-https.md#h5-event-publication-and-receipts) requires a matching schema-valid `200` receipt after durable valid consumption. Neither native success response can be relabelled as that receipt. Transport receipt, valid consumption, host evaluation, and user notification remain separate observations.

## Evidence required before selecting a host profile

These questions are unresolved research/acceptance work, not proposed endpoints or implemented behavior:

| Area | Required concrete evidence |
| --- | --- |
| Account and agent choice | Identify the user's actual existing dot or Workspace Agent, account/workspace/region eligibility, admin policy, and intended recipient. Confirm that its existing context is appropriate; do not create a replacement to pass M2. |
| Complete direct path | Record supported onboarding, actual endpoint acquisition, every control/authentication destination, and observed network topology. For Events, prove discovery, subscribe, callback verification, refresh/secret rotation, unsubscribe, reconnect, and restart through the same device path. |
| Input and validation | Establish envelope/schema mapping, byte limits including wrapper overhead, Unicode handling, pages, version compatibility, authorized apps/fields, expiry, and inert labels. A free-text `input` field supplies none of those guarantees by itself. |
| Identity and deduplication | Verify token/device/recipient binding, immutable ID/body behavior, conflicts, replay/reordering, idempotency retention and scope, and lost-response recovery. The trigger guide does not specify the idempotency retention horizon or conflicting-body behavior needed by OAP. |
| Status and errors | Preserve native queue/receipt states separately from valid consumption and observed interpretation. Verify run-status access, unsupported beta behavior, failure/approval suspension, safe error bodies, permanent versus transient outcomes, and bounded unknown-delivery recovery. Host `409` must not be mapped to OAP `conflicting_duplicate`. |
| Rate and cost | Obtain actual host request, burst, input, batching, status-poll, concurrency, and backpressure limits. Demonstrate compatibility with OAP's four fresh events/hour/recipient, retry budgets, expiry, and no unbounded catch-up. The reviewed trigger reference gives no numerical rate limit, usage cost, or guarantee of notification timing. |
| Context and privacy | Observe use of existing standing instructions and appropriate silence/response; verify what context API-triggered or background work receives. Establish user/workspace retention, logging, memory, deletion, access and output-destination policies for the actual host. Provider-side copies are outside device-local deletion. No research finding establishes a particular account's privacy configuration. |
| Credential lifecycle | Secure issuance/storage, actual expiry, rotation/reissue, old-token rejection, narrowing and disconnect must be proven. Local pause/revocation must still commit offline without remote acknowledgement. No undocumented refresh endpoint or shared project credential is allowed. |

A qualifying account and existing-agent choice are needed before account-specific work can resolve these questions. Documentation establishes candidate capabilities; it does not establish a pilot, production compatibility, or M2 completion. Gate decisions remain governed by the agreed [acceptance criteria](../../specs/acceptance-criteria.md), including AC-28 where MCP is selected and AC-29 for the complete no-intermediary topology.
