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

**Current release, 2026-10-11:** [liveabit Sender 0.6.0](android/publisher-app/README.md) sends directly to the user's existing OpenClaw **main** agent under [ADR-0018](docs/decisions/0018-existing-main-agent-context.md). Exact APK bytes passed **all 37 native Android checks**, including installed-gateway delivery. The user-owned [Sol 6.1 model choice](docs/integration-drafts/openclaw-model-settings.md) completed a separate operator run, with medium thinking verified as inherited configuration. WhatsApp is linked/connected; the helper's self-chat check and a separate main-agent check using its private policy/native message capability succeeded. Phone display/read and goal-grounded nudges remain unproved. The [0.6.0 review](docs/review/openclaw-whatsapp-2026-10-11.md) preserves earlier HTTP 5xx attempts without claiming a fixed root cause. The exact-byte emulator gate is met for an optional phone trial. No intermediary or JavaScript sender prototype is required.

The verified **0.5.0** [main-agent review](docs/review/openclaw-main-agent-2026-10-11.md) retains 37 exact-APK native passes, actual admission/LAN delivery, separate uncertainty-preserving output and two-event conversation continuity. The dedicated-agent **0.4.0** [review](docs/review/openclaw-poc-2026-10-11.md) remains separate. Current [Android](android/publisher-app/README.md) and [OpenClaw](docs/integration-drafts/openclaw-direct.md) guides cover explicit saved agent selection, main setup and actual-port Wi-Fi/USB help. Canonical [OAP observations](specs/protocol/activity-observation.md), the independent [display receiver](tools/activity-receiver/server.mjs), durable retry and configurable outage warning remain. HTTP success is admission only; duplicates remain possible. Goals/context stay in OpenClaw; quiet hours/cooldown are best-effort agent policy, and absent goals do not justify a nudge. The accepted collector and agreed OAP 0.1.0 summary contract retain their scopes.

The following paragraphs retain **historical research/reference context**. OpenClaw is now the active agent target. Earlier Grok account gates and JavaScript preparation sequences do not block the authorized native OpenClaw POC.

OAP 0.1.0 is agreed. The Windows reference M1 baseline is accepted for development progression; Linux extensibility stays on hold. [ADR-0010](docs/decisions/0010-collector-accepted-and-chatgpt-dots-priority.md) accepts Android inspector 0.2.4 for continued development and defers further precise-duration and complete-coverage proof. [ADR-0014](docs/decisions/0014-resume-grok-bot-direct-webhook.md) returns the first integration target to **Grok Bot on the lowest eligible plan**, using its native direct routine webhook. The user has no Grok account yet; the exact subscription product is not chosen. Resume the retained synthetic single-attempt probe with [protected local setup](docs/integration-drafts/grok-bot-local-setup.md): bounded non-echoing input, short-lived RAM only, no automatic retry or credential persistence. The [plan/webhook refresh](docs/research/grok-bot-plan-and-webhook-refresh-2026-10-08.md) separates documented plan access and the supported base-plan webhook inference from actual unobserved entitlement; no purchase is needed for local development. The [resumption review](docs/review/grok-bot-resumption-2026-10-08.md) records this run separately. Actual pairing and host behavior remain untested; a native HTTP 200/run-start report is not valid OAP consumption. Production sending, native profile selection, M2 and M3 remain disabled or unproven pending actual setup and admission review. The completed [Muse account assessment](docs/review/meta-muse-direct-dialogue-2026-10-08.md), its code/research and the ChatGPT work remain retained. No delivered-activity pilot or production Android publisher is claimed.

Activity travels directly from the device to the chosen agent's existing infrastructure. Consent, aggregation, bounded pending activity and retries stay on the device. Delivery is best effort. No project server, relay, proxy, remote consent store or required user-operated forwarding bridge is permitted under [ADR-0005](docs/decisions/0005-no-intermediary-infrastructure.md). A paid API replacement agent or assumed plan upgrade does not substitute for the requested personal Grok Bot on its lowest eligible plan. An installed liveabit Skill alone cannot provide a receiving path.

Current local development adds an [offline routine admission model](docs/integration-drafts/grok-bot-local-admission.md) for trusted synthetic bindings, durable duplicate handling and fresh scoped observations before interpretation. The [local admission review](docs/review/grok-bot-local-admission-2026-10-08.md) records this step separately from the resumption run. The model reuses the reference receiver without an HTTP server, admits only owned `test.app` fixtures and projects retained data with original time and uncertainty. It neither invokes Grok nor proves native webhook input, authentication or shared-file concurrency. No deployable receiver, production profile or automatic liveabit Skill trigger is supplied.

The separate [offline delivery journal](docs/integration-drafts/grok-bot-delivery-journal.md) persists immutable authored pages and spends the recipient's rolling-hour budget before exposing one local fixture reservation. Restart cannot reissue that reservation; an unfinished attempt remains uncertain and blocked. All recorded outcomes are terminal, with no retry or restaging, and original expiry or local revocation removes retained page bodies. Bounded identity tombstones prevent reuse rather than being evicted to make room. The [separate journal review](docs/review/grok-bot-delivery-journal-2026-10-08.md) records local evidence only. This component performs no network or account operation and does not wrap the retained probe, which generates its own page and has no durable pre-body reservation interface. Neither local journal success nor a hypothetical HTTP 200 proves native OAP consumption or agent evaluation.

The next local step is an [offline journaled synthetic sender](docs/integration-drafts/grok-bot-journaled-sender.md), composing the unchanged journal and admission model through a module-owned virtual wire. It persists the reservation and budget before possible fixture body submission, rechecks original expiry and controls, and invalidates unfinished authority synchronously when pause, revoke or disposal is requested. Fixed scenarios distinguish modeled HTTP acceptance, durable local receiver admission and uncertain response loss; no outcome enables resend. The [sender review](docs/review/grok-bot-journaled-sender-2026-10-08.md) records this new evidence separately. There is no arbitrary transport callback, endpoint, account, network or model invocation. The native Grok probe remains unchanged and unconnected. Tests cover one owning process/store instance; neither shared-file native concurrency nor power-loss assurance is claimed.

Follow the [Grok resumption decision](docs/decisions/0014-resume-grok-bot-direct-webhook.md), [Grok webhook follow-up](docs/research/grok-bot-webhook-feasibility-2026-10-08.md), [protected Grok setup guide](docs/integration-drafts/grok-bot-local-setup.md) and [direct integration plan](docs/agent-integration-plan.md) for current development. The [synthetic Grok probe packet](docs/integration-drafts/grok-bot-webhook-pilot.md), [Grok Bot research](docs/research/grok-bot-integration-2026-10-08.md), [Grok connection gate](docs/integration-drafts/grok-bot-profile.md) and [offline Grok Bot handoff](docs/review/grok-bot-pilot-packets.md) keep their recorded scopes. The [Muse feasibility assessment](docs/research/meta-muse-webhook-feasibility-2026-10-08.md), [Muse decision](docs/decisions/0013-meta-muse-first-integration.md), [ChatGPT dots research](docs/research/chatgpt-dots-integration-2026-10-07.md), [disabled dots proposal](docs/integration-drafts/chatgpt-dots-profile.md), [Workspace Agent proposal](docs/integration-drafts/workspace-agent-profile.md) and [pinned October 4 capability catalog](docs/agent-compatibility.json) remain retained. That six-host catalog includes neither Muse nor Grok Bot and enables no runtime host; the readiness checker covers its historical scope only. The skill package is local and has not been installed into an agent.

The [Android guide](android/README.md) describes the accepted local inspector and optional owned fixture. The inspector has no Internet permission, destination, credential, export or background collection. Selected-app manual observations stay in RAM and retain unknown source coverage; they are not validated OAP summaries. Inspector 0.2.4 passed the recorded ten local workflows on each [Android 15/API 35](docs/review/android-emulator-0.2.4-api35-validation.json) and [Android 16/API 36](docs/review/android-emulator-0.2.4-api36-validation.json) image. Exact builds, timing comparisons, controlled recreation checks and preserved earlier attempts remain in the [development review](docs/review/android-local-development-0.2.4.md). Every new or changed APK proposed for a personal trial still needs emulator validation of its exact bytes first. Physical/OEM accuracy, complete source coverage and measured M3 remain unproven; no new phone input is required for current integration preparation.

Start with the [reference instructions](docs/reference.md), [Phase 4 evidence review](docs/review/phase-4.md) and [OAP contract](specs/protocol/oap.md). Supporting specifications are:

1. [Research and feasibility](docs/research/feasibility.md).
2. [Product requirements](specs/product-requirements.md).
3. [System architecture and diagrams](specs/system-architecture.md).
4. [Privacy and security](specs/privacy-security.md).
5. [Acceptance criteria](specs/acceptance-criteria.md).
6. [Requirements traceability](specs/requirements-traceability.md).

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
| android/ | Accepted local inspector/core and separate native sender app with direct test delivery |
| tools/activity-receiver/ | Final desktop receiver and activity display; no forwarding or hosted service |
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

Native OpenClaw integration can continue independently using the installed runtime and existing model configuration. No new account, purchase, approval or phone test is required for development. Every changed APK must pass relevant emulator checks before a personal trial. Further collector accuracy experiments and Linux portability remain deferred; unknown coverage and unverified durations remain explicit. GitHub changes use a `codex/` feature branch and exclude local credentials, activity data and build caches.
