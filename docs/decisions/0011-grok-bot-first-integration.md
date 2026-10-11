# ADR-0011: Target Grok Bot first and retain the dots work

Date: **2026-10-08**. Status: **accepted target change by the user's explicit instruction**.

## Decision

The first integration target is **Grok Bot**, using the user's base plan. This supersedes the ChatGPT dots target in [ADR-0010](0010-collector-accepted-and-chatgpt-dots-priority.md). Keep its collector acceptance and deferral of further precise-duration and complete-coverage investigation. Linux remains on hold. Retain the [dots research](../research/chatgpt-dots-integration-2026-10-07.md), [disabled dots proposal](../integration-drafts/chatgpt-dots-profile.md) and historical evidence as an alternative, without enabling that profile.

The desired connection uses native MCP Events in the existing personal Bot. Product selection does not establish that connection. The [October 8 research](../research/grok-bot-integration-2026-10-08.md) distinguishes documented Bot skills and integration triggers from an unverified custom MCP Events interface. The user's linked blog demonstrates ChatGPT receiving events and discusses Grok Bot as a prospective use case. Do not infer Grok support from another host's implementation or copy OpenAI's wire contract into a Grok adapter.

## Build sequence

Prepare the existing liveabit Skill and synthetic interpretation cases for the selected Bot, with reviewer answers kept separate. The [offline handoff bundle](../review/grok-bot-pilot-packets.md) creates local files only. It exercises preparation and preserves a useful first host-behavior experiment; neither packaging nor a manually submitted case proves authenticated delivery, wakeup or M2.

Before implementing or enabling native transport, establish a Grok-specific contract and supported topology: base-plan eligibility, authenticated event discovery and subscription control, a device-reachable provider-owned ingress, callback verification and integrity, lifecycle limits, and arrival in the intended existing Bot. Record facts separately from unknowns in the [connection gate](../integration-drafts/grok-bot-profile.md). A Bot's textual assertion that it supports a feature is insufficient evidence. A controlled synthetic trial can establish these facts when supported setup is available.

The activity-producing device must connect directly to the chosen agent's existing infrastructure. No project service, third-party tunnel, external mailbox, public proxy, desktop forwarder or separate API coach is introduced. No purchase, upgrade or on-demand spending is authorized by this decision. Provider-owned ingress is eligible only if actually supported and verified; the Bot's cloud computer is not by itself proof of a reachable ingress.

The current Android inspector and audited APKs remain the accepted local-only baseline. Its inferred observations retain unknown source coverage. Actual publication requires a reviewed truthful OAP mapping and compliant direct transport. A changed phone-trial APK still requires emulator testing of its exact bytes. Privacy, local consent, scoped authentication, resource bounds, erasure and receipt distinctions remain in force.

Keep all 33 requirement IDs and 29 acceptance IDs stable. This changes the first product target and build order; it does not amend OAP 0.1.0, register a native profile or claim M2/M3 completion.
