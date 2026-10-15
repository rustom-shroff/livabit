# Validate the OAP contract and reference

For the personal-agent direction, start with the [current system](../docs/current-system.md) and [runtime tests/setup guide](../integrations/openclaw/personal-agent/README.md). [configure-openclaw-personal-agent.ps1](configure-openclaw-personal-agent.ps1) installs durable activity processing, an isolated activity conversation in the existing personal agent and guarded companion delivery, preserving the model and private preferences. [export-openclaw-activity-connection.mjs](export-openclaw-activity-connection.mjs) creates a separate private Android receipt setup after the matching host and sender are ready; it never overwrites the original connection. [check-openclaw-personal-agent-host.mjs](check-openclaw-personal-agent-host.mjs) records sanitized native checks; `--observe-only` avoids tool calls and synthetic receipt writes. [verify-openclaw-invocation-contract.mjs](verify-openclaw-invocation-contract.mjs) audits the actual installed SDK metadata builders without running a model. [inspect-companion-background.mjs](inspect-companion-background.mjs) inspects a connected Android device without changing settings. The commands below also retain the independent OAP and historical runtime checks.

The publisher build/test scripts target **0.12.0-poc**, version code **14**. Current build/emulator/physical evidence is recorded separately in the [processing review](../docs/review/personal-agent-processing-2026-10-15.md); the [0.8 continuity review](../docs/review/android-continuity-2026-10-12.md) remains evidence for its own version. Estimation runs on Android; the separate desktop receiver remains the actual final inspection target when testing without an agent.

The Phase 3 artifact checker validates files without opening sockets or calling a model. Schemas resolve entirely from local files after dependencies are installed. The separate Phase 4 recorder runs the synthetic device and final receiver over isolated loopback HTTP; it never reads real usage or operates an intermediary.

Use Node.js 22 or later and pnpm. Dependencies are exact in [package.json](../package.json) and [pnpm-lock.yaml](../pnpm-lock.yaml); do not run dependency lifecycle scripts.

```text
pnpm install --frozen-lockfile --ignore-scripts
pnpm run check:spec
node scripts/validate-spec.mjs --report docs/review/phase-4-contract.json
```

The checker uses Ajv's Draft 2020-12 class with meta-schema validation, format assertion, strict schema compilation, no coercion/default insertion/property removal, offline reference registration and explicit cross-field checks. Relative schema IDs are registered under a synthetic `example.invalid` base only for resolution; no request is made. [Ajv documentation](https://ajv.js.org/json-schema.html)

It rejects undeclared/missing fixtures, incorrect expected rejection rules, malformed UTF-8/JSON, duplicate JSON keys (including escaped equivalents), negative zero, unsafe integers, lone surrogates, byte overflows, temporal/coverage/scope/control inconsistencies and incomplete/inconsistent group interpretations. Positive overlap, timestamp-looking data labels and complete empty-page cases protect legitimate semantics. Synthetic grant/context cases are fixture checks; they do not exercise a running consent fence or real credentials. The saved report includes schema/fixture/document/interface/checker/dependency hashes, every outcome, environment, counts and untested milestones. The intentionally malformed UTF-8 fixture is binary test input and should not be repaired by a text editor.

Output is a concise pass/fail line; failures produce a nonzero exit. The historical [Phase 3 result](../docs/review/phase-3-validation.json) identifies its original inputs. Current static evidence belongs in the [Phase 4 contract report](../docs/review/phase-4-contract.json). Linux runtime portability remains untested. Artifact validation itself grants no collection/delivery authority and makes no commercial-host support claim.

## Runtime verification and safe evidence

```text
npm test
npm run demo
npm run verify
```

The [reference recorder](verify-reference.mjs) runs the actual runtime suite, two-process direct lifecycle and 100-summary latency benchmark, then audits the contract artifacts and local links. It saves [individual outcomes and hashes](../docs/review/phase-4-validation.json), [demo samples and destinations](../docs/review/phase-4-demo.json) and current static results. It labels skipped contexts and incomplete milestones; success means the recorded reference checks passed in the named environment.

Only synthetic data, disposable credentials and bounded temporary state are used. No token, activity payload, goal or memory is copied into these reports. The recorder checks that its source inputs stayed unchanged during the run. It preserves an existing original Phase 3 report and updates only generated Phase 4 evidence. A source-only handoff excludes historical reports; missing linked report files get explicit `not_run` placeholders. General, platform and Node-major reports preserve separate environments. The [setup guide](../docs/reference.md) and [review](../docs/review/phase-4.md) explain scope, reproducibility and production limits.

## Portable Linux handoff

Android uses [native build and JVM verification scripts](../android/README.md). OpenClaw is the current chosen personal-agent host; the manual local inspector and independent OAP reference remain separate tools. Android build/permission evidence is distinct from Node tests and physical-device results. The earlier deferral under ADR-0009 is historical.

Linux work is on hold under [ADR-0008](../docs/decisions/0008-windows-baseline-and-android-integration-priority.md). The preserved source-only handoff tooling installs no OS, runtime or package manager and grants no Linux support claim. Review its inputs when that work resumes, including later skill/catalog additions. See the [parked guide](../docs/linux-verification.md). Generated `artifacts/` directories are excluded from static documentation discovery and source evidence hashes.

## Existing-agent readiness

`node scripts/check-agent-readiness.mjs --list` lists researched candidates. `node scripts/check-agent-readiness.mjs --host openai-workspace-agent-native-trigger` validates the strict local catalog and reports prerequisites and blockers. This is a read-only preparation check with no account, credential or network action. Documented API primitives do not become selectable OAP integrations. The [integration plan](../docs/agent-integration-plan.md) and [native profile proposal](../docs/integration-drafts/workspace-agent-profile.md) explain the pending actual-host evidence and reviewed changes.
