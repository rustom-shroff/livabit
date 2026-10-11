# Proposed Grok Bot webhook pilot

Date: **2026-10-08**. Status: **webhook route priority accepted under [ADR-0012](../decisions/0012-grok-bot-direct-webhook-priority.md); synthetic probe implemented; no production profile registered or enabled**. Keep the MCP research as a conditional alternative. The [connection gate](grok-bot-profile.md) and [follow-up research](../research/grok-bot-webhook-feasibility-2026-10-08.md) separate the documented interface from unproven account and production behavior.

## Concrete pilot boundary

Use one existing Bot and one narrow webhook-only routine, with no schedule, broad listener, coaching notification or write to external services. Protected local configuration must supply the exact provider-issued URL and key; neither belongs in chat, source, command-line arguments or reports. Do not infer a hostname/path, substitute a generic API or create a receiving service on the Bot's computer.

The first probe uses one synthetic schema-valid OAP page only. The prospective routine receives that page as data, records only safe correlation/stage evidence in the intended private conversation, and does no app enforcement or external action. It must not claim that a body is authenticated or fully validated merely because it resembles OAP. Receiver admission and durable duplicate accounting remain unproven. The liveabit Skill operational package and answer-separated cases are retained for a later interpretation review.

No live pilot is launched by this packet. Actual feature access, peer/destination verification, key protections and local consent need concrete setup. A response from the provider must be authenticated before applying any proposed classification. The [implemented probe](../../src/experimental/grok-webhook-probe.mjs) reads a protected credential callback, creates a fresh schema-valid page containing only fixed `test.app` examples, and uses a single explicit HTTPS attempt. It accepts no caller-supplied activity object. Its 15-minute local setup deadline is not provider key expiry. An instance cannot be reused, and neither timeouts nor missing output trigger retry. It is separate from the approved publisher and `DirectAdapter`; secure operator setup and live evidence remain to be built.

## Offline response model

The [isolated model](../../src/experimental/grok-webhook-outcome.mjs) accepts only a small synthetic attempt description: whether the request body was written, a final HTTP status or no status, connection failure, and the local consent state. It cannot read a credential, open a socket, invoke the publisher or update its durable state.

| Synthetic outcome | Proposed local interpretation | Retry behavior in this prototype |
| --- | --- | --- |
| Body written, HTTP 200 | Documented provider acceptance/run-start report; completion, validation and evaluation remain unproven | Stop; missing user output does not justify another send |
| Body written, no final response | Ambiguous; the run may have started | Stop for reconciliation; no assumed idempotency |
| Body not written, no response | No body submitted by the modeled attempt | No automatic retry; live consent/budget/destination checks would be required |
| Non-200 final status | No accepted trigger report; preserve authentication, endpoint, size or backpressure category | No automatic retry; actual native policy remains unverified |
| Redirect | Destination rejected | No redirect or credential forwarding |
| Local consent denied before body write | Cancel locally | Stop |
| Consent denied after body write, with or without acknowledgement | Preserve the remote outcome alongside local denial | Stop; never restore consent or claim remote cancellation |

All model outputs are explicitly offline and leave actual host observation, valid consumption, evaluation, visible output, remote cancellation and M2 false. The model ignores no remote data because it accepts none: response bodies, labels, endpoint strings and credentials are rejected as inputs. Exact 200 matters; generic 2xx is not treated as accepted. Tests cover the security/semantic boundaries rather than prove a real Grok run.

The probe reports `body_submission_attempted`, rather than claiming a complete write. A partial or throwing write is ambiguous. The offline model's `requestBodyWritten` input is conservatively true whenever a body submission may have begun; it is never proof that all bytes reached the receiver. The probe consumes no response body and returns no endpoint or key in its safe result. Both preparation and response waits are bounded, including cancellation and late credential/DNS completion.

## Changes needed before a production profile

1. A reviewed native result type must distinguish receipt/run-start reports from `ValidConsumptionReceipt`, without changing existing direct-profile semantics.
2. Protected pairing must verify the provider origin/path and actual recipient, bind local grant/stream/scope authority, and disclose the actual key lifetime/rotation/revocation support. No invented capabilities endpoint or provider-enforced expiry.
3. Establish schema validation, duplicate/conflicting-body handling and trusted invocation context inside the existing agent infrastructure. Natural-language Skill instructions are insufficient proof of deterministic receiver admission.
4. Verify native size/rate/error and outage behavior. Preserve the OAP 16 KiB page, four-fresh-events/hour maximum, original deadlines, consent fences and resource limits; a quieter user-selected cadence may be appropriate for the base plan.
5. Observe a controlled synthetic run in the chosen Bot and report transport, validated consumption, evaluation and output separately. The current inspector's unknown-coverage estimates remain local until a truthful reviewed mapping exists.

See [AC-22/23/24/29](../../specs/acceptance-criteria.md), [direct receipt requirements](../../specs/protocol/profiles/direct-https.md#h5-event-publication-and-receipts), [authorization](../../specs/protocol/authorization.md) and [delivery status](../../specs/protocol/delivery.md#d6-health-and-response-stages). The production adapter and any Android publication stay disabled while these gates remain unproven.
