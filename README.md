# Open Activity Protocol (OAP)

OAP is an open protocol that lets any compatible personal agent receive and interpret activity signals. The activity provider shares authorized usage information; the user's chosen agent owns the goals, interpretation, coaching, and communication.

**liveabit Skill** is the name of the optional agent skill. Its local package guides compatible agents through user-authorized workflows. It is not an independent AI coach, an event transport, or permission to control a device.

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

The native local inspector is built: follow the [Android phone trial guide](android/README.md) and [build review](docs/review/android-local-inspector.md). It implements the [local collector specification](specs/android/local-inspector.md), with actual-device findings still pending under the [Android feasibility plan](docs/android-feasibility-plan.md). The first inspector has no network permission and keeps observed activity in memory. It requires a separate visible local session and reads only selected apps on demand; its estimates have unknown source coverage. The [direct integration plan](docs/agent-integration-plan.md), [native Workspace Agent proposal](docs/integration-drafts/workspace-agent-profile.md) and [liveabit Skill package](skills/liveabit/SKILL.md) are retained for later. The skill is locally packaged, not installed into an agent. The read-only `scripts/check-agent-readiness.mjs` enables no host and sends nothing.

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
