# Grok Bot offline journaled sender development review

Date: **2026-10-08**. Target: Grok Bot native routine webhook under ADR-0014. Result: **local journal/admission composition verified with fixed authored fixtures**. No Grok account, subscription, provider credential, actual device activity or intermediary infrastructure was used. This review advances local development; it does not establish native delivery, agent evaluation or M2/M3.

## Result and scope

The new [sender](../../src/experimental/grok-journaled-sender.mjs) stages an authored `test.app` OAP page into the existing bounded journal, durably reserves one attempt and its rolling-hour budget, and begins a fixed module-owned virtual submission inside the journal store's synchronous `afterCommit` boundary. It sends the exact canonical page to the owned final local receiver without regenerating its identity, window, sequence or original expiry. The [delivery journal](grok-bot-delivery-journal-2026-10-08.md), [admission model](grok-bot-local-admission-2026-10-08.md), core receiver and retained native webhook probe are unchanged.

Pause, revoke and disposal requests immediately invalidate an unfinished attempt before waiting for a durable local control transaction. Submission checks both the committed state/generation and the synchronous invalidation epoch. A failed control commit leaves sending denied until a supported successful explicit repair. Monotonic deadline checks fence body submission and non-null response completion even if storage blocks the timer callback. An already-entered receiver transaction may finish after denial or timeout; its actual durable result is a separate final-consumer observation, never a fabricated Grok receipt.

The factory accepts only separate local stores, a trusted clock and an exact synthetic fixture binding. No endpoint, arbitrary transport callback, HTTP client/listener, host-profile switch, real credential entry or Skill/model callback is exposed. Captured built-in abort operations avoid executing overridden signal accessors/listeners. Public argument/staging failures use fixed error text, and poisoned Buffer size accessors are refused without invoking their getters. The sender does not retain the fixture token string after setup; its owned admission component retains its existing fixture credential handling.

## Verification

Node **v24.19.0**, Windows. The [validation record](../../artifacts/grok-journaled-sender/run-local-development/validation.json) binds final sources, test transcripts, synthetic state files, preserved baseline evidence and contract results. Its [verification helper](../../artifacts/grok-journaled-sender/run-local-development/verify-development.mjs) checks the prior baseline hashes before writing this run's record.

| Check | Recorded result |
| --- | --- |
| New sender focused suite | **30 tests passed**, 0 failed, 0 skipped; 8,488.866 ms |
| Full reference suite | **370 tests: 369 passed, 0 failed, 1 existing skip**; 33,281.4457 ms |
| Fixed local exercise | **9 checks passed** in [this retained run](../../artifacts/grok-journaled-sender/run-1e627657-cbb5-4d0b-befb-d2590074cc62/exercise.json) |
| OAP contract and local links | Recorded in the [contract report](../../artifacts/grok-journaled-sender/run-local-development/contract-validation.json); existing 9 schemas, 86 fixtures, 8 groups, 33 requirements and 29 acceptance mappings unchanged |
| Independent runtime/CLI review | No remaining actionable findings in the offline, single-owner scope |

The existing skipped receiver-validator fixture cannot observe device-local pause authority; publisher lifecycle tests remain separate. Full-suite network activity is limited to the existing owned local reference receiver tests. The new sender and fixed exercise make no network requests.

Focused tests cover durable reservation before local admission, immutable bytes, concurrent requests, failed reservation persistence, committed reservation with a lost return, failed outcome persistence, restart uncertainty, immediate control/disposal fences, original expiry, untrusted/backward clocks, cancellation, blocked timers and late durable consumption. They distinguish modeled HTTP 200 without consumption from actual local receipt, unsupported payload capability from admission, and missing responses from definitely unsent bodies. No outcome permits automatic retry.

The fixed [exercise](../../scripts/exercise-grok-journaled-sender.mjs) accepts no configuration, activity file, endpoint or provider credential. It uses distinct final receiver and journal files and creates a new evidence folder on every invocation. Its nine checks cover immutable identity/expiry, run-start versus consumption, pause/resume, four-attempt budget, separate submission failure classes, held restart state, final consumer inspection, sender revocation and disabled live capabilities. The completed run retains an unfinished reservation and its separately admitted local copy after process reopening; the same event cannot be sent again.

## Findings corrected and retained failures

Independent review reproduced submission after a deadline when storage blocked the timer, and a late durable receiver response incorrectly modeled as accepted. The final runtime checks monotonic time immediately before possible body submission and normalizes non-null late responses to an ambiguous observation. Review also found overridden signal/reflection/Buffer accessors could expose an exception message or disrupt pending cleanup. Captured signal intrinsics, protected cleanup, accessor refusal and fixed error normalization close these cases without changing frozen components.

The [initial focused transcript](../../artifacts/grok-journaled-sender/run-local-development/focused-tests-initial.tap) records 29 passes and one failure. Its admission-only assertion hook remained installed during later receiver inspection, when the journal had already reached a terminal phase. Scoping that hook to its first admission commit corrected the test harness; runtime behavior did not change for this failure.

The initial exercise folder `artifacts/grok-journaled-sender/run-13f00d78-e7bd-4f7d-af9a-e0ade25a658a/` is preserved. It incorrectly treated an event ID as the receiver's composite ledger key and failed to observe an already-admitted page. The CLI now reads each ledger entry's event identity and installs handling on pending attempt promises immediately. That interrupted folder supplies no completed exercise claim; its state files are separately bound in the validation record.

The [first contract report](../../artifacts/grok-journaled-sender/run-local-development/contract-validation-initial.json) recorded a missing local link to this run's then-uncreated contract output. Its [transcript](../../artifacts/grok-journaled-sender/run-local-development/contract-initial.txt) is retained. The completed output now exists and the final local-link/contract check passes; no schema or fixture change was required.

Reviewed SHA-256 hashes:

| Source | SHA-256 |
| --- | --- |
| Sender runtime | `c6f8c707375ec6b0e012e50369d649db889cf217f5db73d3e7acc5c213560705` |
| Fixed exercise CLI | `f4c20b85aebcad2aa08a4c958910567fa56c917bf425daa4dad5603230edc0e2` |

## Preserved boundaries

The retained native probe still creates its own synthetic event and is unconnected to this sender. The virtual wire supplies no native endpoint authentication, invocation mapping, provider idempotency, actual host consumption or agent evaluation evidence. A local receiver receipt belongs only to the final local fixture consumer. Modeled run-start acceptance never advances native valid consumption, automatic Skill invocation, production profile selection or M2.

Exactly one process owns one instance of each store. Distinct wrapper objects aliasing the same backing file are unsupported; the trusted driver must choose separate files. Filesystem stalls can exceed the fixture timeout, and started receiving effects cannot be recalled. File reopening proves the observed process-restart behavior, not Windows power-loss survival; directory fsync remains unavailable in the unchanged store. Coordinated rewriting of body and digest is outside digest-consistency protection. The journal's bounded, non-evicted identity history eventually fails closed; no automatic reset or resend policy is introduced.

Prior Grok/Muse/dots research, protected setup, Skill packets, earlier journal/admission evidence and accepted native inputs remain preserved. Android inspector **0.2.4** and APK bytes are unchanged; no collector build, emulator run or phone test was requested. Linux and further precise-duration/coverage proof remain deferred.

## Next steps

**Local development can continue independently. No approval, purchase, account or phone testing is needed now.** Prepare the separate native immutable-page transport mapping and protected destination/credential handoff next, while retaining acceptance/consumption distinctions. A live Grok pilot still requires eligible account/routine access and exact protected setup before any real provider request. No subscription recommendation follows from this local validation.
