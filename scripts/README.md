# Validate the OAP contract and reference

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

Current Android work uses [native build and JVM verification scripts](../android/README.md), a manual local inspector and no delivery adapter. Agent choice is deferred under [ADR-0009](../docs/decisions/0009-android-local-inspection-first.md). Android build/permission evidence is distinct from the Node reference and from actual-device results.

Linux work is on hold under [ADR-0008](../docs/decisions/0008-windows-baseline-and-android-integration-priority.md). The preserved source-only handoff tooling installs no OS, runtime or package manager and grants no Linux support claim. Review its inputs when that work resumes, including later skill/catalog additions. See the [parked guide](../docs/linux-verification.md). Generated `artifacts/` directories are excluded from static documentation discovery and source evidence hashes.

## Existing-agent readiness

`node scripts/check-agent-readiness.mjs --list` lists researched candidates. `node scripts/check-agent-readiness.mjs --host openai-workspace-agent-native-trigger` validates the strict local catalog and reports prerequisites and blockers. This is a read-only preparation check with no account, credential or network action. Documented API primitives do not become selectable OAP integrations. The [integration plan](../docs/agent-integration-plan.md) and [native profile proposal](../docs/integration-drafts/workspace-agent-profile.md) explain the pending actual-host evidence and reviewed changes.
