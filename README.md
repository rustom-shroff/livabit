# liveabit: personal-agent activity awareness

**Current product direction, 2026-10-15:** liveabit gives the user's own personal agent awareness of phone activity so it can understand unwanted patterns in a continuing conversation, ask optional questions about intent/feelings, use relevant goals and commitments, and revise its approach. The model owns behavioral judgment. Runtime software supplies bounded estimates, durable evidence/scheduling and controlled delivery. Intentional leisure and rest remain legitimate; automatic accountability emails and device restrictions remain disabled. Start with the [current system guide](docs/current-system.md), [product specification](specs/personal-agent-intervention.md) and [research and limits](docs/research/personal-agent-behavior-change-2026-10-14.md).

The [OpenClaw runtime](integrations/openclaw/personal-agent/README.md) creates its own embedded SQLite activity database in the user's existing host. The October 14 [foundation review](docs/review/personal-agent-foundation-2026-10-14.md) records the installed baseline. [ADR-0025](docs/decisions/0025-durable-activity-analysis.md) separates receipt from durable background analysis and moves routine input to an isolated activity conversation belonging to the same **main** personal agent. Matching receipt compatibility, recovery, session boundaries and notification behavior need their own evidence. The [migration helper](scripts/configure-openclaw-personal-agent.ps1) preserves user-selected models, original instructions, shared Workboard and private companion preferences. The [conversation evaluation plan](docs/evaluation/personal-agent-conversation.md) assesses dialogue separately from mechanical tests.

The **Livabit sender** reports selected usage from the phone; the **OpenClaw Android companion** displays intervention notifications and offers the existing agent chat. A working sender does not prove companion background connectivity. Calendar/email can inform support only where already connected and authorized; setup creates no new account connections. Shared identity does not imply that an isolated session can read every old chat or private memory. Implemented, tested, installed, physically observed and useful are separate claims.

**Deployment, October 15:** the final host bundle/settings v2 are installed, all source/guidance hashes match, and warm native health, receipt/duplicate and context-isolation checks passed. Thirty regular healthy checks plus a follow-up span 31 minutes 47 seconds. Sender 0.12 passed build/lint and all **97 exact-APK Android emulator checks**, including both real reboots. The physical phone retains its earlier APK/legacy hook until phone/setup migration. Cold startup took about seven minutes during concurrent development/emulator work; its readiness timeout remains open in the [processing review](docs/review/personal-agent-processing-2026-10-15.md). Native model execution, physical background notification and behavioral usefulness remain separate unproved steps.

Open Activity Protocol (OAP) remains the independent activity contract. The project uses only the device and the user's chosen agent infrastructure, with no project-hosted coach or relay. The activity provider shares authorized usage information; the chosen agent owns personal context, interpretation and communication. Earlier task-only behavior and provider experiments are preserved in the dated historical notes below.

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

## Historical development notes

**Scope: October 3–13, 2026.** Everything in this section records earlier releases, research, then-current plans and evidence. Phrases such as “current development,” “next step,” provider selection and old setup instructions retain their historical meaning; they are **not today's plan or installation instructions**. October 14/15 personal-agent decisions and the current guides above govern present work. Preserve the old evidence without using it to claim new capabilities or overwrite a migrated host.

### October 13 companion and sender baseline

**Historical companion baseline, 2026-10-13:** [ADR-0023](docs/decisions/0023-openclaw-companion-reminders.md) replaced liveabit's WhatsApp nudges with local notifications in the official [OpenClaw Android companion](https://play.google.com/store/apps/details?id=ai.openclaw.app&hl=en_US). The paired phone was configured, and the user confirmed that the native connection-check notification appeared. [Companion review](docs/review/openclaw-companion-2026-10-13.md). This earlier check does not prove new-foundation delivery or useful coaching.

**Preserved Android release, 2026-10-13:** [liveabit Sender 0.11.0](artifacts/android-publisher/liveabit-sender-0.11.0-poc.apk) fixed older OpenClaw setup-file imports and retained exactly three connection actions while manually editing. The [setup regression review](docs/review/android-setup-regressions-2026-10-13.md), [0.10.0 startup review](docs/review/android-reboot-resume-2026-10-13.md) and [0.9.0 task-aware review](docs/review/openclaw-task-aware-2026-10-13.md) preserve their own exact-build evidence. Those passes do not transfer to a changed candidate.

In that baseline, dedicated **liveabit** used shared Workboard tasks before selective companion notifications. Earlier [phone admission](docs/review/openclaw-phone-delivery-2026-10-12.md) and [WhatsApp notification](docs/review/openclaw-phone-notification-2026-10-11.md) evidence retain their historical scope. The current same-main-agent activity-session routing and new receipt migration are described above; a legacy phone wrapper naming liveabit does not select today's trusted host session.

### Earlier task-reminder setup

The [Android sender guide](android/publisher-app/README.md), [direct OpenClaw setup](docs/integration-drafts/openclaw-direct.md), [companion notifications](docs/integration-drafts/openclaw-companion-notifications.md) and [model settings](docs/integration-drafts/openclaw-model-settings.md) retain the earlier setup/evidence. ADR-0021 selected dedicated liveabit and ADR-0023 changed its reminder route; ADR-0024 governs current personal-agent work. Rerunning the old task-agent setup can restore the dedicated route. Use the [personal-agent foundation guide](integrations/openclaw/personal-agent/README.md) for the current migration rather than applying historical routing helpers to a migrated installation. Android controls and Workboard's canonical task role remain unchanged.

### Earlier provider and Android work

**Android update, 2026-10-12:** 0.7.0 adds configurable activity-aware sends and Activity/Setup/Settings pages under [ADR-0019](docs/decisions/0019-adaptive-android-delivery.md). Default active interval is five minutes; automatic network requests pause after fifteen minutes with the screen off. The final exact APK passed all 50 native checks, including live OpenClaw admission; [review](docs/review/android-adaptive-2026-10-12.md). No model, protocol or intermediary change is involved.

**Preserved 0.6.0 baseline, 2026-10-11:** [liveabit Sender 0.6.0](android/publisher-app/README.md) sends directly to the user's existing OpenClaw **main** agent under [ADR-0018](docs/decisions/0018-existing-main-agent-context.md). Exact APK bytes passed **all 37 native Android checks**, including installed-gateway delivery. The user-owned [Sol 6.1 model choice](docs/integration-drafts/openclaw-model-settings.md) completed a separate operator run, with medium thinking verified as inherited configuration. WhatsApp is linked/connected; the helper's self-chat check and a separate main-agent check using its private policy/native message capability succeeded. Phone receipt and notification for the checks are user-confirmed. Goal-grounded nudges are ready for a real-activity trial. The [0.6.0 review](docs/review/openclaw-whatsapp-2026-10-11.md) preserves earlier HTTP 5xx attempts without claiming a fixed root cause. The exact-byte emulator gate is met for an optional phone trial. No intermediary or JavaScript sender prototype is required.

The verified **0.5.0** [main-agent review](docs/review/openclaw-main-agent-2026-10-11.md) retains 37 exact-APK native passes, actual admission/LAN delivery, separate uncertainty-preserving output and two-event conversation continuity. The dedicated-agent **0.4.0** [review](docs/review/openclaw-poc-2026-10-11.md) remains separate. Current [Android](android/publisher-app/README.md) and [OpenClaw](docs/integration-drafts/openclaw-direct.md) guides cover dedicated liveabit setup and actual-port Wi-Fi/USB help. Canonical [OAP observations](specs/protocol/activity-observation.md), the independent [display receiver](tools/activity-receiver/server.mjs), durable retry and configurable outage warning remain. HTTP success is admission only; duplicates remain possible. Goals/context stay in OpenClaw; quiet hours/cooldown are best-effort agent policy, and absent goals do not justify a nudge. The accepted collector and agreed OAP 0.1.0 summary contract retain their scopes.

The following paragraphs retain **historical research/reference context**. OpenClaw is now the active agent target. Earlier Grok account gates and JavaScript preparation sequences do not block the authorized native OpenClaw POC.

OAP 0.1.0 is agreed. The Windows reference M1 baseline is accepted for development progression; Linux extensibility stays on hold. [ADR-0010](docs/decisions/0010-collector-accepted-and-chatgpt-dots-priority.md) accepts Android inspector 0.2.4 for continued development and defers further precise-duration and complete-coverage proof. [ADR-0014](docs/decisions/0014-resume-grok-bot-direct-webhook.md) returns the first integration target to **Grok Bot on the lowest eligible plan**, using its native direct routine webhook. The user has no Grok account yet; the exact subscription product is not chosen. Resume the retained synthetic single-attempt probe with [protected local setup](docs/integration-drafts/grok-bot-local-setup.md): bounded non-echoing input, short-lived RAM only, no automatic retry or credential persistence. The [plan/webhook refresh](docs/research/grok-bot-plan-and-webhook-refresh-2026-10-08.md) separates documented plan access and the supported base-plan webhook inference from actual unobserved entitlement; no purchase is needed for local development. The [resumption review](docs/review/grok-bot-resumption-2026-10-08.md) records this run separately. Actual pairing and host behavior remain untested; a native HTTP 200/run-start report is not valid OAP consumption. Production sending, native profile selection, M2 and M3 remain disabled or unproven pending actual setup and admission review. The completed [Muse account assessment](docs/review/meta-muse-direct-dialogue-2026-10-08.md), its code/research and the ChatGPT work remain retained. No delivered-activity pilot or production Android publisher is claimed.

Activity travels directly from the device to the chosen agent's existing infrastructure. Consent, aggregation, bounded pending activity and retries stay on the device. Delivery is best effort. No project server, relay, proxy, remote consent store or required user-operated forwarding bridge is permitted under [ADR-0005](docs/decisions/0005-no-intermediary-infrastructure.md). A paid API replacement agent or assumed plan upgrade does not substitute for the requested personal Grok Bot on its lowest eligible plan. An installed liveabit Skill alone cannot provide a receiving path.

Current local development adds an [offline routine admission model](docs/integration-drafts/grok-bot-local-admission.md) for trusted synthetic bindings, durable duplicate handling and fresh scoped observations before interpretation. The [local admission review](docs/review/grok-bot-local-admission-2026-10-08.md) records this step separately from the resumption run. The model reuses the reference receiver without an HTTP server, admits only owned `test.app` fixtures and projects retained data with original time and uncertainty. It neither invokes Grok nor proves native webhook input, authentication or shared-file concurrency. No deployable receiver, production profile or automatic liveabit Skill trigger is supplied.

The separate [offline delivery journal](docs/integration-drafts/grok-bot-delivery-journal.md) persists immutable authored pages and spends the recipient's rolling-hour budget before exposing one local fixture reservation. Restart cannot reissue that reservation; an unfinished attempt remains uncertain and blocked. All recorded outcomes are terminal, with no retry or restaging, and original expiry or local revocation removes retained page bodies. Bounded identity tombstones prevent reuse rather than being evicted to make room. The [separate journal review](docs/review/grok-bot-delivery-journal-2026-10-08.md) records local evidence only. This component performs no network or account operation and does not wrap the retained probe, which generates its own page and has no durable pre-body reservation interface. Neither local journal success nor a hypothetical HTTP 200 proves native OAP consumption or agent evaluation.

The next local step is an [offline journaled synthetic sender](docs/integration-drafts/grok-bot-journaled-sender.md), composing the unchanged journal and admission model through a module-owned virtual wire. It persists the reservation and budget before possible fixture body submission, rechecks original expiry and controls, and invalidates unfinished authority synchronously when pause, revoke or disposal is requested. Fixed scenarios distinguish modeled HTTP acceptance, durable local receiver admission and uncertain response loss; no outcome enables resend. The [sender review](docs/review/grok-bot-journaled-sender-2026-10-08.md) records this new evidence separately. There is no arbitrary transport callback, endpoint, account, network or model invocation. The native Grok probe remains unchanged and unconnected. Tests cover one owning process/store instance; neither shared-file native concurrency nor power-loss assurance is claimed.

Follow the [Grok resumption decision](docs/decisions/0014-resume-grok-bot-direct-webhook.md), [Grok webhook follow-up](docs/research/grok-bot-webhook-feasibility-2026-10-08.md), [protected Grok setup guide](docs/integration-drafts/grok-bot-local-setup.md) and [direct integration plan](docs/agent-integration-plan.md) for current development. The [synthetic Grok probe packet](docs/integration-drafts/grok-bot-webhook-pilot.md), [Grok Bot research](docs/research/grok-bot-integration-2026-10-08.md), [Grok connection gate](docs/integration-drafts/grok-bot-profile.md) and [offline Grok Bot handoff](docs/review/grok-bot-pilot-packets.md) keep their recorded scopes. The [Muse feasibility assessment](docs/research/meta-muse-webhook-feasibility-2026-10-08.md), [Muse decision](docs/decisions/0013-meta-muse-first-integration.md), [ChatGPT dots research](docs/research/chatgpt-dots-integration-2026-10-07.md), [disabled dots proposal](docs/integration-drafts/chatgpt-dots-profile.md), [Workspace Agent proposal](docs/integration-drafts/workspace-agent-profile.md) and [pinned October 4 capability catalog](docs/agent-compatibility.json) remain retained. That six-host catalog includes neither Muse nor Grok Bot and enables no runtime host; the readiness checker covers its historical scope only. The skill package is local and has not been installed into an agent.

The [Android guide](android/README.md) describes the accepted local inspector and optional owned fixture. The inspector has no Internet permission, destination, credential, export or background collection. Selected-app manual observations stay in RAM and retain unknown source coverage; they are not validated OAP summaries. Inspector 0.2.4 passed the recorded ten local workflows on each [Android 15/API 35](docs/review/android-emulator-0.2.4-api35-validation.json) and [Android 16/API 36](docs/review/android-emulator-0.2.4-api36-validation.json) image. Exact builds, timing comparisons, controlled recreation checks and preserved earlier attempts remain in the [development review](docs/review/android-local-development-0.2.4.md). Every new or changed APK proposed for a personal trial still needs emulator validation of its exact bytes first. Physical/OEM accuracy, complete source coverage and measured M3 remain unproven; no new phone input is required for current integration preparation.

## Current project reference

For the product/runtime, start with the [current system guide](docs/current-system.md) and [personal-agent setup](integrations/openclaw/personal-agent/README.md). For the independent protocol/reference scope, use the [reference instructions](docs/reference.md), [Phase 4 evidence review](docs/review/phase-4.md) and [OAP contract](specs/protocol/oap.md). Supporting specifications are:

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
