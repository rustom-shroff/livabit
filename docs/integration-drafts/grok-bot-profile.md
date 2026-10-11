# Grok Bot connection gate

Date: **2026-10-08**. Status: **direct routine webhook prioritized under [ADR-0012](../decisions/0012-grok-bot-direct-webhook-priority.md); isolated synthetic probe implemented; production profile disabled**. No native profile ID or endpoint is registered by this packet. Custom MCP Events remains unverified as a retained alternative.

Use the user's existing Grok Bot and base plan, following [ADR-0011](../decisions/0011-grok-bot-first-integration.md). The [original research](../research/grok-bot-integration-2026-10-08.md) establishes a Skill path, without custom MCP Events proof. The [webhook follow-up](../research/grok-bot-webhook-feasibility-2026-10-08.md) locates the provider's direct JSON POST interface and 200 run-start semantics. Follow the [webhook pilot packet](grok-bot-webhook-pilot.md) next. The [offline Skill bundle](../review/grok-bot-pilot-packets.md) remains separate interpretation preparation.

## Evidence required before transport implementation

| Question | Current evidence | Required next evidence |
| --- | --- | --- |
| Existing Bot and base-plan access | Product access is documented for eligible paid plans; user's account untested | Protected setup identifies actual plan and intended existing Bot; no upgrade or spending |
| Native webhook | POST URL, bearer key and JSON input documented; 200 reports acceptance/run start | Protected actual routine setup, account entitlement, exact recipient/destination and one synthetic response |
| Same-device reachability | Outbound HTTPS to the existing provider endpoint is the proposed topology | Verify provider ownership, TLS/public peer and actual producing-device reachability; no forwarding machine |
| Admission and integrity | HTTPS/bearer primitive documented; OAP receiver admission unproven | Protected key binding, local scope fences, actual receiver validation/ledger and recipient isolation |
| Lifecycle | Pause/resume documented; key expiry/rotation and duplicate handling unproven | Actual key deadlines/rotation/revoke and offline local denial; local deadlines do not manufacture provider expiry |
| OAP mapping | OAP 0.1.0 and synthetic pages available | Reviewed host mapping preserving page identity, original times, scope, partial coverage and size/cadence bounds |
| Existing-agent behavior | No Grok pilot observed | Authorized synthetic arrival and independently observed evaluation, response or silence |

An account screenshot or textual Bot assertion may identify a feature, but cannot substitute for the evidence above. The selected direct routine webhook is distinct from ordinary MCP tools, polling or an external forwarding bridge. Custom MCP Events discovery, signing and subscription remain conditional research and are not claimed supported or required for the chosen webhook pilot.

## Allowed progression

Prepare a portable liveabit Skill handoff and one-at-a-time synthetic cases now. An explicit manual interpretation exercise can test Skill behavior, but must remain labeled synthetic and user-mediated, without authenticated delivery, monitoring consent or M2 claims. Reviewer answers and observations stay outside the agent input. No background routine, new Bot, account action or private activity export is performed by preparation.

Prepare the production amendment only from actual native evidence, with local consent fences, immutable identity, bounded resource use and truthful status. No automatic retry is safe after ambiguous submission until duplicate handling is established. Preserve the separation between receipt/run start, validated durable consumption, evaluation and visible output. Keep [AC-29](../../specs/acceptance-criteria.md) and the [no-intermediary decision](../decisions/0005-no-intermediary-infrastructure.md) intact; [AC-28](../../specs/acceptance-criteria.md) and the [conditional MCP gate](../../specs/protocol/profiles/conditional-mcp-events.md) still apply if an MCP profile is selected later.

Production Android publication remains a separate implementation. The accepted inspector has no network permission or publication path. Further accuracy proof is deferred, unknown coverage stays unknown, and changed phone-trial APKs require exact-byte emulator validation.
