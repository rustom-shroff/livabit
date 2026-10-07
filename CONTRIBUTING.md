# Specification-driven contribution process

Status: approved Phase 1/2 process, 2026-10-03; OAP 0.1.0 contract agreed and Windows M1 baseline accepted for progression, 2026-10-04. Linux is on hold. [ADR-0009](docs/decisions/0009-android-local-inspection-first.md) records the 2026-10-05 instruction to build the local Android collector/inspector first and defer agent selection.

Use the public names **Open Activity Protocol (OAP)** and **liveabit Skill**. Keep protocol semantics independent of MCP, Android, model providers, and private assistant context.

The user-confirmed [no-intermediary requirement](docs/decisions/0005-no-intermediary-infrastructure.md) is mandatory. Keep provider-side consent, aggregation, queues and retries on the device; use only the chosen agent's supported receiving infrastructure. Do not introduce project hosting, free-tier relays, required user-hosted bridges, remote consent synchronization, a shared cloud credential or a billing dependency. Unsupported hosts remain unsupported. Software distribution/documentation locations are separate from the runtime activity path.

## Workflow

1. Read the current product, architecture, privacy, and acceptance specifications and the approval record in docs/review/phase-1-2.md.
2. Identify affected stable requirement IDs. Never reuse retired IDs; mark them superseded and link replacements.
3. Propose specification changes and an ADR when the decision changes architecture, trust boundaries, compatibility, or user control. Separate researched platform facts from our proposed behavior.
4. Update the traceability matrix with task IDs, protocol sections, and test criteria. Use concrete contract/schema/interface sections and conformance cases; do not infer execution from a mapping.
5. Observe the amended phase gate. The user approved baseline 0.2, OAP 0.1.0/AC-05 and the Windows baseline for progression. Do not request those approvals again or a Linux environment choice while that work is deferred. Build and inspect the local Android collector now under [its specification](specs/android/local-inspector.md); an agent choice is not required. Existing-agent activation is deferred until local findings. The production Android publisher and M3 still require a compliant real M2 integration.
6. Implement against the approved baseline, then run the relevant acceptance tests. Record versions, configuration, fixtures, commands, expected outputs, observed results, and limitations.

Requirements use OAP-FR (functional), OAP-NFR (nonfunctional), and OAP-PR (privacy/security) IDs. Acceptance cases use AC; roadmap tasks use TASK-Pn; architectural components use C; planned protocol areas use PA. These IDs are maintained in the specifications.

## Evidence and scope

Use authoritative documentation for capability claims and record the verification date. Recheck affected sources before implementing a provider adapter or shipping Android support. Host availability is not established until exercised on the intended account and surface.

Never claim a simulated receiver establishes real-host interoperability, a webhook acknowledgment establishes user notification, or an API login grants access to consumer assistant memories. Use deterministic consumers for protocol tests. Do not introduce real model calls, cloud deployments, telemetry services, or Android code during Phases 1 and 2.

## License and contribution terms

The project uses the [MIT License](LICENSE) for project-authored software,
specifications, schemas, examples, documentation and skill instructions, unless
an individual file explicitly states otherwise. By submitting a contribution,
you agree to license it under these terms and confirm you have the right to do
so. You retain copyright in your contribution. No copyright assignment or
separate contributor agreement is required by this project.

Preserve existing copyright and license notices. Identify third-party material
and its license, verify compatibility, and update
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) when dependencies or bundled
material change. Do not copy code you lack permission to redistribute.

## Getting started and submitting changes

Use the [README](README.md), [reference instructions](docs/reference.md) and
[Android build/trial guide](android/README.md) for the relevant setup. Pin and
install dependencies using the documented lockfile workflow. Use synthetic
activity for tests; never submit personal observations, credentials, signing
keys, downloaded SDKs, dependency directories or generated build caches.

Open issues with a clear expected/observed behavior, relevant version and safe
reproduction steps. For pull requests, describe the problem, the resulting
behavior, affected specifications and validation performed. Keep unrelated
changes separate. Run the documented checks appropriate to your change;
documentation-only changes do not require rebuilding APKs or rerunning the
emulator suite. Follow the [community conduct policy](CODE_OF_CONDUCT.md) and
report vulnerabilities through [SECURITY.md](SECURITY.md).

For source or binary distribution, include LICENSE and applicable third-party
notices. A public source license does not authorize publishing private test
data, development signing keys, proprietary SDKs or a production app release.
Publishing and deployment remain separate project decisions.
