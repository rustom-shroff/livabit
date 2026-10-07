# Open Activity Protocol (OAP)

OAP is an open protocol that lets any compatible personal agent receive and interpret activity signals. The activity provider shares authorized usage information; the user's chosen agent owns the goals, interpretation, coaching, and communication.

**liveabit Skill** is the name of the optional agent skill. Its local package guides compatible agents through user-authorized workflows. It is not an independent AI coach, an event transport, or permission to control a device.

## License and contributions

Project-authored code, protocol specifications, schemas, examples, documentation
and skill instructions are open source under the [MIT License](LICENSE), unless
a file explicitly states otherwise. Software is provided **as is**, without
warranty, subject to the license's liability limitation. Third-party software
retains its own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, changes and contribution terms,
[SECURITY.md](SECURITY.md) for vulnerability reporting, and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community conduct.

## Project status

The user agreed to **OAP 0.1.0** and accepts the **Windows reference M1 baseline for progression**, following approval of baseline **0.2**. Linux extensibility remains **on hold**. The [2026-10-05 priority decision](docs/decisions/0009-android-local-inspection-first.md) puts the **Android collector and local inspection first**, with agent selection deferred until local findings. The Windows reference retains its lifecycle/fault/security evidence. No real-agent pilot, physical Android success or production deployment is claimed. The starting workspace was empty and was not an initialized Git repository.

Activity travels directly from the device to the chosen agent's existing infrastructure. Consent, aggregation, bounded pending activity and retries stay on the device. No project-hosted server, proxy, relay, remote consent store or delivery-service subscription is required. Free hosting and required user-hosted forwarding bridges are excluded too. See [ADR-0005](docs/decisions/0005-no-intermediary-infrastructure.md).

Delivery is best effort. A host needs a supported receiving and pairing path; the current OpenAI MCP Events path remains a conditional candidate until its complete lifecycle works without an intermediary. An installed liveabit Skill alone cannot provide that path.

The [dated direct-host follow-up](docs/research/direct-host-follow-up-2026-10-04.md) adds the native published Workspace Agent trigger as a second candidate, with separate context, credential and receipt boundaries. No real-host profile is selected. The [Linux handoff](docs/linux-verification.md) is parked; no Linux environment choice or Windows change is required now.

Start with the [reference run instructions](docs/reference.md), [Phase 4 evidence review](docs/review/phase-4.md) and [OAP contract](specs/protocol/oap.md). Supporting specifications are:

1. [Research and feasibility](docs/research/feasibility.md).
2. [Product requirements](specs/product-requirements.md).
3. [System architecture and diagrams](specs/system-architecture.md).
4. [Privacy and security](specs/privacy-security.md).
5. [Acceptance criteria](specs/acceptance-criteria.md).
6. [Requirements traceability](specs/requirements-traceability.md).

The native local inspector has [qualitative first-phone feedback](docs/review/android-phone-feedback-2026-10-05.md). Follow the [Android guide](android/README.md) for the current app and optional owned lifecycle fixture; [native build evidence](docs/review/android-local-inspector-validation.json) and the [historical first build review](docs/review/android-local-inspector.md) retain their separate scopes. It implements the [local collector specification](specs/android/local-inspector.md), with instrumented accuracy/security/quality measurements still pending under the [Android feasibility plan](docs/android-feasibility-plan.md). The inspector has no network permission and keeps observed activity in memory. It requires a separate visible local session and reads only selected apps on demand; its estimates have unknown source coverage. The [direct integration plan](docs/agent-integration-plan.md), [native Workspace Agent proposal](docs/integration-drafts/workspace-agent-profile.md) and [liveabit Skill package](skills/liveabit/SKILL.md) are retained for later. The skill is locally packaged, not installed into an agent. The read-only `scripts/check-agent-readiness.mjs` enables no host and sends nothing.

Every new or changed APK proposed for a personal trial requires actual emulator validation of its exact bytes first. The historical [0.2.3 development review](docs/review/android-local-development-0.2.3.md) records original-session clock-drift protection and optional fixture timing details. Its [native audit](docs/review/android-local-inspector-0.2.3-validation.json) passed 33 collector/comparison and 25 fixture checks with zero lint errors or warnings; its exact APKs passed all ten workflows separately on [Android 15/API 35](artifacts/android-emulator-0.2.3-api35-final/validation.json) and [Android 16/API 36](artifacts/android-emulator-0.2.3-api36-final/validation.json). The emulator-first gate is met for their local diagnostic trial, and no new phone input is needed now. Exact captured timing and separate native replay remain numerical unverified comparisons, with unknown source coverage.

The separately pinned [Android 16 validation](docs/review/android-api36-emulator-plan-2026-10-07.md) finished at October 7 **11:06:23.873 UTC**, with ten passed workflows and zero failures in **52 minutes 41.935 seconds**. Its [857-file archive](artifacts/android-emulator-0.2.3-api36-final/archive-index.json) preserves the exact run, including one guarded keyboard dismissal; four earlier failed attempts remain failures. The [exact timing analysis](artifacts/android-timing-analysis/run-0705fbf4-f8c4-4f57-8f5d-724e2fa16c51/summary.json) records idle **−1 ms** and handoff **+422 ms** differences from manually entered fixture durations. [Separate native replay](artifacts/android-timing-analysis/run-0705fbf4-f8c4-4f57-8f5d-724e2fa16c51/native-replay-247052f4-f5d7-429f-bad1-85067ef64854/validation.json) passed both traces and four invalid-input rejections. The APKs and inference rules remained unchanged. These are unverified diagnostic comparisons, without an accuracy threshold or source-completeness claim. The [October 6 review](docs/review/android-emulator-2026-10-06.md) and [complete 0.2.2 rerun](docs/review/android-emulator-rerun-2026-10-06.md) retain their historical binary and timeout evidence separately. Physical/OEM accuracy, production readiness and M2/M3 remain unverified.

The integrated 0.2.4 reader bounds physical usage reads across screen recreation when an old OS query ignores cancellation, with no queued or automatic replacement read. Its [frozen native audit](docs/review/android-local-inspector-0.2.4-validation.json), generated at **11:10:05.321123 UTC**, passed 33 collector/comparison, 25 fixture, sixteen coordinator/core and eight separate Application host-substitute checks, both APK lint audits at zero errors/warnings, and 56 source bindings without drift. The new inspector is 130,460 bytes, SHA-256 `df5ae7d7aad1c53818d9ce9812f49a3213c8b02e47caf2f2807f7abc130e6d6c`; fixture bytes are unchanged. Its [API 36 run](docs/review/android-emulator-0.2.4-api36-validation.json) passed all ten workflows from **11:14:41.839 to 12:11:58.331 UTC**; exact analysis and native replay are retained in the [0.2.4 review](docs/review/android-local-development-0.2.4.md). The same bytes passed [all ten API 35 workflows](docs/review/android-emulator-0.2.4-api35-validation.json) from **12:19:45.227 to 13:08:47.125 UTC**. Both images have exact timing/native replay and separate [controlled real recreation checks](docs/review/android-lifecycle-recreation-2026-10-07.md); both owned guests were closed afterward. The exact 0.2.4 APK now meets the emulator-first local diagnostic trial gate. The earlier [inert reader draft](artifacts/android-local-development-0.2.4-doc-draft/run-1ed033e4-4117-4d26-90b6-a4b64448d8cb/android-local-development-0.2.4-draft.md) retains its preparation scope. Native/host substitutes retain their original scope; the separate real-recreation checks use bounded synthetic work and establish no stalled Android usage query, SQLite fault behavior or production accuracy. No new phone input is required now.

## Source of truth

Approved specifications govern implementation and testing. A passing test does not authorize a change to the specification. Changes to approved behavior must update requirements, relevant ADRs, acceptance criteria, and traceability before implementation. See [contribution process](CONTRIBUTING.md).

## Structure

| Location | Purpose |
| --- | --- |
| specs/ | Product, architecture, privacy, acceptance, and traceability specifications |
| specs/protocol/ | OAP contract, profiles, conformance, authorization/delivery/error rules and interfaces |
| schemas/oap/0.1.0/ | Nine Draft 2020-12 schemas, resolved locally |
| examples/oap/0.1.0/ | Positive/negative payloads, synthetic context/group cases and manifest |
| scripts/ | Offline artifact checks and deterministic representation fixtures |
| src/ | Device-local reference publisher, adapter, embedded state, final receiver and synthetic process entries |
| test/ | Runtime contract, lifecycle, fault, security and actual process restart tests |
| skills/liveabit/ | Optional portable liveabit Skill, synthetic scenarios and reviewer rubric/scorer |
| android/ | Native local inspector and independently JVM-testable collector core; no delivery adapter |
| docs/research/ | Dated findings and primary documentation links |
| docs/decisions/ | Numbered Architecture Decision Records (ADRs) |
| docs/review/ | Review decisions, assumptions, and approval record |
| docs/project-roadmap.md | Six phases, planned task IDs, deliverables, and evidence gates |

Phase 3 validation checks contract artifacts. Phase 4 adds independent runtime evidence; neither establishes real-host compatibility. See the [artifact instructions](scripts/README.md), [saved static evidence](docs/review/phase-3-validation.json), [runtime evidence](docs/review/phase-4-validation.json) and [direct demo samples](docs/review/phase-4-demo.json).

With Node.js 22 or later and pnpm, install pinned dependencies using `pnpm install --frozen-lockfile --ignore-scripts`, run `npm test`, then `npm run demo`. The commands require no model key or hosted delivery service. Windows reports retain each tested Node major separately; exact versions/results and the accepted progression scope are recorded in the [runtime evidence](docs/review/phase-4-validation.json). Linux is deferred and untested. The mock receiver accepts synthetic loopback traffic only.

## Milestones

| Milestone | Evidence of success |
| --- | --- |
| M1: Simulated activity | Direct authorized lifecycle, bounded local recovery, revocation, and conformance with a final mock receiver |
| M2: Existing personal agent | A real supported host receives activity directly without a relay, uses host-owned instructions, and communicates appropriately |
| M3: Android activity | Real usage-access data replaces the simulator; OS limitations, data quality, battery cost, and policy findings are published |

See the [roadmap](docs/project-roadmap.md) and [approval record](docs/review/phase-1-2.md). The Phase 3 review discloses its concrete refinements, including deferred corrections/projections and explicit app/page/control quotas.
