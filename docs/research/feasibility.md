# Research and feasibility

Date: 2026-10-03. Revision: 0.2. The user confirmed no intermediary infrastructure; technical profiles remain proposed/unverified. This revises the earlier hosted-adapter recommendation.

**Open Activity Protocol (OAP)** is the open protocol that lets any compatible personal agent receive and interpret activity signals. The optional **liveabit Skill** supplies interpretation and workflow guidance. This research supports the [product requirements](../../specs/product-requirements.md) and [architecture proposal](../../specs/system-architecture.md); it does not establish a finished protocol or working integration.

## Evidence and terminology

Primary documentation was reviewed for the date above. No account-specific connector, webhook, assistant-memory, Android-device, or notification test was performed. Availability can depend on rollout, account, region, workspace policy, and execution environment.

- **Stable standard:** a published protocol revision, distinct from optional extensions and host adoption.
- **Documented support:** an explicitly described product capability; account availability and runtime behavior still need testing.
- **Draft:** a proposal whose wire contract or supported subset can change.
- **Proposed:** our engineering choice, awaiting approval and later specification.
- **Unverified:** the reviewed sources do not establish the required behavior. This does not assert that a feature is impossible.

Tool access, event delivery, agent execution, available personal context, and user notification are separate capabilities. API access alone supplies no evidence that an integration inherits an existing consumer assistant's private memories.

## Capability comparison

This table describes documented host mechanisms. It does not establish that the device can onboard and deliver directly without an intermediary; the direct-path constraints are assessed below.

| Surface | Documented integration | Incoming activity and proactive behavior | Context and principal limit |
| --- | --- | --- | --- |
| MCP core `2026-07-28` | Tools, resources, prompts, opt-in change subscriptions | Core notifications require a listening client; no universal assistant wake or user-message guarantee | Context and execution policy belong to the host. [Specification](https://modelcontextprotocol.io/specification/2026-07-28) |
| ChatGPT Work Cloud / dots | Plugin MCP Events webhook integration | Documented event-triggered behavior in Work web chats, desktop Work with Cloud selected, and dots; workspace controls apply | Target a consenting, eligible host; receipt is asynchronous. [MCP Events](https://developers.openai.com/plugins/build/mcp-events) |
| ChatGPT dots | Plugins, delegated tasks, persistent notes, proactive updates | Gradual rollout; connecting a source alone does not start monitoring | Relevant ChatGPT memory and dot notes may be used; delegated tasks receive selected context. [Dots](https://learn.chatgpt.com/docs/dots), [tasks and memory](https://learn.chatgpt.com/docs/dots/tasks-and-memory) |
| Gemini consumer / Spark | Custom MCP connected apps; reusable skills | Time, Gmail, and topic schedules are documented; arbitrary OAP webhook wake remains unverified | Custom MCP eligibility includes US, age 18+, English, personal accounts, and Keep Activity enabled. [Connected apps](https://support.google.com/gemini/answer/17209137), [schedules](https://support.google.com/gemini/answer/17094710) |
| Claude consumer / Cowork | Remote MCP custom connectors; scheduled remote tasks use connectors and skills | Scheduled execution is documented; arbitrary inbound OAP webhook wake remains unverified | Remote connectors are cloud-reached; each scheduled run has its own session. [Connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp), [schedules](https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork) |
| Provider APIs / custom agents | MCP or tool calls, application-managed state, background execution | An application can orchestrate execution; this is a separately built consumer | Do not equate application state with a user's existing assistant memories. [OpenAI state](https://developers.openai.com/api/docs/guides/conversation-state), [Gemini Interactions](https://ai.google.dev/gemini-api/docs/interactions-overview), [Claude sessions](https://platform.claude.com/docs/en/managed-agents/sessions) |

## MCP: stable core and conditional event adapter

The current stable revision is **`2026-07-28`**, replacing the previous initialization/session model with self-contained requests and `server/discover`. It removes `Mcp-Session-Id`, `resources/subscribe`, and SSE redelivery using `Last-Event-ID`. Results require `resultType`. [Changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)

Stable `subscriptions/listen` opens a long-lived POST response stream for selected tool, prompt, and resource-list changes or resource URI updates. Disconnection ends it; new connections establish subscriptions again. These notifications do not define domain activity schemas or an absent user's coaching workflow. [Subscriptions](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions), [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)

MCP Events is an explicitly **draft design sketch**, dated 2026-02-19, distinct from stable core subscriptions. It proposes `events/list`, webhook `events/subscribe`/`events/unsubscribe`, polling, and streaming. Subscription arguments and payloads have separate schemas. Webhook identity combines authenticated principal, callback URL, event name, and canonical arguments; renewal is idempotent and lifetime-scoped. Its occurrence envelope contains `eventId`, `name`, `timestamp`, `data`, and `cursor`. Replay depends on retained upstream history and persisted cursors; `truncated` reports gaps, and a null cursor means no replay. It supplies no exactly-once processing or event schema-version negotiation. [Draft proposal](https://github.com/modelcontextprotocol/experimental-ext-triggers-events/blob/main/docs/design-sketch-proposal.md)

OpenAI requires MCP 2.0 / `2026-07-28` for its documented adapter profile. It supports webhooks and signed callback verification, excluding polling, streaming, and draft `gap`/`terminated` controls. Subscription state must survive restarts; access must be rechecked. Callbacks require public HTTPS, connection-time address validation, and blocked redirects. Deliver one event per request, at most 256 KiB; bound exponential retries, preserve IDs, refresh signatures, and do not retry `410` or `413`. `2xx` acknowledges receipt, not finished reasoning or notification; delivery may reorder and host batching may combine events. [OpenAI profile](https://developers.openai.com/plugins/build/mcp-events)

Standard Webhooks signs exact body bytes with the event ID and attempt timestamp. Verify signatures in constant time, reject stale signing timestamps, and deduplicate IDs. Signing secrets require protected storage and rotation. [Signature standard](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md)

For remote MCP, OAuth authorization includes resource discovery, audience validation, and bearer credentials on each request. Host authentication does not replace device permission or granular OAP monitoring consent. [Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)

## Personal context, skills, and other agents

A plugin can package skills with an MCP server. The **liveabit Skill** should guide a host that already receives activity, rather than be treated as a receiver, scheduler, or grant of device authority. Local dot skills need a connected computer. [Plugin architecture](https://developers.openai.com/plugins/concepts/plugins), [build skills](https://learn.chatgpt.com/docs/build-skills), [dots](https://learn.chatgpt.com/docs/dots)

OpenAI's built-in event schedules for sources such as Gmail, Slack, and GitHub are a separate product path; their availability does not prove custom OAP event support on every surface. [Scheduled tasks](https://learn.chatgpt.com/docs/automations) The Sign in with ChatGPT open-source preview also has distinct limits: callers supply context with `store: false`; conversation state and hosted MCP are unavailable there. It is not a route to inherited consumer memory. [Preview limits](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)

Gemini consumer memory has eligibility and surface limits, including exclusions for Gems and Live. Skills use a root `SKILL.md`; their scripts cannot issue external requests. Gemini API remote MCP and application-started background execution establish custom-agent possibilities, not consumer webhook wake or memory inheritance. [Consumer memory](https://support.google.com/gemini/answer/16598469), [skills](https://support.google.com/gemini/answer/17094296), [API MCP](https://ai.google.dev/gemini-api/docs/function-calling), [background execution](https://ai.google.dev/gemini-api/docs/background-execution)

Claude documents chat/cloud Cowork memory, with local Cowork excluded. Its API MCP connector is tool-only and beta; Managed Agents events and memory describe API sessions and workspace state. API skills lack network access and automatic synchronization between surfaces. Equivalent OAP consumers are plausible, but host wake and personal context need separate validation. [Consumer memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context), [API MCP](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector), [agent events](https://platform.claude.com/docs/en/managed-agents/events-and-streaming), [agent memory](https://platform.claude.com/docs/en/managed-agents/memory), [API skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)

## Android observations and execution limits

`UsageStatsManager` requires the usage-access manifest permission and a separate user grant in Settings. `queryEvents` retains only a few days, and queries can return null before unlock on Android R and later. `queryUsageStats` can expand requested times to aggregation intervals. Do not describe unavailable data as zero usage. [Usage access and queries](https://developer.android.com/reference/android/app/usage/UsageStatsManager)

Foreground time, visible time, and foreground-service time are distinct metrics. Multi-window allows simultaneously resumed activities, so per-app foreground totals can overlap and need not equal elapsed device time. Collect only permitted application identity and timing; discard activity classes, shortcuts, and unrelated event extras. [UsageStats](https://developer.android.com/reference/android/app/usage/UsageStats), [multi-window](https://developer.android.com/develop/ui/views/layout/support-multi-window-mode), [event fields](https://developer.android.com/reference/android/app/usage/UsageEvents.Event)

API 35 adds package/event-type query filtering. An omitted package filter returns all packages, so an empty approved allowlist must stop querying. Older query APIs may return broader metadata; immediately discard denied packages/fields locally before OAP aggregation, storage, diagnostics, or export. [Query filtering](https://developer.android.com/reference/android/app/usage/UsageEventsQuery.Builder) Initially cover only the installed/authorized Android profile; other users, work profiles, Private Space, and multi-device attribution need separate validation. Ordinary query routing is visible in [AOSP UsageStatsService](https://android.googlesource.com/platform/frameworks/base.git/%2B/master/services/usage/java/com/android/server/usage/UsageStatsService.java); this implementation evidence is not a guaranteed cross-profile public API contract.

Periodic WorkManager work has a 15-minute minimum and can be delayed or skipped. Foreground services impose start/type restrictions; Android 15 limits background `dataSync` service time to six hours per 24 hours, and Android 16 applies job quotas while foreground services run. These are incompatible with a universal continuous-delivery promise. Android 17 behavior changes add further memory and cross-profile constraints to the compatibility review. [Periodic work](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work), [foreground-service changes](https://developer.android.com/develop/background-work/services/fgs/changes), [timeouts](https://developer.android.com/develop/background-work/services/fgs/timeout), [Android 17](https://developer.android.com/about/versions/17/behavior-changes-all)

Package suspension requires device/profile-owner or delegated management authority; usage access alone cannot enforce restrictions. Application inventory/visibility and accessibility use require separate Play policy evaluation. Accessibility-based autonomous actions have policy restrictions and narrowly defined exceptions; blocking is excluded from this release. [DevicePolicyManager](https://developer.android.com/reference/android/app/admin/DevicePolicyManager), [inventory policy](https://support.google.com/googleplay/android-developer/answer/16558241), [accessibility policy](https://support.google.com/googleplay/android-developer/answer/10964491)

## Recommended strategy and remaining proof

1. **Keep OAP independent.** Own activity, consent, limits, identifiers, ordering and bounded recovery outside transport envelopes. Specify a direct reference receiver; host-specific mappings remain optional and conditional.
2. **Start with retrospective local aggregation.** Proposed non-overlapping 15-minute summaries, no more than four fresh events/hour/recipient, and history bounded by 24 hours or 4 MiB reduce exposure and model pressure. These are engineering limits, not judgments about excessive usage or Android wake guarantees. Raw streams and restrictions remain deferred.
3. **Keep state and recovery on the device.** Local grants, protected credentials, permitted aggregates and bounded pending delivery survive restart. Send directly to the existing agent's supported receiver. No project service, free-tier relay, public proxy or user-hosted forwarding bridge is allowed. This removes the earlier remote consent authority and lease.
4. **Prove milestones separately.** M1 uses simulated device-to-final-mock-receiver delivery. M2 requires an existing personal agent with verified compliant direct pairing/control/delivery and liveabit Skill guidance. A preferred host remains deferred if it cannot meet that path. Android starts only after M1/M2; mock or new API-agent evidence cannot substitute for M2.

Material checks include supported direct onboarding, recipient identity, credential issuance/renewal, control reachability, scoped endpoint configuration, and real host response. For a selected MCP profile, reconcile modern result shapes and supported recovery behavior. Audit runtime network destinations to exclude intermediaries. M3 still measures permission/coverage, delay, battery, OS/OEM differences and policy suitability.

Research findings are design evidence. Only later reproducible demonstrations and acceptance results establish runtime compatibility or milestone completion.

## Direct delivery without an intermediary

The accepted constraint permits the user's device and chosen agent infrastructure only. Lower reliability is acceptable. Missing pairing/receiving support is a separate feasibility problem that persistence and retries cannot solve.

MCP Events has two network legs: the host must reach the publisher for discovery, subscription and refresh; afterward the publisher posts to the host callback. Callback URL/signing material comes from the host's subscription. Device-originated POSTs do not remove the initial control path. A normally private/sleeping phone therefore needs a supported direct control channel too. [MCP Events lifecycle](https://developers.openai.com/plugins/build/mcp-events)

OpenAI Secure MCP Tunnel lets a private client initiate connectivity to OpenAI-owned ingress, avoiding a project-run public endpoint. It requires a tunnel identity, runtime credentials, Platform permissions and workspace association. It is documented for private/developer-mode use, and expressly does not meet public-plugin distribution requirements. Android execution and MCP Events over this connection are unverified. This is a candidate to investigate, not a selected end-user solution. [Private connectivity](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels), [public-plugin endpoint requirements](https://developers.openai.com/plugins/build/mcp-server)

The reviewed official sources establish no separate generic endpoint for sending arbitrary OAP activity into an existing personal dot without MCP onboarding. This is an unverified capability, not proof of impossibility. OpenAI/Gemini API-managed sessions expose application input, but that does not establish input into the user's existing consumer assistant or access to its memories. [Application state](https://developers.openai.com/api/docs/guides/conversation-state), [Gemini Interactions](https://ai.google.dev/gemini-api/docs/interactions-overview)

Claude personal remote MCP connectors need cloud reachability. Its distinct MCP tunnel preview describes a Cloudflare/proxy stack and is unavailable for claude.ai connector use; it does not establish the required direct consumer path. Gemini native MCP retrieval likewise does not establish arbitrary device-originated ingress. [Claude connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp), [Claude tunnel preview](https://platform.claude.com/docs/en/agents-and-tools/mcp-tunnels/overview), [Gemini connected apps](https://support.google.com/gemini/answer/17209137)

| Candidate | Status under the accepted constraint |
| --- | --- |
| Independent direct OAP receiver | Suitable reference design; simulate a final receiver locally before real integration |
| Receiver inside the user's existing local agent runtime | Eligible topology if its direct authenticated receiving capability actually exists; no required forwarder to another agent |
| OpenAI MCP Events + OpenAI-managed private connectivity | Research candidate; prove full lifecycle, Android suitability, eligibility and distribution first |
| Public MCP plugin through our hosted server/proxy | Excluded, including free tiers |
| User-run desktop/server forwarding activity to a cloud assistant | Excluded as an intermediary |
| A new API-configured coach | Does not satisfy the existing-personal-agent milestone |

Before claiming M2 support, demonstrate account pairing, real scoped credentials, device-to-agent receipt, arrival in the intended existing assistant, appropriate standing-instruction handling and renewal/disconnect behavior with a destination/topology audit. Public skill packaging can distribute guidance without an operated MCP service; it does not create event ingress or wake behavior. Best-effort software can improve recovery while leaving ultimate delivery and host response unguaranteed.
# Research follow-up

The [2026-10-04 direct-host follow-up](direct-host-follow-up-2026-10-04.md) refreshes OpenAI MCP Events and Secure MCP Tunnel findings and adds the published Workspace Agent native trigger as a distinct candidate. It selects no profile and records remaining authentication, context and receipt evidence. The dated baseline below remains the original research record.

