# ADR-0007: Portable synthetic reference with embedded state

Date: 2026-10-04. Status: implementation decision within the agreed Phase 4 scope. Contract: OAP 0.1.0.

## Decision

Use JavaScript ES modules and the Node.js runtime for the independent reference. Pin Ajv and ajv-formats for offline Draft 2020-12 schema checks, and ipaddr.js for address classification. Use built-in HTTP/TLS, hashing, process and test APIs. No web framework, database server, broker, background service or model SDK is required.

One simulated device process owns the publisher, redactor, consent, embedded outbox and direct adapter. A separate final deterministic receiver owns its admission and consumption ledger. The receiver never forwards activity. The demo uses literal loopback HTTP and newly generated synthetic tokens, explicitly selecting the isolated development profile. Adapter security tests also exercise actual isolated TLS and injected DNS/connection boundaries.

Each state file has a single process owner. Commit a canonical JSON snapshot by flushing a temporary file and renaming it, then begin a fenced dispatch while the local transaction lock is held. After process exit, a successor can load the same file. Existing invalid files fail closed. The device snapshot contains opaque credential references and a token-free paired-destination fingerprint, while the receiver stores credential hashes. Synthetic credentials are held in memory or explicit disposable test configuration.

Elapsed time governs within-process budgets and waits; UTC governs original expiry. Persist both checkpoints. Unknown cold-start downtime gives no timing credit, preserving remaining waits conservatively. Failed operations commit only safe clock metadata and roll back their requested mutation; they cannot dispatch work. Unknown clocks still permit local denial.

## Consequences and limits

The reference is small enough to inspect and test without operating infrastructure. Node.js is a reference-development choice; Android and other compatible publishers need not use it. Tests on Windows do not prove Linux or the minimum declared Node version. Those execution results must be recorded separately.

JSON snapshots do not provide a multi-process database, storage tamper resistance or demonstrated power-loss durability on every filesystem. Production deployments need appropriate owner permissions, protected credential storage and vetted final-receiver onboarding. Synthetic token files and mode bits on Windows do not establish those properties. No system service, public receiver, intermediary or software publication is authorized by this decision.

See the [setup guide](../reference.md), [Phase 4 evidence and limitations](../review/phase-4.md), [direct topology decision](0005-no-intermediary-infrastructure.md) and [immutable-window decision](0006-immutable-finalized-summary-pages.md).
