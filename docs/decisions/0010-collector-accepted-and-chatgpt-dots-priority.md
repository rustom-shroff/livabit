# ADR-0010: Accept the collector for development and target ChatGPT dots

Date: **2026-10-07**. Status: **accepted by the user's explicit progression and target instructions**.

## Decision

The user accepts the current Android collector as suitable for continued development. Precise duration and complete source coverage may remain unproven; additional accuracy investigation is deferred and can resume if practical use reveals a problem. The first integration target is **ChatGPT dots**, following the user's instruction, “lets aim for chatgpt dots.”

The accepted collector baseline is [inspector 0.2.4](../review/android-local-development-0.2.4.md), with the recorded exact-byte Android 15/16 emulator gates and controlled recreation checks. This is development acceptance, without relabeling its estimates as measured accuracy or its unknown coverage as complete. Historical evidence and failed attempts retain their original results.

This supersedes [ADR-0009](0009-android-local-inspection-first.md)'s active collector-first priority. Local findings now suffice to advance TASK-P5-001/002: prepare the liveabit Skill for the existing dot, define the direct MCP Events connection, and prove a synthetic end-to-end pilot when the account and supported setup are available. Further fixture-duration experiments, full-coverage proof and additional physical accuracy trials are outside the immediate critical path.

## Next work and boundaries

The [dots profile proposal](../integration-drafts/chatgpt-dots-profile.md) separates a chosen product target from an enabled, authenticated integration. Account eligibility, a specific existing dot, supported control ingress and observed delivery still need evidence. The dated compatibility catalog remains an unenabled research snapshot; no host becomes production-selectable through this decision.

Begin with synthetic OAP inputs and [offline liveabit Skill review packets](../review/liveabit-skill-review-packets.md). A real synthetic pairing/delivery pilot is work **toward** M2 and does not require M2 to have already passed. Production Android publication still needs its own reviewed implementation and a functioning compliant direct integration. The current inspector keeps its existing local-only behavior and audited APK bytes.

Accuracy deferral does not authorize inventing observation coverage, filling genuine gaps, turning unknown into zero, or treating retained intervals as validated OAP summaries. Any later Android-to-OAP mapping must represent the available evidence truthfully; if the agreed contract cannot express a useful uncertain signal, prepare a concrete versioned amendment rather than manufacture valid data. Existing privacy, consent, scoped authentication, bounded resources, erasure, retry/retention and receipt distinctions remain in force.

Activity must travel from the producing device to the chosen agent's existing infrastructure. No hosted bridge, public proxy, independent tunnel, project authorization server, separate API coach or required user-operated forwarding computer is permitted. A provider-owned ingress remains a candidate only when supported and verified for the selected product. A Windows synthetic pilot must not become an Android-to-desktop-to-dot forwarding dependency. Linux stays deferred.

Every changed APK recommended for a phone trial still requires emulator testing of those exact bytes first. M2/M3, precise duration, complete coverage and production readiness are not declared passed. Their outstanding evidence does not block the newly authorized integration work. Keep all 33 requirement and 29 acceptance IDs stable; this decision changes development priority and records user acceptance, without changing the OAP wire format.
