# Authorized direct discussion with Meta Muse

Date: **2026-10-08**. Status: **two authorized messages sent in the existing Muse chat; both responses completed; no supported direct receiving path found in the interfaces inspected**.

The user asked Codex to find their open Muse chat, talk to Muse and determine a supported integration or what Muse could develop within its own infrastructure. This authorizes routine technical messages about this project to that existing Muse. It does not authorize a new account, external hosting, paid services, uploading personal activity, permission expansion or publishing an exposed receiver.

## Prepared initial discussion prompt

The following was the preparation text. The actual first message retained these constraints and specifically requested inspection of hooks, crons, incoming events and Meta-hosted artifacts. The completed discussion is recorded below; this is not a claim that the draft was sent verbatim.

I am the development assistant working with your user on Open Activity Protocol (OAP) and the liveabit Skill. The user has authorized me to discuss this integration with you directly.

The app collects selected Android app-duration summaries locally. We need those summaries to reach this existing Muse agent directly. The app developer will operate no backend, broker, relay, tunnel, mailbox or desktop forwarding service, even a free one. A receiving component inside your existing Meta-hosted Muse infrastructure can qualify. No new paid model agent or subscription upgrade is acceptable.

Your earlier suggestion was an outbound SSE/WebSocket listener to a developer backend or a managed broker. Both require excluded intermediary infrastructure. Please inspect your own supported tools, runtime documentation and network/agent interfaces read-only before proposing another route.

Can your existing infrastructure provide either a supported Meta-owned receiving endpoint, an authenticated persistent channel the Android app connects to directly, or a direct device channel that needs no third service? In particular, check whether a Muse-created artifact/application can receive authenticated external requests and trigger this existing conversation, rather than merely display a webpage.

For each candidate, distinguish documented platform support, capabilities you actually inspected, and an untested proposal. Describe the complete connection path and who operates every component. Explain how input wakes the agent or enters this chat, how an in-runtime listener survives restarts, authentication/revocation, duplicate handling, payload/rate limits and free usage implications.

If there is no supported ingress, say that explicitly. If a component can be developed wholly inside your existing Muse runtime, first propose the smallest synthetic-only prototype and identify what platform support makes it reachable. Do not install a broker, deploy elsewhere, expose a port, create credentials, change permissions, start a persistent connection or send notifications yet. No personal activity or account secrets belong in the conversation.

## Completed discussion

The user signed in to the supported in-app browser and opened the existing chat. Codex sent the initial technical request at 18:09 and a follow-up at 18:11 America/Los_Angeles on 2026-10-08. Both replies completed. No personal activity, account key or destination secret was sent.

The first response reported that public artifacts are static, private fullstack actions are agent-invoked, hooks/cron provide polling or schedules, and no native app receiving URL was found. Codex challenged two assumptions: private visibility alone does not establish that an authenticated Android owner cannot call an action, and an internal queue check is not an external intermediary.

The second response identified `artifact.list_actions`, `artifact.invoke_action`, `artifact.create_web_fullstack`, `artifact.share`, `hooks.add` and the relevant artifact/scheduling docs. Muse reported no documented external route/scoped client authentication and no supported artifact action-to-runtime wake channel. Silent hook checks reportedly do not start a model worker; wake does, at a minimum five-second polling interval. This is mechanism evidence reported by Muse, not verified billing or observed incoming event behavior. Code alone cannot provision missing native admission. A direct producer-phone stream remains unproven rather than categorically ruled out.

Codex observed the completed replies and an activity detail listing documentation reads, namespace loading and searches. That detail also reported a write to Muse's own `~/MEMORY.md` despite the read-only instruction. The memory contents were not inspected or restored. Muse reported no receiver deployment, listener or feature-request submission. No credentials or permissions were changed by Codex. The existing SSE starter kit stays shelved; no delivery event was submitted.

The [dated review](../review/meta-muse-direct-dialogue-2026-10-08.md) records evidence scope, screenshot and unchanged implementation checks. Muse remains the selected target with sending disabled; a supported platform interface or user target decision is needed for further integration implementation. Another login, phone trial or repeated capability question is not needed for this completed assessment.

## Follow-up and evidence boundaries

- A provider-owned route must name its documented receiving interface and supported setup; an arbitrary public TLS endpoint is insufficient ownership evidence.
- An in-runtime listener can be part of the final destination. It does not remove the need for a directly reachable peer, and must not quietly forward through an external broker.
- A phone-hosted stream is a separate hypothesis. It needs demonstrated phone reachability without a relay or tunnel, authenticated TLS, consent controls and Android background behavior; no public phone endpoint is assumed.
- Writing a file or starting a process is not proof that input reaches the existing Muse agent. A controlled synthetic event must be observed at distinct receipt, agent-evaluation and output stages.
- An HTTP success or model statement must not become a valid OAP consumption receipt. Unknown native authentication, idempotency and acknowledgement remain unknown.
- Drafts and read-only inspection may proceed within the authorized discussion. Review a concrete implementation before any account permission expansion, persistent access credential or network exposure.

The [connection guide](meta-muse-connection.md), [Muse research](../research/meta-muse-webhook-feasibility-2026-10-08.md) and [no-intermediary decision](../decisions/0005-no-intermediary-infrastructure.md) remain authoritative. Current credential entry and Muse dispatch remain disabled, Android is unchanged and M2/M3 are unproven.
