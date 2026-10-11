# Grok Bot offline journaled synthetic sender

Date: **2026-10-08**. Status: **experimental local fixture composition; no Grok connection, native profile or host evaluation**. Grok Bot remains the target under [ADR-0014](../decisions/0014-resume-grok-bot-direct-webhook.md). This step connects the existing local [delivery journal](grok-bot-delivery-journal.md) and [routine admission model](grok-bot-local-admission.md) through a fixed virtual submission path. It uses authored `test.app` activity only. The user needs no account, subscription, private activity or phone test for this work.

The new [sender module](../../src/experimental/grok-journaled-sender.mjs) is separate from the retained [native webhook probe](../../src/experimental/grok-webhook-probe.mjs). That probe still creates its own event internally and exposes no durable pre-body reservation fence; it is unchanged and is not connected to this sender. Local composition is evidence about immutable-page handling and control races, not restart-safe native Grok transport. The [separate review](../review/grok-bot-journaled-sender-2026-10-08.md) records this run without rewriting earlier evidence.

## Local composition and authority

`openOfflineGrokSyntheticSender({journalStore, receiverStore, clock, fixtureBinding})` owns two distinct transactional stores: one for the bounded delivery journal and one for the deterministic final receiver. The fixture binding contains the exact synthetic `authorization`, `deviceBindingId` and `token`; only authored `test.app` scope is allowed. The factory provisions its own [reference receiver](../../src/receiver.mjs), creates the existing admission facade and opens the unchanged journal through an owned store wrapper. It does not capture a provider credential or treat event fields as authorization.

There is no arbitrary transport callback, configurable endpoint, HTTP listener, network request, account operation, model invocation or forwarding service. The virtual wire is module-owned and implements only the fixed scenarios below. It passes the journal's exact canonical page into the local receiving model without regenerating the event or replacing its identity. It cannot become a relay or a live sender by supplying a callback or URL.

| Operation | Local purpose |
| --- | --- |
| `stage(raw)` | Stage an authored raw JSON string or `Buffer` through the unchanged journal's validation, binding, immutable identity and bounded-retention rules. |
| `sendOne({event_id, scenario, signal?, timeoutMs?})` | Make one irreversible local fixture attempt for a staged page, using a fixed scenario. Persist its reservation and rolling-hour budget before possible virtual body submission; classify and record the resulting observation separately from local receiver admission. |
| `setLocalControl({state})` | Request the existing `active`, `paused` or `revoked` local journal state. A pause or revoke request immediately invalidates unfinished send authority before waiting for its durable control transaction. |
| `status()` | Inspect the bounded journal/attempt state and local evidence boundaries without returning page bodies, fixture tokens or provider configuration. |
| `inspectReceiver()` | Obtain the existing admission model's authenticated, fresh scoped observation view. It preserves original event/window/page identity and coverage/gap uncertainty and performs no Skill evaluation. |
| `releaseHeldResponse({event_id})` | Release the fixed held-response fixture for that exact event. It cannot stage another event or restore invalidated send authority. |
| `dispose()` | Retire the sender and invalidate its unfinished local authority immediately. It does not erase durable identity accounting, undo a receiver transaction or prove cancellation of any already-started effect. |

The unchanged journal allows one reservation per page, at most one unfinished reservation and four reservations in a rolling hour. Its 64-identity/1 MiB limit fails closed rather than evicting safe identity tombstones. Every outcome is terminal, including a failure before body submission. Reopening, pause/resume and missing responses never authorize a retry, replacement event ID or refreshed expiry. This conservative fixture policy amends no OAP wire or direct-profile delivery contract.

## Durable reservation and control fence

The sender begins its module-owned virtual submission synchronously inside the journal store's `afterCommit` callback, after the reservation and budget are persisted and while the same-instance transaction lock is retained. It checks the trusted clock, original event expiry, current durable local state/control generation and its own synchronous invalidation epoch before possible body submission. A failed reservation commit cannot begin submission.

A pause, revoke or disposal request advances that invalidation epoch before awaiting persistence. This closes the local gap in which a queued denial could otherwise wait behind a reservation and allow its body to start. A failed control commit leaves immediate denial latched until a supported successful local control repair; it does not silently restore sending. Resume does not restore an earlier attempt's epoch or erase its spent budget. Once virtual body submission has begun, later denial cannot undo an already-entered receiver transaction; the returned outcome must retain that possible effect rather than assert remote cancellation. Local pause/revocation controls sender authority and journal retention, not recall or deletion of previously admitted receiver copies.

The sender records possible body submission before a virtual operation that may throw. It then uses the unchanged journal's `recordOutcome` operation for the classified observation. A failed outcome commit leaves the persisted reservation unfinished and held. It does not discard uncertainty, replay the page or manufacture a durable terminal result. Cancellation or timeout fences new fixture submission/response handling without proving that an already-started receiving effect was undone. It cannot cancel a stalled filesystem transaction, so the fixture timeout is not a bound on overall storage completion.

The timeout uses a monotonic deadline checked before possible body submission and again before accepting any non-null modeled response. A blocked event loop cannot turn a delayed timer callback into late HTTP acceptance: a response observed after that deadline becomes response-unknown instead. Genuine `AbortSignal` state and listeners use captured built-in methods, so caller-defined signal properties cannot mask an actual abort. Input, staging, setup, submission and receiver failures use fixed public error text and bounded codes; underlying exception text is not echoed, including exceptions from staging-buffer accessors.

This fence is scoped to **one owning process and one instance per store**. The two supplied store objects must own separate backing storage; distinct objects aliasing the same filename are unsupported and must be prevented by the trusted local driver. Separate `JsonStore` objects or native routine processes sharing file paths are unsupported; local serialization does not establish cross-process locking. A file reopen demonstrates only the tested process-restart behavior. Windows `JsonStore` lacks directory fsync, so no power-loss guarantee is added. Corrupt state, storage failure, untrusted clocks and fixture-binding mismatch remain denial conditions.

## Fixed virtual scenarios and separate evidence

| Scenario | Authored behavior and interpretation |
| --- | --- |
| `accept_and_consume` | Submit the exact canonical body to the local receiver and model an HTTP 200 report. Local durable admission and modeled native acceptance are recorded separately. |
| `accept_without_consumption` | Model body submission and HTTP 200 without admitting the event to the local receiver. Acceptance alone supplies no consumption evidence. |
| `consume_then_lose_response` | Admit locally, then model loss of the final response. Sender outcome remains ambiguous despite separately inspectable local receiver evidence. |
| `reject_401` | Model a final HTTP 401 rejection without local admission. No alternate credential, destination or retry follows. |
| `throw_after_body` | Model a throw after possible body submission. The effect stays uncertain rather than being classified as definitely unsent. |
| `fail_before_body` | Model failure before possible body submission. Its reservation and budget remain spent and its outcome is terminal. |
| `hold_after_consumption` | Admit locally and hold the modeled response for a controlled delay/cancellation/denial exercise. A later release cannot authorize another submission. |

Every scenario is authored local behavior, not an HTTP response from Grok. The composition keeps four distinct facts: fixture body submission, modeled HTTP 200/run-start acceptance, local durable receiver admission and actual agent evaluation. The first three can be exercised independently; **actual native receipt, native valid consumption, host evaluation, production profile selection and M2 remain false or unproven**. A local consumption receipt must not be presented as a Grok-issued receipt or used to advance a production publisher's host-consumption state.

`inspectReceiver()` retains the admission model's narrower fixture capability: application labels and any `extensions` member are refused so stored pages can be reconstructed and checked against their original ledger digests. Its observations are point-in-time projections; they are not an atomic authorization fence for a later model call or exactly-once evaluation. Missing pages, partial coverage and sequence gaps stay unknown. Digest consistency is not cryptographic protection against an actor able to replace both stored page and digest. The [liveabit Skill](../../skills/liveabit/SKILL.md) still requires authenticated host admission and the user's host-owned standing context; this module installs no skill and supplies no goals, memories or automatic evaluation callback.

## Fixed exercise and preserved evidence

```text
node scripts/exercise-grok-journaled-sender.mjs
```

The [exercise](../../scripts/exercise-grok-journaled-sender.mjs) accepts no user configuration and runs authored local scenarios only. It reads no provider endpoint, credential, activity file or private context and creates no account or network connection. Each invocation writes a newly named synthetic evidence directory under `artifacts/grok-journaled-sender/run-<uuid>/`; previous runs are not overwritten.

Its nine fixed checks cover exact body/deadline preservation, acceptance versus local admission, denial without recall/resend, persistent budget, before/after-body failures and rejection, restart uncertainty, separate receiver inspection, journal revocation without receiver-copy deletion, and disabled network/profile/retry/evaluation authority.

The [validation record](../../artifacts/grok-journaled-sender/run-local-development/validation.json) and [development review](../review/grok-bot-journaled-sender-2026-10-08.md) bind tested sources and disclose observed limits. The earlier journal, admission, protected setup, probe and historical Grok/Muse/Skill/dots evidence keep their original scopes. Android inspector 0.2.4 and its accepted APK bytes are unchanged; any later changed phone-trial APK still needs exact-byte emulator testing first. The OAP contract, current profile enum, task IDs and 33 requirement/29 acceptance mappings remain unchanged.

## Next steps

Local development and synthetic review can continue independently. **No approval, account, subscription purchase or phone testing is required now.** A native Grok pilot still needs an eligible account or trial, supported routine access, exact protected destination/key setup and reviewed immutable-page/reservation/admission mapping. This fixture sender is not a request to buy a plan or revisit deferred collector accuracy proof.
