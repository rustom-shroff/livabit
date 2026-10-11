# Grok Bot direct integration research

Date: **2026-10-08**. Scope: public documentation and the user's two links; no account, Bot, device or paid API accessed. Grok Bot is the selected first target under [ADR-0011](../decisions/0011-grok-bot-first-integration.md). Native MCP Events support and direct ingress remain **unverified**, rather than proven absent.

## What the supplied links establish

The [community article](https://www.grokbot.sh/blog/how-mcp-events-can-unlock-agent-to-agent-communication), attributed to Mike Choi on October 6, demonstrates runneth returning a completion event to **ChatGPT**. It points to OpenAI Events documentation. Grok Bot appears among prospective uses, not as the demonstrated receiver. The site's footer disclaims xAI/Cursor affiliation. The original non-www link failed in the web reader; its www version opened. This is useful motivation for the desired architecture, not a Grok-native interface contract.

The [official skills and routines guide](https://docs.x.ai/grok-bot/skills-routines-and-automations), updated October 6, documents saved skills, scheduled routines and event-triggered work through Cursor account integrations such as Slack and GitHub. It explicitly separates those integrations from plugins. Private skills are shared across the user's Bots. It does not specify arbitrary MCP Events subscription methods, signing, callbacks or custom device ingestion. A manual Skill interpretation trial can proceed without claiming automatic delivery.

## Product, plan and device facts

The [official overview](https://docs.x.ai/grok-bot/overview) describes persistent personal Bots on an account's shared cloud computer. The computer's existence does not establish a public receiving endpoint or per-Bot credential isolation.

The overview links the [canonical plan matrix](https://cursor.com/help/grok-bot/plans): Cursor Pro includes Grok Bot, while SuperGrok Lite excludes it. Eligible SuperGrok account linking is also documented. The [official product page](https://x.ai/bot) lists monthly Cursor Pro at $20 and SuperGrok at $30 on this research date. The user's actual tier, account access, native Events entitlement and included usage have not been checked. Do not infer the chosen account from these prices, purchase a plan or enable on-demand spending.

The [mobile guide](https://docs.x.ai/grok-bot/mobile) documents Android 9+ access to the same cloud Bots. Android text sharing requires choosing a conversation and sending through the composer. That is a user-mediated handoff, not unattended activity publication or a local MCP listener. This run adds no Android sharing behavior or new APK.

## Interfaces that do not answer the connection question

The [Grok connector guide](https://docs.x.ai/grok/connectors) describes MCP tools served from a public endpoint. Its [tunneling guide](https://docs.x.ai/grok/connectors/custom-mcp-tunneling) describes third-party ngrok and Cloudflare forwarding to local servers. These are Grok chat connector docs, not proof of a Bot Events interface, and the described third-party topology fails this project's no-intermediary constraint.

The [remote MCP developer API](https://docs.x.ai/developers/tools/remote-mcp) concerns model tool calls; it does not establish a receiving endpoint in the user's existing personal Bot. Likewise [enterprise action export](https://docs.x.ai/grok-bot/teams-and-enterprises) concerns exporting Bot actions, not admitting phone usage signals. Neither is selected as a substitute.

## Build consequence

Continue concrete local Skill/payload preparation through the [pilot bundle](../review/grok-bot-pilot-packets.md). Keep the [Grok connection gate](../integration-drafts/grok-bot-profile.md) disabled until a host-specific contract and controlled direct-path evidence exist. No executable native adapter is warranted from the checked sources. Search results, scheduled polling, an ordinary MCP tool, or a Bot's unsupported claim cannot fill that gap.

Preserve the [October 7 dots research](chatgpt-dots-integration-2026-10-07.md) and its proposal. Further collector accuracy proof is deferred; that decision does not manufacture known coverage or justify sending local estimates as validated OAP summaries.
