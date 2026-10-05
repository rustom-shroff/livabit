# ADR-0001: Independent OAP and conditional MCP integration

Date: 2026-10-03. Revision: 0.2. Status: accepted in the user's approved Phase 1/2 baseline 0.2. Concrete protocol refinements remain subject to G1 agreement.

## Context

OAP must outlive platforms and agent integrations. MCP Events has documented OpenAI support, but onboarding requires discovery/subscription/control access to the publisher. Outbound webhook delivery alone does not establish a phone-to-agent connection. The user excludes hosted intermediaries. [Feasibility](../research/feasibility.md)

## Decision

Keep schemas, activity, consent, limits, identities and recovery independent of MCP. Specify a direct publisher-to-receiver reference profile first. Evaluate MCP Events only where its full lifecycle works inside device/agent runtimes through direct or supported agent-provider ingress.

No project-hosted discovery, OAuth service, subscription registry or public proxy is permitted. Provider-managed private connectivity is a candidate, not proof of Android execution, MCP Events interoperability or public distribution. Defer incompatible hosts instead of adding a relay.

For a selected MCP profile, preserve OAP in transport data; pin versions and test discovery/result shapes, verification, renewal, receipts and recovery. Mock conformance and real personal-agent evidence remain separate gates.

## Alternatives and consequences

| Alternative | Decision |
| --- | --- |
| OAP defined as MCP Events | Reject: draft/host coupling |
| Callback URL assumed to solve onboarding | Reject: credentials follow host subscription and later control access |
| Project-run or user-run forwarding server | Reject: violates accepted constraint |
| A new API agent replacing the existing assistant | Reject as M2 evidence: consumer context is not inherited |
| Direct reference with conditional host profiles | Select |

Initial host compatibility may be narrower or the OpenAI pilot deferred. This is a feasibility limit, not permission to relax the constraint.

Related requirements: OAP-FR-001/006/011/012/014, OAP-NFR-001/005/009. Areas: PA-02/03/04/06/07. Evidence: AC-01/08/14/22/28/29.
