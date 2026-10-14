# ADR-0024: ongoing personal-agent support for behavior change

Date: **2026-10-14**. Status: **Accepted for implementation by the user's instruction**. Reorients the product around the user's existing personal agent. Supersedes ADR-0021's dedicated task-reminder agent as the current product direction and extends ADR-0023's companion route. Their tested results remain historical evidence. OAP, Android consent, direct delivery and all existing stable requirement/acceptance IDs retain their scopes.

## Context

Phone observations reaching an agent do not establish that the agent used them, remembered an earlier conversation or delivered a useful intervention. A Skill and a persistent conversation provide instructions and context, but neither is a durable processing ledger, complete personal history or guaranteed delivery mechanism. The previous scheme kept only a bounded list of processed event IDs and best-effort agent delivery state; it could remain silent without explaining which stage prevented contact.

The user wants an ongoing relationship with their own agent, rather than isolated reminders tied only to open tasks. The agent should understand relevant personal circumstances, ask about feelings and obstacles, reason about patterns, persuade using the user's own values and reconsider its approach after repeated attempts. Behavioral judgment belongs to the model. Facts, permission boundaries and delivery mechanics should be reliable runtime responsibilities.

The user authorized applying tested changes to the live OpenClaw installation, selected the existing companion chat as the first conversational surface, and kept automatic accountability emails disabled. No separate coach account, forwarding service or project backend is authorized by this decision.

## Decision

Use the user's continuing OpenClaw **main** personal agent as the owner of the relationship. OAP activity is one input alongside the user's conversations, goals, commitments, Workboard tasks and explicitly supplied personal context. Reuse the existing host and user-owned model settings. Do not copy private context back to the Android provider, create a second personal task store or infer that every old chat is accessible.

Implement a bounded durable activity inbox, queryable summaries, episode records and personal-context tools **inside the final OpenClaw gateway/runtime**. Preserve original packet identities, times and uncertainty. Separate admitted observations from model decisions and delivery outcomes. A local embedded store is part of the destination; an independent forwarding process is not.

Deterministic code validates permitted observations, deduplicates identities, computes factual summaries, applies retention and enforces explicit delivery permissions/preferences. It must not classify an app as bad, infer a feeling, diagnose a motive or mechanically decide that a particular usage threshold deserves persuasion. The model decides whether to stay quiet, ask a question, offer an alternative, encourage, persuade, follow up or reconsider, using retrieved evidence and the user's instructions.

Keep user-reported feelings, model hypotheses and observed activity distinguishable. Ask when the interpretation matters; do not present a guess as something the user said. Contextual persuasion may be direct when the user wants it, but must stay truthful, recognize deliberate leisure, respect refusal and adjust to the user's response. Repeated attempts are evidence to reconsider timing, advice, underlying obstacles or the goal itself; they are not an automatic ladder toward harsher pressure.

Use the **existing companion chat first** for personal conversation and feelings inquiry. Verify the installed host's actual conversational delivery capability. A local `system.notify` call is a notification, not proof of a delivered chat message or user reply. When only notification delivery is available, offer a brief invitation to return to the companion chat and record that limitation. Preserve the chosen destination and private preview preferences. Automatic accountability emails remain disabled; activity and persuasion do not create authority to contact another person.

## Implementation and evidence boundary

The first authorized implementation increment is the durable host-local foundation, a restrictive notification tool and migration to the continuing personal agent, with tests before live application. `liveabit_notify` accepts only a stored question/nudge decision ID, uses the private exact companion destination and enforces explicit timing/cooldown with a durable one-attempt reservation; uncertain outcomes cannot trigger replay. Its completion needs separate code/test/configuration evidence. The [personal-agent specification](../../specs/personal-agent-intervention.md) adds PA requirements and PA acceptance cases without declaring that the full intervention loop, companion conversation initiation or lasting behavior change has been demonstrated.

Future work covers observed conversations about feelings, user corrections, repeated-attempt adaptation, automatic post-admission processing recovery, follow-up scheduling where supported and outcomes over time. A duplicate without a recorded decision may reach native admission again after a prior post-commit failure; this is not automatic recovery of admitted model work. Recording an episode is not evidence that a follow-up scheduler exists. Setup connects no new calendar/email source. A passed storage fixture is not evidence of native phone delivery. Admission, model execution, conversational delivery, physical notification display, user response and usefulness must each be reported separately.

## Consequences

The agent can retrieve relevant evidence instead of relying on an ever-growing transcript. A recorded reason for silence or failed delivery makes troubleshooting possible. A still-fresh sender retry for a stored observation without a decision can reach native admission again; automatic recovery of model work that failed after admission remains future work. Durable bookkeeping supports flexible reasoning without requiring the model to retain every packet in its prompt.

Retained data is still incomplete: coverage is unknown, foreground durations are estimates and feelings are contextual self-reports. More memory improves recall, not measurement accuracy or access to every personal memory. Host retention, deletion and provider copies remain separate from stopping collection on Android. There is no eventual-delivery, exactly-once side-effect or behavioral-improvement guarantee.

## Alternatives considered

Keeping only Skill instructions leaves processing, duplicate suppression and delivery status dependent on every model turn. Giving a database every packet without query tools, retention and decision records supplies storage without an observable reasoning loop. A standalone coach loses the continuity of the user's agent and changes the product boundary. A project-hosted database or relay adds an operational dependency forbidden by OAP-NFR-009. The chosen design keeps durable evidence and bounded mechanics in the existing final host, with personal judgment owned by the agent.
