# Grok Bot direct webhook development review

Date: **2026-10-08**. Result: **isolated synthetic probe and offline regression checks passed; actual Grok delivery, production publication and M2/M3 remain unverified**.

The user selected the direct Grok webhook under [ADR-0012](../decisions/0012-grok-bot-direct-webhook-priority.md). The [canonical routine documentation](https://cursor.com/help/grok-bot/routines) describes the provider-issued POST URL, bearer key and JSON body. HTTP 200 reports acceptance and run start, not completed instruction or validated durable OAP consumption. The [follow-up research](../research/grok-bot-webhook-feasibility-2026-10-08.md) records this stronger evidence and retains the earlier MCP Events uncertainty.

## Implementation and scope

The [experimental probe](../../src/experimental/grok-webhook-probe.mjs) creates only fixed `test.app` examples with fresh OAP identity and timestamps. Callers cannot provide collected activity. It makes one attempt to the exact paired URL, checks public DNS addresses and the authenticated TLS peer, repeats local send-permission and deadline checks before writing, bounds preparation/connection/response waits, consumes no response body, and reports neither the endpoint nor bearer key. Local cancellation cannot prove that a remotely started run was cancelled. A local fifteen-minute deadline does not establish provider key expiry.

The [outcome model](../../src/experimental/grok-webhook-outcome.mjs) separates a documented 200 acceptance report, non-200 responses, failure before submission and uncertainty after possible submission. It grants no automatic retry, redirects, validated consumption, agent evaluation or production profile authority. The probe marks possible submission before the write call, so a throwing or partial write remains uncertain.

These modules are isolated from the production publisher, adapters and wire schemas. The [connection gate](../integration-drafts/grok-bot-profile.md), [pilot packet](../integration-drafts/grok-bot-webhook-pilot.md) and current roadmap now prioritize the webhook. The generated [Skill setup note](../../artifacts/grok-bot-pilot/run-af8c487c-fc73-4d0a-8007-029d262c4535/SETUP.md) packages eighteen synthetic interpretation cases; preparation installs nothing and submits nothing. Production pairing, receiver admission/deduplication and Android publication remain separate work.

## Verification

- [Full regression log](../../artifacts/grok-webhook-development/run-c77f400e-425a-4d0f-81e6-caf9d6a8d6bb/full-tests.tap): **258 tests; 257 passed, 0 failed, 1 skipped; 14,127.901 ms**, Node **v24.19.0**. The unchanged `invalid-event-consent-paused` exclusion reflects a receiver validator's inability to observe device-local pause authority; publisher lifecycle checks remain separate.
- [Probe tests](../../test/grok-webhook-probe.test.mjs) and [outcome tests](../../test/grok-webhook-outcome.test.mjs) include exact synthetic bytes, sensitive-error redaction, permission changes during preparation/TLS, rollback/expiry, all DNS answers, peer mismatch, bounded waits, partial-write uncertainty, single-attempt behavior and cancellation. An owned local HTTPS server received the exact JSON page with a synthetic key. A second owned TLS server with the wrong certificate hostname was rejected before submission. These are local mocks, not Grok account evidence.
- [Contract log](../../artifacts/grok-webhook-development/run-c77f400e-425a-4d0f-81e6-caf9d6a8d6bb/contract.txt): **9 schemas, 86 fixtures, 8 groups, 33 requirements and 29 acceptance mappings passed**. Local-link checks also passed; the final check includes this review.
- Root manually reviewed the prototype and documentation. No independent agent review of this new implementation is claimed.

The Android inspector and fixture APKs were not rebuilt. The final evidence record verifies all 56 accepted native input hashes, both APK hashes, four retained ChatGPT dots files and six generic Skill packet inputs against their prior evidence. Existing exact-byte emulator evidence remains attached to the unchanged inspector; no changed APK is proposed for phone testing.

No real Bot account, live credential, personal activity, model invocation, routine creation, plan upgrade, on-demand spending or intermediary infrastructure was used. Research used public primary-source pages; transport testing used owned local mocks. Actual account access and successful producing-device-to-Grok delivery remain unproven.

## Next development

Protected local operator setup can be built independently. A live synthetic trial later needs the user's existing Bot, its actual webhook routine and current provider-issued URL/key through that protected local flow. Establish actual base-plan access, recipient ownership and included-usage settings there. Do not request secrets in chat. Review native authentication, admission and receipt differences before enabling a production profile. Android accuracy work and Linux portability remain deferred; any changed phone-trial APK must pass emulator validation first.
