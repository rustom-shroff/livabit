# Meta Muse target and protected setup development review

Date: **2026-10-08**. Result: **local preparation verified; native Muse receiving contract and complete connection remain unresolved**. This review does not claim that Muse activity delivery works.

[ADR-0013](../decisions/0013-meta-muse-first-integration.md) records the user's switch to Meta Muse and authorization to continue independently with protected local setup. The active requirements, roadmap, architecture and integration plan now prioritize Muse and retain all Grok and ChatGPT research, probes and historical evidence. All 33 requirement IDs and 29 acceptance IDs remain unchanged.

## Verified product facts and present dependency

Official sources document free consumer Muse usage with a limit and the option to wait for refresh. They also document custom connectors and proactive updates from some connectors. The [research record](../research/meta-muse-webhook-feasibility-2026-10-08.md) distinguishes these from a general inbound webhook. No checked primary source supplies the requested receiving endpoint, authentication, body/status contract or duplicate semantics. This bounded finding does not establish that the user's observed feature cannot exist. The requested webhook documentation or supported account setup contract is needed to finish the Muse-specific sender and full protected pairing.

No Grok bearer header or HTTP 200/run-start rule is transferred to Muse. No Model API replacement agent, cloud relay, mailbox or forwarding machine is introduced. No account was accessed, credential obtained, event sent, routine/connector created, model invoked, purchase made or paid plan selected. Muse credential entry and all dispatch remain disabled before any prompt for secrets.

## Implemented local foundation

The [connection guide](../integration-drafts/meta-muse-connection.md) explains the [readiness command](../../scripts/prepare-meta-muse-connection.mjs), [hidden terminal input](../../src/experimental/protected-local-input.mjs) and [ephemeral connection draft](../../src/experimental/meta-muse-connection.mjs). The command accepts no connection configuration and makes no network or model call. It reports the unresolved native interface before any credential entry.

The hidden reader requires an exclusive interactive terminal, bounds input and waits, suppresses echo and restores terminal state. Read-only review found a split-paste flaw in the first version. The corrected version keeps raw input during a 100 ms quiet drain, capped at 500 ms, and rejects fragmented extra content. The added regression test covers the reported case and split CRLF. **Input arriving after the bounded drain and terminal restoration is outside this reader's capture window; arbitrarily delayed paste tails are not guaranteed to remain hidden.**

The opaque draft keeps at most 8 KiB in a private RAM buffer for at most fifteen minutes. It exposes no raw credential getter or network path. Cancellation, expiry, rollback, disposal and a refused attempt clear its owned buffer. One attempted connection consumes local authority even when refused. This deadline is local; it is not provider key expiry. RAM references and an owned cleared Buffer do not prove erasure of every JavaScript/terminal/OS copy. Persistent OS-protected storage and production durable consent remain unimplemented.

## Verification and preserved boundaries

- [Full regression log](../../artifacts/meta-muse-development/run-f2b91f70-88a5-4db5-b161-0f3fa7938059/full-tests.tap): **272 tests; 271 passed, 0 failed, 1 skipped; 18,561.2852 ms**, Node **v24.19.0**. The previously documented `invalid-event-consent-paused` exclusion remains: the receiver validator cannot observe device-local pause authority; publisher lifecycle checks are separate.
- Fourteen focused [hidden-input](../../test/protected-local-input.test.mjs) and [Muse preparation](../../test/meta-muse-connection.test.mjs) tests passed. They cover secret reflection, input bounds, terminal restoration, cancellation/timeouts, fragmented paste, private serialization, expiry/rollback, one consumed attempt and disabled native dispatch.
- [Owned Windows terminal evidence](../../artifacts/meta-muse-development/run-f2b91f70-88a5-4db5-b161-0f3fa7938059/terminal-validation.json) records real pseudo-terminal success and Ctrl+C cancellation using synthetic values. The values were not echoed and raw mode was restored. No real secret or Muse account was used.
- [Contract checks](../../artifacts/meta-muse-development/run-f2b91f70-88a5-4db5-b161-0f3fa7938059/contract.txt) passed 9 schemas, 86 fixtures, 8 groups, 33 requirements and 29 acceptance mappings. The final link check includes this review.
- Independent read-only setup review confirmed the paste correction and found no remaining blocking issue within the disabled scope. A separate agent checked primary sources; another checked target-document consistency and stable identifiers. Root reviewed final code, outputs and evidence bindings.

The final verification record checks the 56 accepted native Android inputs, both APK hashes, four ChatGPT dots files, six generic Skill packet inputs and retained Grok source/evidence bindings against their previous reports. No APK was rebuilt or proposed for phone testing. Linux and further collector precision/coverage proof remain deferred. Production Android publication, valid consumption, actual host evaluation and M2/M3 remain unproven.

## Next steps

The authorized local foundation is complete for the presently known interface. Finish the native Muse sender and end-to-end protected setup once the requested public webhook documentation or supported setup contract is supplied. Keep credentials local and hidden; no secret is requested in chat. A later actual-account synthetic trial may require the user's existing Muse. No approval, purchase or phone testing is required for the completed local work.
