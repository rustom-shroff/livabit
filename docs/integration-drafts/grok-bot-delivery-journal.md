# Grok Bot offline delivery journal

Date: **2026-10-08**. Status: **experimental authored-fixture preparation; no network, native sending or publisher profile**. Grok Bot remains the selected target under [ADR-0014](../decisions/0014-resume-grok-bot-direct-webhook.md). The user has no Grok account. This local component requires no account, subscription, private activity or phone testing.

The journal prepares conservative sender accounting separately from the retained [synthetic Grok probe](grok-bot-webhook-pilot.md), [protected setup](grok-bot-local-setup.md) and [offline routine admission model](grok-bot-local-admission.md). It records immutable authored pages, one irreversible reservation per page, current local controls and hypothetical transport outcomes. It does not deliver those pages or cause any liveabit Skill evaluation. The [separate journal review](../review/grok-bot-delivery-journal-2026-10-08.md) records the tested local behavior and limitations.

## Local implementation and API

The [experimental module](../../src/experimental/grok-delivery-journal.mjs) exposes `openOfflineGrokDeliveryJournal({store, clock, fixtureBinding: {authorization, deviceBindingId}})`. A trusted local driver supplies an exact authored fixture binding; only `test.app` authority is supported. Activity-supplied identifiers cannot create or widen that binding. This is a local fixture authority, not a provider credential, an account pairing or proof that a real Grok routine authenticates a device.

The journal uses the existing strict OAP JSON parser/validator, canonical digest, [transactional store](../../src/storage.mjs) and [offline Grok outcome classifier](../../src/experimental/grok-webhook-outcome.mjs). It starts no HTTP listener, performs no network or account operation and supplies no provider endpoint, secret, model callback or forwarding service. No schema, native profile or production publisher contract is registered or changed.

| Operation | Local purpose and boundary |
| --- | --- |
| `enqueue(raw)` | Validate a raw JSON string or `Buffer` under the fixed fixture authority, then retain its immutable canonical page, digest, identities and original expiry. A repeated identity cannot stage another dispatch; a conflicting body cannot replace the retained page. |
| `reserve({event_id})` | Check current authority, controls, expiry and quota, then atomically persist one irreversible reservation and spend a rolling-hour first-dispatch token before returning an ephemeral local fixture descriptor. It includes the exact authored body, digest, event/attempt IDs and original expiry, with `local_reference_reservation: true`, `reservation_committed: true` and `network_permission_granted: false`. It is local data for a test driver, not a sender or permission to invoke Grok. |
| `recordOutcome({attempt_id, observation})` | Record one hypothetical observation with `connectionFailed`, `requestBodyWritten` and `responseStatus`. The journal derives local consent from its current control state, generation and authorization deadline; the observation cannot assert consent. Every recorded outcome is terminal. |
| `setLocalControl({state})` | Persist explicit `active`, `paused` or `revoked` local control. Pause prevents new reservations; revocation removes retained activity bodies and cannot be undone by replaying an old page or handle. |
| `status()` | Inspect only bounded counts, phases, event/attempt IDs, original expiry and retention/uncertainty flags. No raw page, application names/durations, scope, response text, endpoint or secret is returned, and no account status or remote cancellation is inferred. |
| `dispose()` | Retire the local object and clear its owned in-memory completion handles. Disposal does not revoke durable local control, prove remote cancellation, restore a spent reservation or permit a retry after reopen. |

Raw pages retain their original event/window identity and deadlines. Arrival, reopening, outcome recording and local control changes never refresh an event's expiry. The journal has a **64-identity and 1 MiB ledger limit**. It fails closed when safe identity accounting cannot fit; it does not evict tombstones, invent replacement identities or silently open another journal to bypass that limit.

## Irreversible reservations and restart uncertainty

Every page can receive **at most one reservation**. At most one reserved page may remain unfinished. The store transaction commits the reservation and recipient budget before any handle is exposed to the local driver. A failure after that commit can consume authority even if no handle reaches the caller. The conservative result is uncertainty, not permission to try again.

No handle survives process restart. Reopening an unfinished reservation leaves it side-effect-unknown and blocked; the journal neither reconstructs its handle nor assumes that no request was submitted. Once an outcome call matches an owned handle, malformed observation input or a failed outcome commit consumes that handle; the persisted unfinished reservation still cannot be resent. A terminal outcome cannot be reversed into queued state. Even `body_not_submitted` is terminal in this fixture policy: it does not authorize automatic retry, restaging or a replacement event ID. This stricter local preparation does not amend the retry rules for the agreed direct OAP profiles or establish any Grok idempotency guarantee. Clearing owned handles cannot erase a body already copied into a caller's reservation descriptor or guarantee erasure of transient JavaScript copies.

The recipient's maximum is **four reservations in any rolling hour**, including every distinct page. The token is spent in the reservation transaction rather than after a response. A crash, unknown outcome, pause/resume or file reopen does not reset that budget. This prepares the original OAP first-dispatch accounting rule conservatively; it is not an observed Grok rate limit or proof that reservation has performed a network dispatch.

## Denial, expiry and hypothetical outcome evidence

Pause blocks new reservation without renewing retained activity. Resume requires the explicit local state transition and fresh authority/expiry checks. Revocation and original event expiry purge retained page bodies while keeping bounded safe identity tombstones. Those tombstones preserve used identity accounting rather than retaining application durations as history. Revocation is local: it cannot delete data already submitted to a provider or undo an in-flight remote side effect.

Body cleanup runs when the journal opens and during journal transactions; denied operations also commit maintenance while rolling back their own changes. There is no background cleanup timer. Protected fixture scope metadata may remain in the bound journal; clearing a body removes its activity records rather than erasing the names of permitted fields from that authorization. Returned reservation copies are outside the store's deletion boundary.

Outcome recording does not trust a caller-supplied `localConsentActive` flag. Its current state and control generation determine the consent fact supplied to the unchanged classifier. A pause/resume across an already reserved attempt therefore cannot manufacture uninterrupted authority for that reservation. Observed request-body submission remains a possible remote side effect even when current local consent denies further work.

| Hypothetical observation | Evidence recorded |
| --- | --- |
| Exact HTTP `200` after body submission | `accepted_run_start_report`: the documented native run-start report category only. No valid OAP consumption receipt, completed run, evaluation or user output is proven. |
| Another final HTTP response | `not_accepted_report`, with the classifier's bounded attention category. It does not enable automatic retry or credential/endpoint fallback. |
| Body submitted, no final response | `ambiguous_after_body_write`: possible remote side effect remains uncertain. The local reservation is not replayed. |
| No body submitted | `body_not_submitted`: a terminal local observation, not a reusable dispatch authority. |
| Restart with an unfinished reservation | Side-effect-unknown and blocked. No restored handle or fabricated transport outcome. |

These are authored observations supplied by an offline driver, not received HTTP responses or actual host evidence. Classification advances no `last_valid_consumption_at`, host evaluation, notification or M2 claim. The [liveabit Skill](../../skills/liveabit/SKILL.md) continues to require authenticated host admission, fresh permitted data and host-owned standing context; this journal supplies none of that native wiring.

## Storage ownership and native integration gap

The journal supports **one owning process and store instance**. Transaction serialization and tested file reopen do not establish safe sharing among independent native routine processes. Corrupt storage, failed commits, binding mismatch or an untrusted clock deny work instead of triggering an in-memory fallback, hosted queue or fresh journal identity. Digest consistency is not cryptographic authentication against an actor able to replace both a page and its recorded digest.

Process restart/file reopen is narrower than power-loss assurance. On Windows the current `JsonStore` does not perform directory fsync, so these local results cannot promise that every committed replacement survives a sudden power failure. Persistent terminal markers and budgets are part of the tested single-owner journal scope, not verified cloud-runtime behavior.

The retained [Grok probe](../../src/experimental/grok-webhook-probe.mjs) generates a new synthetic event internally. It cannot accept a journal's immutable page and does not expose a durable reservation fence before writing its request body. **This journal is not integrated with, wrapped around or a hardening of that probe.** Both remain separate preparations. A future native mapping must review page identity, local generation checks, actual body submission and irreversible durable reservation together before claiming restart-safe sending.

Actual supported account eligibility, exact protected destination/key setup, trusted routine raw-input mapping, receiver ownership, host persistence/concurrency and separately observed valid admission/evaluation remain unresolved. A shared provider cloud computer does not itself establish those properties. The [Grok connection gate](grok-bot-profile.md), [direct integration plan](../agent-integration-plan.md) and production-profile restrictions stay in force. Neither native retry/idempotency support nor same-device Android lifecycle is inferred from local tests.

## Fixed local exercise and evidence

```text
node scripts/exercise-grok-delivery-journal.mjs
```

The [exercise](../../scripts/exercise-grok-delivery-journal.mjs) uses authored synthetic fixtures only and accepts no user configuration. It opens no account or network connection and reads no endpoint, credential or private activity. Each run creates a new uniquely named synthetic evidence directory beneath `artifacts/grok-delivery-journal/`; earlier evidence is not overwritten.

The development [validation record](../../artifacts/grok-delivery-journal/run-local-development/validation.json) and [review](../review/grok-bot-delivery-journal-2026-10-08.md) bind the tested sources, results and limitations. The preceding admission module, tests, review and run evidence remain unchanged, as do the accepted Android APKs and earlier Grok, Muse, Skill and dots history. No APK is changed; any later changed phone-trial APK still requires its exact-byte emulator gate first.

One existing protected-connection test now leaves a larger real scheduling margin before advancing its modeled clock to the original review deadline. The runtime and expiry assertion are unchanged; its exact prior source and the initial full-suite failure are preserved in this run's evidence. This test revision is disclosed separately from byte-for-byte preservation of earlier run artifacts.

## Next steps

Local development and synthetic review can continue independently. **No approval, account, subscription purchase or phone testing is required now.** A later actual Grok pilot needs an eligible account or trial, supported routine access, exact protected setup and reviewed native page/reservation/admission mapping. Local journal evidence does not ask the user to purchase a plan or revisit deferred collector accuracy proof.
