# Meta Muse direct webhook feasibility

Date: **2026-10-08**. Status: **user-selected first integration target; direct discussion in the existing account completed; no supported external receiving path found in the interfaces Muse inspected; credential entry and dispatch disabled**. The initial public-source research used no account. The later authorized discussion used the user's existing Muse chat, without obtaining a destination or credential, deploying a receiver or submitting an activity event. Preserve the [Grok webhook findings](grok-bot-webhook-feasibility-2026-10-08.md), [earlier Grok research](grok-bot-integration-2026-10-08.md) and [ChatGPT dots research](chatgpt-dots-integration-2026-10-07.md).

## Product and free usage

Meta identifies Muse as its consumer personal agent at `muse.ai`, with its own persistent secure VM. Its public FAQ describes free access subject to a usage limit; reaching that limit permits waiting for refresh instead of buying more usage. The checked FAQ supplies no numerical free allowance, refresh interval or separate webhook entitlement. A free consumer account does not establish that an arbitrary public webhook is available. See [Muse product and FAQ](https://ai.meta.com/muse/) and [Meta's Muse launch announcement](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/).

Target the user's existing consumer Muse. The documented [Meta Model API Messages interface](https://dev.meta.ai/docs/protocols/messages) calls Muse Spark through a stateless model endpoint. It is not ingress to the user's existing personal agent. [Muse Code authentication and billing](https://dev.meta.ai/docs/muse-code/auth) describes the separate coding product and model usage billing. Neither supplies the requested free consumer integration.

## What official connector documentation establishes

The [Muse Connectors Help Center article](https://www.meta.com/help/artificial-intelligence/1687253048996149/) documents linking chosen apps, disconnecting them, and asking Muse to create a custom connector from a service's API information. Credentials go into Muse's Secure Credentials Store. Some connectors proactively update Muse; the article gives calendar changes as an example. It does not describe a generic provider-issued inbound webhook or expose its wire contract. Previously used connector information can remain in memories and conversation history after disconnection.

The [official Connector Platform guidelines](https://muse.ai/platform/docs) cover submitting a service's API or MCP tools for Muse to call, including endpoint, authentication, scopes, side effects and limits. They do not supply a personal Muse webhook URL or a way for a producing device to push an OAP page directly. A public project service implementing those tools would add the intermediary infrastructure the user excludes.

The [Muse permissions Help Center article](https://www.meta.com/help/artificial-intelligence/1385290430137537/) documents connector, website, artifact and scheduled-task permissions, activity inspection and stopping some tasks. These controls are relevant to later receiving-side setup, but are not webhook authentication, delivery acknowledgement or remote cancellation guarantees.

## Inbound webhook evidence still needed

Searches checked official Muse, Meta AI, Meta Help Center, Meta Newsroom and Meta developer domains, followed the official Connector guidelines into the Help Center, and distinguished consumer Muse from Muse Code, Muse Spark APIs and similarly named products. **No checked primary source established native general inbound webhooks.** This is a bounded research result, not a claim that the feature cannot exist or that the user's observation is wrong. The subsequent account inspection below tests whether the available runtime documentation supplies that missing interface.

## User account conversation follow-up

On **2026-10-08**, the user reported creating a Muse account and pasted a conversation asking how an app could push alerts without email or polling. The supplied Muse reply said it could not expose a public URL on its computer, proposed an outbound SSE/WebSocket listener to a backend the developer exposes, and suggested a hosted MQTT/Ably/Pusher relay for an app-only deployment. It also offered to supervise the listener and insert received alerts into the chat. This is user-supplied account conversation evidence, not official wire documentation or an observed working transport. This initial excerpt assessment used no account; direct access occurred later as recorded below.

| Suggested arrangement | Assessment under the existing constraint |
| --- | --- |
| Phone publishes to a developer backend; Muse holds an SSE/WebSocket connection to it | Excluded: the developer backend is intermediary delivery infrastructure. A persistent connection removes polling but not that infrastructure. |
| Phone and Muse connect to a hosted realtime broker | Excluded: a separately operated broker remains an intermediary even if its tier is free. |
| Muse receives directly from the producing phone, without a third service | Potentially direct in topology, but not demonstrated by the excerpt. Phone reachability, authenticated connection, supported listener lifecycle and actual agent wake/chat behavior remain unverified. No phone server, tunnel or network exposure is implemented. |

A listener running inside the user's existing Muse runtime would not itself be a separate forwarding service; the unsupported component in the concrete proposals is the required backend or broker outside the phone and Muse. Muse's promise to create a supervised process and post alerts is not evidence that those capabilities are supported or have worked. Do not infer instant delivery or phone notification from the proposal.

The account creation report resolves whether the user has started a Muse account. It does not establish webhook entitlement, provider-owned ingress, persistent-listener support or free quota for those operations. Muse remains the selected target under ADR-0013, with credential entry and dispatch disabled. Rechecked official Connector documentation still describes custom connectors and proactive updates without a generic incoming webhook contract. The direct discussion below completed the constraint-specific follow-up. The target is not automatically switched back to Grok.

## Authorized direct account inspection

At **18:09–18:12 America/Los_Angeles on 2026-10-08**, Codex sent two authorized technical messages in the user's existing Muse chat. Muse was asked to inspect its actual documented interfaces without deploying, creating credentials, changing permissions or starting the earlier SSE kit. The second message explicitly distinguished a private app from an app inaccessible to its authenticated owner, and distinguished internal queue polling from an excluded external intermediary. See the [discussion record](../integration-drafts/meta-muse-runtime-discussion.md) and [dated review](../review/meta-muse-direct-dialogue-2026-10-08.md).

| Interface Muse reported inspecting | Reported result and consequence |
| --- | --- |
| `artifact.list_actions` and `artifact.invoke_action` | Declared inputs identify the artifact/action and JSON arguments; no external host, route template or scoped Android authentication flow was supplied. The documented supported caller is the agent through its tool. A private app alone is not proof of inaccessibility; the missing supported external client interface is the decisive gap. |
| `artifact.create_web_fullstack`, `artifact.share`; `docs/artifacts.md`, Sharing & Publishing | Fullstack apps are private; public sharing is for static artifacts. A shareable static page does not supply an executing receiver. No artifact deployment or external request was exercised. |
| `hooks.add`; `docs/chat/scheduling-and-watching.md` | Hooks poll using Bash scripts at intervals of at least five seconds. Muse reports that silent checks launch no model worker, while a wake starts one. Hook scripts lack agent tool access and connector credentials, so no supported authenticated pre-inspection of a private action was found. Numeric free usage and billing limits remain unverified. |
| Scheduling documentation and artifact background callback | No documented general artifact-action-to-runtime queue or chat-wake channel was found. A callback invocation identifier is not evidence of a general incoming event bus. Cron checks use agent turns according to Muse's report. |
| `docs/chat-connections.md` | Muse reported a linked WhatsApp side-chat route for the owner's messaging identity, without an application injection API. No WhatsApp integration was configured or tested. |

These are **Muse-reported documentation/schema findings**. Codex observed both completed responses and a visible activity trace showing documentation reads, artifact namespace loading and searches. Codex did not independently exercise an external receiving interface, inspect provider internals or verify the reported billing behavior. The trace corroborates that investigation took place; it does not demonstrate transport, valid consumption, evaluation of an OAP event or notification delivery.

Muse concluded that code inside this account cannot provision the missing platform-owned external addressing/authentication and event admission. The supported interfaces inspected establish **no usable direct Android-to-Muse receiving path**, rather than a universal claim about all present or future Muse capabilities. A producer-phone stream remains an unproven separate hypothesis requiring direct reachability, authenticated transport and supported lifecycle without a third service; it was not implemented or exposed. Internal bounded queue polling inside existing Muse infrastructure is not excluded merely because it polls, but it cannot repair missing ingress and must not be described as instant push.

**Observed account side effect:** despite the read-only request, Muse's activity trace reported updating its own `~/MEMORY.md` with the reachability findings. Codex did not inspect the contents or attempt to restore/delete that memory. No receiver deployment, listener, credential or permission change was observed; Muse reported the pending feature request remained unsent. The research chat itself used Muse model turns; no numerical free allowance or cost claim is inferred.

Keep Muse selected but unavailable for dispatch under the current inspected interfaces. Reopen implementation only when a supported direct receiving contract is supplied or the user changes target. More phone accuracy testing or user approval cannot create a missing provider interface. The protected local foundation is retained; no intermediary workaround or automatic switch to Grok is introduced.

| Integration fact | Current evidence |
| --- | --- |
| Provider-issued destination origin and path | Unknown; no endpoint pattern or hostname allowlist can be inferred. |
| HTTP method, required headers and authentication | Unknown; Grok's bearer header must not be reused as a Muse fact. |
| Body format and maximum size | Unknown; accepting arbitrary JSON or an unchanged OAP page is not established. |
| Status/body meaning and run start | Unknown; HTTP 200 or any 2xx cannot be labelled accepted, consumed, or evaluated for Muse. |
| Recipient and task isolation | Unknown for an inbound webhook. |
| Idempotency, duplicate handling and retry guidance | Unknown. |
| Key issuance, storage, lifetime, rotation and revocation | Unknown for an inbound webhook; generic secure-store guidance is separate. |
| Rate limits, free quota and refresh interval | Free consumer usage is documented; numerical limits and webhook entitlement remain unknown. |
| Wake behavior, persistent delivery and audit/run history | General background work and activity inspection exist; webhook-specific behavior is unverified. |
| Pause, remote cancellation, provider retention and deletion | General user controls exist; webhook guarantees are unverified. |

## Safe implementation consequence

Prioritize Muse preparation and protected local connection setup now, within the user's instruction. Bounded non-echoing terminal input and an opaque expiring RAM-only draft can be prepared without a native contract. Current Muse credential entry and dispatch stay disabled; no OS-protected persistent store is implemented. A future production connection needs a verified OS secure store and native transport tests, including an owned TLS mock. Local mock behavior does not establish provider behavior, and a local deadline does not establish provider key expiry.

Once a native provider-owned receiver is demonstrated, the producing device can make an outbound request directly to that receiver without a running desktop forwarder, project relay or third-party tunnel. That topology is conditional, not current evidence. Custom connectors that pull from a separately hosted API, hosted mailboxes, external webhook brokers, or paid model calls do not satisfy the agreed delivery model.

A real probe must first bind the exact authenticated destination and recipient, verify free account access without purchase or upgrade, and define payload, acknowledgement and duplicate semantics. Use synthetic data only and one bounded attempt. After uncertain submission, preserve uncertainty and stop for reconciliation. Neither an HTTP success nor natural-language Skill output is a valid OAP consumption receipt. Existing consent, coverage, expiry, rate and retention constraints still apply; unknown phone coverage remains unknown. The local-only Android collector and exact-byte emulator gate remain unchanged. M2/M3 remain unproven.
