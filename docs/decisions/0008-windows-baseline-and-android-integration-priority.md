# ADR-0008: Accept Windows reference evidence and defer Linux portability

Date: **2026-10-04**. Status: **accepted by the user**. Applies to development sequencing and evidence scope; OAP remains **0.1.0**.

## Decision and authority

The user explicitly instructed: “I would prioritize Android feasibility and direct agent integration over completing Linux portability.” They accepted the Windows affirmations as sufficient to proceed and put Linux extensibility on hold. This supersedes the earlier Windows-and-Linux requirement as a prerequisite for Phase 5 and Android feasibility. No additional approval of this priority change is needed.

Accept the existing Windows reference evidence as the **M1/G2 development baseline within its recorded scope**. It includes matching source hashes on Node 22.23.3 and 24.19.0, 201 passed checks with one disclosed device-local fixture exclusion, direct two-process lifecycle/recovery/revocation demonstrations, and 100-summary local benchmarks. The dated [priority review](../review/priority-change-2026-10-04.md) identifies the accepted evidence and limitations.

Linux execution is **deferred, not passed**. Keep the portable design and parked verification tooling. No Linux installation, environment selection, CI deployment or Linux-related user action is required for current progression. Resume that work when Linux support is being offered or the user reprioritizes it.

Proceed with two parallel workstreams:

1. Direct existing-agent integration: create the optional **liveabit Skill**, prepare capability/profile mappings and host-specific pilot prerequisites, then prove a supported direct path on the user's chosen existing agent.
2. Android feasibility: investigate permitted usage access, data quality, background behavior, storage/credential protection, direct connectivity and policy; prepare bounded local probes and physical-device measurement plans.

Android feasibility research and isolated local probes may start before M2. Replacing the simulator with a production Android publisher and declaring M3 still requires a functioning compliant M2 path plus actual Android evidence and approved measurement thresholds. Neither a skill package nor a feasibility document satisfies those gates.

## Preserved constraints and consequences

No intermediary hosting, forwarding service, private-memory import, separate API coach or device enforcement is introduced. Authentication, consent, payload/retention/retry limits and receipt semantics remain unchanged. A native provider trigger requires its own reviewed profile where it differs from OAP's direct receiver interface; an HTTP 202 cannot become a valid-consumption receipt by renaming it.

Update OAP-NFR-007, AC-20, CT-28, roadmap dependencies, traceability and current evidence labels together. Keep their stable IDs. This is an evidence/sequence amendment, not a wire-format change. Historical reports retain the requirements and limits in force when they ran; current reports identify the new progression authorization and continued absence of Linux, real-host and physical-Android proof.
