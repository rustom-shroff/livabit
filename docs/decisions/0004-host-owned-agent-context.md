# ADR-0004: Host-owned context and optional liveabit Skill

Date: 2026-10-03. Revision: 0.2. Status: accepted in the user's approved Phase 1/2 baseline 0.2. Concrete protocol refinements remain subject to G1 agreement.

## Context

The user's existing assistant may have relevant goals and history. Consumer context, API session state, and a skill are different capabilities. [Research](../research/feasibility.md) identifies supported OpenAI event/context paths and possible retrieval paths for other hosts, each with eligibility and context limits.

## Decision

Keep goals, standing instructions, memories, leisure preferences, and interruption policy in the agent host. The provider offers authorized facts and safe status/retrieval, without requesting coaching context or generating coaching. liveabit Skill supplies interpretation/workflow guidance through installed tools; it supplies no receiver, scheduler, permission, or private-memory access.

M2 must demonstrate a supported direct receiving/pairing path without a forwarding service, standing instructions supplied inside the existing personal-agent host, receipt, appropriate processing, and user output. Test quiet periods, intentional leisure, uncertain observations, duplicate/stale activity, missing context, and recommendations for restrictions. Initial tools cannot enforce restrictions. No behavioral-improvement guarantee is made.

## Alternatives and consequences

Copying private memory into the provider defeats the product boundary. Building a new API coach can establish a custom runner but does not demonstrate access to the user's existing assistant. A universal skill can share concepts; packaging, available tools, scheduling, and selected context still require host-specific verification.

When context is unavailable, the skill should state uncertainty or ask within the host's user workflow, not invent goals or send them back to the provider. Use approved notification channels and user preferences. Existing assistant context is selected and incomplete, so documentation must avoid claims of omniscient personalization.

Related requirements: OAP-FR-013/014/016, OAP-PR-001/005/007. Evidence: AC-22/23/24.
