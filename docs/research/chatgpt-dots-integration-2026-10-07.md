# ChatGPT dots direct integration refresh

Date: **2026-10-07**. Scope: current official documentation review for the user's selected first target under [ADR-0010](../decisions/0010-collector-accepted-and-chatgpt-dots-priority.md). No account, credential, tunnel, plugin or dot was created or contacted. Source facts below are documentation evidence; the proposed architecture and sequencing are project decisions.

## Current documented surfaces

MCP Events supports dots and uses MCP 2.0 version `2026-07-28`. Its authenticated endpoint discovers events and handles subscribe/refresh/unsubscribe; delivery goes to a supplied HTTPS callback. Callback verification and signed exact-byte requests precede activity delivery. Successful webhook receipt is distinct from asynchronous agent processing. [Official MCP Events guide](https://developers.openai.com/plugins/build/mcp-events)

Secure MCP Tunnel supplies OpenAI-owned private ingress using a locally running client, a tunnel identity, a runtime key and the required organization/workspace access. It supports private custom MCP testing. Public plugin distribution requires a public endpoint, so this private route does not establish a public distribution path. The guide does not establish an Android client or prove that Events and Tunnel compose for our target account. [Official Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)

Dots can monitor events from connected services when instructed. A dot uses available conversation context, relevant ChatGPT memory and its own saved notes; that is not an assurance that every background event has all historical context. Installing a connection alone does not create the monitoring instruction. [Official dots tasks and memory guide](https://learn.chatgpt.com/docs/dots/tasks-and-memory)

## Development implication

Use the documented Events interface as the first proposed integration branch. Prepare the [native profile packet](../integration-drafts/chatgpt-dots-profile.md), offline synthetic fixtures and liveabit Skill evaluation before account setup. A future private Windows synthetic trial can exercise the producing device's own endpoint and OpenAI-owned ingress; it must not forward phone activity through a separate desktop service.

Resolve same-device Android control ingress/client execution before recommending a phone-to-dot pilot. Treat public distribution as a separate unresolved question. Neither issue calls for more duration-accuracy experiments or a hosted workaround. Keep the selected target separate from successful pairing and preserve native webhook receipt as its own stage, without inventing a valid-consumption receipt or observed user response.

The October 4 [capability catalog](../agent-compatibility.json) remains pinned historical preparation. This dated refresh records the current target and sources separately; its all-disabled runtime flags remain appropriate until the actual path is proven.
