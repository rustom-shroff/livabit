# Grok Bot offline routine admission model

Date: **2026-10-08**. Status: **experimental local fixture preparation; no deployed Grok receiver, native profile or host evaluation**. Grok Bot remains the selected integration target under [ADR-0014](../decisions/0014-resume-grok-bot-direct-webhook.md). The user has no Grok account; no account, subscription, private activity or phone test is needed for this step.

The [protected setup module](grok-bot-local-setup.md) prepares one synthetic native webhook attempt. This separate model prepares deterministic validation, duplicate handling and observation on the receiving side. Local receipt evidence is distinct from the provider's documented HTTP 200/run-start report, and neither establishes Grok interpretation or communication. See the [local admission review](../review/grok-bot-local-admission-2026-10-08.md) for this run and the retained [resumption review](../review/grok-bot-resumption-2026-10-08.md) for the earlier setup work.

## Local implementation

The [experimental module](../../src/experimental/grok-routine-admission.mjs) exposes `createOfflineGrokAdmissionModel({store, clock, fixtureBinding})`. A trusted local driver first provisions `fixtureBinding` in the existing [reference receiver](../../src/receiver.mjs) using `Receiver.configure`. The binding contains an authorization, synthetic token and device binding identifier. Provisioning is a local fixture operation; the model does not pair an account, issue a provider credential or establish native invocation authority.

Only authored `test.app` namespaces are supported. Each admission call authenticates the exact protected fixture binding and accepts a raw JSON string or Node.js `Buffer`, using the existing strict parser, OAP validator and transactional `Receiver.consume` ledger. Caller-owned bytes are copied before asynchronous work. Event-supplied recipient identifiers and scope cannot create or widen that binding. The model opens no HTTP listener, sends no network traffic and introduces no forwarding machine or service.

This fixture model supports a narrower capability than the OAP schema: any application label or `extensions` member, including an empty object, is refused with `unsupported_capability`. The unchanged reference receiver discards those optional fields when storing observations. Refusing them here permits complete retained-event reconstruction and comparison with the original admission digest. This is a local experimental restriction, not an OAP wire-contract change, and does not establish native Grok storage behavior.

The reference receiver retains its existing time, scope, page, duplicate and bounded-storage checks. A repeated event can receive the appropriate local duplicate result without adding its observation again; a conflicting duplicate fails. Receipt creation follows successful validation and durable transactional admission. The experimental result records the local evidence boundary and does not assert native Grok receipt, valid host consumption, completed evaluation or M2.

`dispose()` retires the local model object, clears its owned token buffer and rejects future calls. It does not revoke the already provisioned receiver credential or cancel an admission that has already entered its durable transaction; an in-flight admission may still return a receipt. Authority withdrawal uses the receiver's credential rotation or expiry. Clearing the owned buffer does not guarantee erasure of transient JavaScript or receiver-authentication copies.

## Separate observation inspection

The model's `inspect()` operation reads durable owned observations separately from admission. It authenticates the fixture binding before inspection and again after the state snapshot, rejecting revocation or binding changes observed at that second authentication check. Projection filters the exact device, recipient, stream, subscription and scope revision. It revalidates reconstructed retained pages and checks each complete event against its original stored ledger digest, rather than treating stored JSON as trusted merely because it is present on disk. A schema-valid changed duration or window still fails if it disagrees with the retained digest. A labeled or extended record admitted directly by the reference receiver before this facade also fails that check because its original complete representation cannot be reconstructed.

Freshness uses the trusted clock and original event/window/expiry values. Arrival time does not replace event time. The projection retains original page and event identities, coverage, missing pages and sequence gaps; its application records contain only namespace, identifier and duration. A whole-window observation requires every consistent page and complete coverage. Partial pages, missing sequences and excluded applications remain uncertainty; absent activity does not become zero.

Inspection is a point-in-time view, is not atomic with an earlier receipt and does not fence a later model invocation against subsequent revocation or expiry. It supplies no automatic liveabit Skill, model, notification or device-action callback. Repeated inspection is not exactly-once evaluation. The [liveabit Skill](../../skills/liveabit/SKILL.md) still requires authenticated host admission and host-owned standing context before interpreting activity; this offline model does not install that skill or supply user goals, memories or communication preferences.

## Ownership, storage and native boundaries

This model supports **one owning process and store instance**. Local restart evidence can establish retention under that ownership; it does not establish safe concurrent access by independent Grok routine processes. A shared file on an agent's cloud computer is not sufficient evidence of receiver isolation or cross-process transactions. Corrupt state, storage failure, clock distrust and authorization failure remain denial conditions rather than permission to bypass the ledger. Digest comparison detects inconsistent retained data; it is not cryptographic storage authentication against an actor able to replace both the page and its ledger digest.

The following native facts still require actual supported host evidence:

- How an intended routine exposes the original webhook JSON and whether its representation is preserved.
- How trusted invocation context identifies the actual Bot, routine, device authorization and scope without trusting activity-supplied fields.
- Where a receiver can run inside the chosen agent infrastructure, and how its durable state, retention, revocation and concurrency are protected.
- How local receipt and observations become separately observed host admission, evaluation and appropriate response.

No Grok-side installation recipe or runtime adapter is implied. The model supplies no provider endpoint, hostname, token lifetime, native idempotency guarantee or automatic retry. The [connection gate](grok-bot-profile.md), [pilot scope](grok-bot-webhook-pilot.md), [direct integration plan](../agent-integration-plan.md) and original OAP authorization/receipt contracts remain in force. Production publisher profiles remain unchanged and disabled for Grok.

## Fixed local exercise and evidence

```text
node scripts/exercise-grok-routine-admission.mjs
```

The [exercise](../../scripts/exercise-grok-routine-admission.mjs) uses fixed authored synthetic fixtures. It accepts no user configuration, account credentials, private activity, input files or environment configuration and contacts no account or network. Its output is limited to a newly created `artifacts/grok-routine-admission/run-<uuid>/` evidence directory. Repeated runs create separate evidence; no earlier Grok, Muse, Skill or Android evidence is overwritten.

The run's [validation record](../../artifacts/grok-routine-admission/run-root-local-development/validation.json) and [review](../review/grok-bot-local-admission-2026-10-08.md) state the tested behavior, source bindings and limitations. Local admission/storage results stay separate from provider HTTP acceptance, native host consumption and evaluation. Historical evidence retains its original claims and hashes. No APK changes are made; any future changed phone-trial APK still requires exact-byte emulator testing first.

## Next steps

Local development, synthetic fault checks and review can continue independently. No approval, account, subscription purchase or phone testing is required now. A later native account pilot needs an actually eligible account or trial, supported routine webhook access, exact protected destination/key setup and observed trusted invocation mapping. That gate is unchanged; current local success does not ask the user to purchase a plan or prove phone accuracy.
