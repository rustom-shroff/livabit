# Accepted priority change and Windows reference baseline

Date: **2026-10-04**. Decision: **user-authorized progression**. [ADR-0008](../decisions/0008-windows-baseline-and-android-integration-priority.md) records the change.

The user prioritized Android feasibility and direct agent integration, explicitly accepted the Windows affirmations as sufficient for now, and put Linux extensibility on hold. M1/G2 is accepted as a Windows reference development baseline. Linux is not a blocker or a claimed pass. The current priorities are direct existing-agent integration and Android feasibility in parallel.

## Accepted evidence

The accepted historical Windows runs used Node **22.23.3** and **24.19.0**, matched all 154 captured source-file hashes, and each recorded **201 passes, one explicit skip, zero failures**. Both actual two-process demos delivered 100 summaries, recovered 16 pages after a simulated four-hour outage within publication budgets, and denied activity after offline revocation and publisher restart. Local p95 values were **131.7266 ms** and **113.3886 ms** respectively; they are synthetic reference timings, not production delivery promises.

The source-only handoff for that revision has SHA-256 **478cceb87a538c333e3a886f126007beb0ae3a2bb0f0c12636c9eb605340c1d0** and remains parked under the local `artifacts/linux-verification/` directory. Runtime-specific generated reports describe the latest run and can change when verification is repeated; this dated record preserves which affirmations the user accepted. See the [Phase 4 review](phase-4.md) for concrete tests, scope and exclusions.

## Scope of acceptance

- Windows synthetic protocol/lifecycle/recovery evidence permits Phase 5 implementation and Android feasibility to proceed.
- The skipped paused-consent fixture is a device-local authority condition; actual publisher lifecycle tests cover that boundary. It is not a receiver authorization claim.
- Linux portability remains untested and deferred. No cross-platform support is asserted.
- OS keystores, protected production credentials, Windows ACLs, all-filesystem power loss, physical Android reboot/background behavior and deployed receiver onboarding remain unverified.
- M2 requires a real supported existing agent and observed context-sensitive behavior. A native queue receipt, mock receiver or installed skill alone does not satisfy it.
- M3 requires actual Android collection/direct delivery, permission/control trials, measurement and approved release thresholds.

The user did not select a real host/account or relax no-intermediary, authentication, privacy, consent, retention, retry or enforcement constraints. Preserve those requirements while resolving the actual receiving path. No new approval is needed to act on this roadmap change; account-specific actions and any material protocol/profile proposal must still be made concrete before requesting necessary input.
