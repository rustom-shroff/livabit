# Conditional MCP Events mapping

Status: Phase 3 candidate, not a selected or implemented transport. Date: 2026-10-03. This document supplies the selection gate for OAP-FR-011, AC-28 and AC-29; it does not establish OpenAI, Claude or Gemini compatibility. [Direct HTTPS](direct-https.md) remains the mandatory independent reference profile.

## M1. Eligibility before an adapter

MCP and OAP have separate versions and semantics. OAP activity records MUST retain the [core](../oap.md) consent, privacy, identity, age, ordering and limit rules inside any MCP mapping. An MCP resource read or change notification alone does not establish proactive activity evaluation in a personal agent. An installed liveabit Skill supplies guidance only.

A candidate MUST prove the complete direct lifecycle: the actual host reaches device-resident discovery, authenticates the publisher, obtains the event definition, creates a subscription, returns genuine delivery credentials, refreshes it before expiry, receives an authorized event and disconnects. The publisher and consent/outbox stay on the device. Any supported private connectivity MUST terminate in the chosen agent provider's existing infrastructure. A project-hosted endpoint, free-tier relay, public proxy, third-party tunnel or user-run desktop forwarding server is excluded.

An outgoing phone-to-webhook POST does not prove discovery or renewal connectivity. If the host cannot reach the device through a supported direct/provider-owned control route, mark the integration unsupported/deferred. Do not ask the phone to invent a callback URL, signing secret, OAuth issuer or host subscription.

## M2. Current OpenAI candidate

The documented OpenAI event path uses MCP 2.0 event discovery/subscription, a host-supplied HTTPS callback and secret, signed verification, and webhook delivery. The host must also reach subscription refresh. These documented capabilities justify investigation; they do not prove Android execution or public distribution without a reachable publisher. [OpenAI MCP Events](https://developers.openai.com/plugins/build/mcp-events)

OpenAI-managed private MCP connectivity is a possible control route because its ingress belongs to the chosen agent provider. Eligibility, setup credentials, Android support, event behavior and distribution remain unverified. It MUST pass the complete gate above before selection. [Secure MCP connectivity](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)

Pin the exact MCP specification, host event guide and SDK revision in later implementation evidence. MCP 2.0 result shapes and supported host behavior must be tested against the chosen versions; generic or older MCP samples are insufficient. [MCP 2026-07-28 changes](https://modelcontextprotocol.io/specification/2026-07-28/changelog)

## M3. Proposed semantic mapping

This table is an adapter obligation after selection, not a new host API specification. Exact host request/result schemas remain those of the pinned supported implementation.

| Host operation or field | Required OAP meaning |
| --- | --- |
| Server capability/event discovery | Declare only the implemented `activity.summary` family, supported OAP version and actual local control capability; no device-action tools |
| Event input/filter definition | Bind the authenticated host principal to an already approved local recipient; host arguments may narrow scope/cadence, never approve or widen it |
| Subscribe | Obtain the actual host-provided callback/signing material, verify the callback using the supported host flow, then bind it to a finite device-local subscription within current consent |
| Refresh/renew | Preserve idempotent host identity rules and device scope; stop on host or local expiry; no undisclosed forwarding endpoint to keep refresh reachable |
| Unsubscribe | Commit the local stop first; perform supported host cleanup as an additional best-effort operation |
| Webhook `eventId` | The immutable OAP `event_id`, reused for retries |
| Webhook `name` | The declared host event corresponding to `activity.summary`; a renamed host event must have one explicit documented mapping |
| Webhook `timestamp` | The unchanged OAP `emitted_at`, distinct from the fresh signing timestamp in retry headers |
| Webhook `data` | The entire immutable validated OAP envelope, including the original observation window and expiry |
| Webhook cursor, if supported | Profile-specific transport position bound to recipient/subscription; not a new activity time, authority grant or global order |
| Successful delivery acknowledgement | Transport acceptance only unless the host explicitly provides a stronger documented consumption acknowledgement |

The device MUST check current local consent before handling every host-initiated control/read and before every callback attempt. Authentication to an MCP endpoint does not bypass the local app/field allowlist. The publisher MUST validate the callback destination and every subsequent connection, reject redirects and use the exact supported signing/verification algorithm. Retrying may produce fresh required signing headers; the OAP ID/body and observation age remain unchanged.

OAP's stricter event, rate, retry and retention budgets still apply. The adapter MUST account for wrapper overhead before finalizing records, and MUST NOT use the host's larger payload allowance to relax local limits. Only host-supported recovery modes may be used. Do not invent polling, streaming, replay cursors, gap control events or termination notifications if the selected host does not implement them. Device-local coverage/gap diagnostics remain honest even when the host offers no separate gap message.

## M4. Receipts and interpretation

A successful webhook response establishes the documented delivery level, not valid consumption, evaluation, notification or a behavioral result. Expose that level separately in device status. The independent mock receiver's durable valid-consumption receipt MUST NOT be reused as evidence that a real host consumed the same record. User goals, private memories and interruption choices remain in the existing agent.

Delayed or partial windows are retrospective evidence. The host/skill MUST NOT treat them as current foreground activity, infer excluded app activity, execute payload labels as instructions or equate a retry with new usage. Pagination retains each page's shared window identity and declared page count; missing pages do not represent zero usage. A host that cannot interpret these required semantics is incompatible with the selected OAP profile.

## M5. Required selection evidence

Before claiming support, record the exact host/account eligibility and versions; the endpoint/control topology; real credential issuance, verification, refresh and disconnect; tested event mappings and limits; arrival in the intended existing personal agent; the agent's response under existing standing instructions; and observed network destinations. Demonstrate pause/offline revocation and bounded outage recovery, while retaining the difference between transport receipt and host response.

The verdict is **eligible with evidence**, **unsupported**, or **unverified/deferred**. A mock, a new API-built coach, an ordinary chat URL, a skill installation or a provider tunnel document alone cannot satisfy M2. No MCP adapter is required to finish the independent Phase 4 simulator when this gate remains unverified. See [research](../../../docs/research/feasibility.md#direct-delivery-without-an-intermediary) and [acceptance criteria](../../acceptance-criteria.md).
