# Grok Bot routine webhook follow-up

Date: **2026-10-08**. Status: **documented webhook ingress selected by the user; synthetic probe implemented; account evidence pending**. No live account, endpoint, secret, routine or model was accessed. The first product target remains Grok Bot under [ADR-0011](../decisions/0011-grok-bot-first-integration.md); [ADR-0012](../decisions/0012-grok-bot-direct-webhook-priority.md) selects the direct webhook. Custom MCP Events remains unverified and retained as research.

## Newly located primary source

The canonical [Cursor Grok Bot Routines help page](https://cursor.com/help/grok-bot/routines) documents webhook triggers. A routine's desktop panel supplies its POST URL and bearer key. A JSON body reaches the Bot with the routine instruction. HTTP **200** reports acceptance and run start, not completion; other statuses report no run start. The panel supports pause/resume and run history. This is a Grok routine webhook, not MCP event discovery or subscription. The earlier [xAI overview research](grok-bot-integration-2026-10-08.md) did not locate this more detailed source.

The [plan matrix](https://cursor.com/help/grok-bot/plans) documents access on Cursor Pro and eligible linked plans with included usage. It does not independently establish webhook access for the user's account. Exact feature access, provider-issued origin/path, key lifetime/rotation, payload limits, rate limits and idempotency remain untested or unspecified in the checked webhook guide. No endpoint shape or header beyond its documented bearer authorization is invented.

## Topology and implementation consequence

Proposed path: the producing device makes an outbound HTTPS POST to the exact provider-issued routine destination in the user's existing Bot infrastructure. It needs no inbound phone listener, public device endpoint, desktop forwarding process or third-party tunnel. This is a topology inference from the documented webhook interface; actual endpoint ownership, account access and receiving behavior still require protected setup and a controlled synthetic trial. A desktop used once to view configuration would not be a running delivery dependency.

The user explicitly chose “Prioritize the direct Grok webhook” after the interface distinction was explained. Prepare the necessary receipt/auth/profile amendments before connecting it to the agreed publisher. The direct adapter currently requires authenticated OAP capabilities and a valid consumption receipt; a Grok 200 must not be passed off as that receipt. The isolated synthetic probe implements one attempt without enabling a production profile.

One prospective payload is a single unchanged OAP page. No app-supplied label becomes routine instructions. Payload validation and a trustworthy receiver ledger are still needed before the operational Skill can treat it as admitted evidence; a natural-language instruction alone does not supply either. Existing device-side scope, consent, expiry, rate/byte/retention limits remain mandatory. Local credential deadlines cannot be described as provider-enforced key expiry.

## Reliability and cost limits to resolve

An acknowledgement lost after the body is sent leaves an ambiguous outcome. Blind retry may start another Bot run and spend included usage twice. No documented idempotency header or deduplication guarantee was found. Preserve event identity and stop for reconciliation until supported duplicate handling is established; user approval to retry cannot itself prove the first run did not start. An observed 200 stops sending that event even if no visible answer follows. Silence is not completion evidence.

Non-200 responses, credential errors, redirects, oversize inputs and backpressure need distinct local handling. No redirect is followed. HTTP status text or response content is not authority, an agent instruction, or a validated receipt. Pause/revoke must fence every local send; cancellation cannot undo an already accepted remote run. Provider copies and run cancellation are separate boundaries.

Use one synthetic probe with no proactive coaching or external side effects first. Check actual base-plan access and included-usage settings without purchasing, upgrading or enabling on-demand use. Then establish exact authenticated destination, response behavior, recipient isolation, payload bounds, revoke/rotation and duplicate handling. No private phone activity is needed for this probe. The Android inspector remains unchanged; any future publishing APK still needs exact-byte emulator validation.

An [offline outcome model](../../src/experimental/grok-webhook-outcome.mjs) explores acknowledgement, denial and ambiguity. The [synthetic-only probe](../../src/experimental/grok-webhook-probe.mjs) implements fixed example data, exact protected destination binding, authenticated TLS/public-peer checks, local send fences, short local setup deadlines and bounded one-attempt behavior. A test-only owned TLS mock terminates the example directly. These tests do not establish live Grok access, receiver admission, observed Bot behavior or M2. See the [pilot packet](../integration-drafts/grok-bot-webhook-pilot.md).
