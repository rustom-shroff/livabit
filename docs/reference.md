# Run the OAP direct reference

OAP version: **0.1.0**. Reference date: **2026-10-04**. This implementation uses synthetic activity and a final deterministic receiver. It does not connect a commercial personal agent or collect Android usage. The optional **liveabit Skill** is a later integration deliverable.

The user agreed to the contract and authorized Phase 4 on 2026-10-04: “ok keep going if there is no further input required from my side”. The no-intermediary requirement remains mandatory. See the [Phase 4 evidence review](review/phase-4.md), [contract](../specs/protocol/oap.md), and [acceptance criteria](../specs/acceptance-criteria.md).

## Requirements and setup

Use Node.js 22 or later and **pnpm 11.25.0**. Exact tested Node versions and outcomes are in the runtime reports; Linux remains unverified. A maintained 22.x patch checks the minimum supported major, not every historical patch. Use the exact dependencies and package-manager declaration in [package.json](../package.json) and [pnpm-lock.yaml](../pnpm-lock.yaml). Installation downloads development dependencies; subsequent tests and the demo need no model key, account, hosted queue or network service.

From the project directory in Windows PowerShell:

```powershell
node --version
pnpm install --frozen-lockfile --ignore-scripts
node scripts/validate-spec.mjs
node --test test/*.test.mjs
node src/demo.mjs
```

From the project directory in a Linux shell:

```sh
node --version
pnpm install --frozen-lockfile --ignore-scripts
node scripts/validate-spec.mjs
node --test test/*.test.mjs
node src/demo.mjs
```

These are separate checks. The contract checker validates schemas and fixtures. The runtime suite exercises consent, storage, delivery, receiver consumption and process recovery. The demo is the two-process lifecycle and benchmark entry point. The saved [evidence manifest](review/phase-4-validation.json) and [demo samples](review/phase-4-demo.json) record actual outcomes. The user accepts Windows evidence for M1 development progression under [ADR-0008](decisions/0008-windows-baseline-and-android-integration-priority.md); Linux remains explicitly untested and deferred.

Run `npm run verify` to execute the runtime suite, direct demo and static checks in sequence and refresh the safe evidence files. It records exact dependency/source hashes, individual outcomes, explicit skips, destinations, 100 raw timing samples and gate limits. `node src/demo.mjs --save-evidence` refreshes only the demo evidence. Both commands replace generated evidence files; they publish nothing and delete their own disposable synthetic demo state.

Verification saves platform-specific copies such as `phase-4-validation-win32.json` and major-version copies such as `phase-4-validation-win32-node22.json`, with corresponding contract/demo reports. Linux runs preserve Windows evidence; Node 22 runs preserve Node 24 evidence. General filenames describe the latest run. A failed repeat records failure and marks unexecuted stages pending instead of retaining an old pass as current. Missing historical generated links in a source-only handoff receive explicit `not_run` placeholders, preserving their absence rather than inventing evidence. Review matching source/dependency hashes and concrete outcomes before deciding the M1 gate. See the [Linux handoff guide](linux-verification.md).

## What runs

The device process combines the simulated observations, local redactor/aggregation, consent authority, durable outbox and direct adapter. It sends immutable events to the second process, the final deterministic receiver. Both keep embedded local state. The receiver validates and durably deduplicates observations; it terminates consumption and forwards nothing.

The selected demo profile is `direct-loopback-test-v1`, restricted to a literal loopback address and synthetic credentials. The test receiver refuses a public bind and production-profile shortcuts. No liveabit account, project-operated endpoint, subscription service, shared credential, relay, proxy, broker, external database or separate user forwarding bridge is needed. Package installation is outside the activity-delivery topology.

| Component | Implementation | Responsibility |
| --- | --- | --- |
| Device publisher | [publisher.mjs](../src/publisher.mjs), [aggregation.mjs](../src/aggregation.mjs) | Explicit local approval; recipient scope; clipping/redaction; immutable window pages; bounded history, budgets and retry cycles; local pause/revoke/narrow |
| Direct adapter | [direct-adapter.mjs](../src/direct-adapter.mjs) | Authenticated discovery and direct publication; bounded response parsing; fixed destination; DNS/peer/TLS verification; consent checks immediately before connection and before header/body writes |
| Final receiver | [receiver.mjs](../src/receiver.mjs) | Independent receiver authorization; validation; durable consumption ledger; duplicate/conflict detection; incomplete-page and order handling |
| Embedded state and time | [storage.mjs](../src/storage.mjs), [clock.mjs](../src/clock.mjs), [protocol.mjs](../src/protocol.mjs), [control-records.mjs](../src/control-records.mjs) | Atomic JSON snapshots; single-owner transaction fence; strict parsing/schema/semantic checks; original expiry and clock checks |
| Synthetic process entries | [publisher-cli.mjs](../src/publisher-cli.mjs), [receiver-cli.mjs](../src/receiver-cli.mjs) | Foreground test configuration and process lifecycle; no installation, service registration or real credentials |

The process tests generate their own explicit `synthetic_only` configuration and temporary state. They start a publisher process, exit it, and launch another publisher against the saved outbox while a final receiver remains directly reachable. Offline revocation survives that exit/restart. Test configuration may contain a newly generated synthetic token; it is never a production secret-store implementation. The receiver's persistent admission records store token hashes, while the device's durable activity state contains opaque credential references.

## Delivery and controls

A receiver-issued credential permits access to the receiver. Device-local monitoring/sharing consent separately permits collection and export. Neither received data nor a capability response grants consent. A new scope epoch requires matching receiver admission and credentials before further publication.

The publisher freezes a finalized window once, including all deterministic pages and original deadlines. A fresh recipient event spends the rolling publication budget before a request starts; a retry preserves the same event identity/body. Consent, expiry, capacity and attempt limits continue to apply during reconnect. Receiver backpressure blocks the affected recipient's other pending events too. A hint exceeding one hour stops the cycle until an eligible explicit recovery transition after its deadline. Timer expiry alone starts no new cycle.

Within a running process, fresh/read budgets and retry/cycle waits use elapsed time, so moving the wall clock forward cannot release them early. UTC still expires activity and grants. On cold restart, unknown downtime gives no timing credit: the remaining waits resume conservatively from the saved budget checkpoint. A runtime can explicitly attest trustworthy restart time; the reference does not infer it from a newly created clock. Failed operations roll back their requested changes while saving only safe clock checkpoints. Invalid clock readings still permit durable revocation.

Approval fixes the actual endpoint and local TLS trust configuration through a token-free destination fingerprint. Replacing the URL, address allowlist or trust anchor requires fresh verified local approval; changing an opaque handle alone cannot move queued activity elsewhere. Token renewal at the same approved destination preserves this fingerprint. The final demo receiver restarts at its original paired port.

Pause denies new reads/sends/retries; resume never backfills the paused interval. Narrowing purges the old stream and does not reissue finalized observations as a correction. Revocation commits locally, purges controlled queued activity and removes the usable injected credential without waiting for a network acknowledgement. Work that had already left the device may still arrive; local deletion cannot recall received data or erase OS history.

A verified `200` receipt records durable **valid consumption** of a page. An incomplete page group remains incomplete. A generic success, invalid receipt or timeout is ambiguous and cannot establish valid consumption. Neither a valid receipt nor a deterministic mock observation proves agent evaluation, notification or behavior change. Scope/coverage/capacity failures produce safe local health rather than an invented zero-use window.

## Limits of this reference

- JSON snapshots require one owning process per state file. Multiple processes writing the same file, power-loss behavior on every filesystem, storage tamper resistance and database-grade crash recovery are unverified. File flush/rename and restart tests are useful evidence within this scope.
- The isolated demo uses memory-held synthetic credentials and explicit test configuration. Receiver rotation invalidates prior bearer admissions while preserving consumption history, and has restart/ownership tests. An OS keystore, production token issuance/onboarding, Windows ACL protection and protected credential recovery have not been integrated or proven.
- `direct-https-v1` and `direct-local-tls-v1` safeguards are exercised with injected boundaries and a real isolated TLS test server. No deployed cloud personal-agent receiver has been verified. The insecure loopback exception is a simulator setting, not an approved production setting.
- Cloud IPv6 checks combine the maintained `ipaddr.js` classifier with an IANA allocation snapshot. Review that snapshot and dependency versions with software releases; runtime delivery does not consult an intermediary or a live registry.
- Retry scheduling is foreground/reference behavior driven by the caller. There is no Android background worker, reboot service, battery measurement, device permission implementation or device enforcement capability.
- Four-hour outage, accelerated 24-hour observation and clock tests use synthetic time. They prove the tested accounting paths; they do not establish delivery reliability under mobile OS restrictions or an eventual-delivery guarantee.
- The reference stores selected synthetic observations for bounded consumption. It does not import goals or personal-agent memories, call an AI model, install the liveabit Skill or claim compatibility with ChatGPT, Claude or Gemini.

Linux execution is unavailable here and on hold by the user's priority change. No Linux setup or selection is required for current progression. The accepted Windows baseline now permits the [native local collector/inspection](../android/README.md) first, with agent selection deferred under [ADR-0009](decisions/0009-android-local-inspection-first.md). Existing-agent M2 and real-device M3 still require their own actual evidence.
