# Direct integration and Android feasibility preparation

Date: **2026-10-04**. Status: **local preparation implemented; actual M2/M3 not run**. [ADR-0008](../decisions/0008-windows-baseline-and-android-integration-priority.md) accepts the Windows reference for progression and puts Linux on hold.

Historical scope: the 2026-10-05 [local-inspection-first decision](../decisions/0009-android-local-inspection-first.md) supersedes the parallel priority below. Agent selection is deferred; the native collector/inspection app proceeds first under [its specification](../../specs/android/local-inspector.md). This dated preparation report does not establish the later APK or device results.

## Delivered preparation

The optional [liveabit Skill](../../skills/liveabit/SKILL.md) is a portable local package with the exact public name and machine slug `liveabit`. It contains 18 synthetic scenarios, an [evaluation rubric](../../skills/liveabit/references/evaluation.md) and a reviewer-observation scorer. Its [tests](../../test/skill-policy.test.mjs) validate package/scenario integrity and scoring negatives, including privacy/control violations that cannot be erased by an incomplete review. These are package checks, not an AI evaluation or actual skill installation. The official Python package validator could not run because PyYAML is unavailable; equivalent metadata/resource checks and independent instruction review were completed.

The [integration plan](../agent-integration-plan.md), [capability catalog](../agent-compatibility.json) and [native Workspace Agent proposal](../integration-drafts/workspace-agent-profile.md) make prerequisites and contract differences concrete. The catalog covers six researched surfaces with 14 official sources; none is selectable. The [readiness checker](../../scripts/check-agent-readiness.mjs) validates a trusted closed [preparation schema](../../schemas/preparation/agent-compatibility.schema.json), known host IDs, official documentation domains and source relationships. It returns an immutable preparation catalog and can neither enable a receiver nor assert real-account readiness. [Readiness tests](../../test/agent-readiness.test.mjs) reject weakened schemas, fabricated support, metadata mutation and unknown selectors.

Android [research](../research/android-feasibility-2026-10-04.md) and the [measurement plan](../android-feasibility-plan.md) select a provisional API 35+ event-filtering approach, with exact toolchain and physical support still to prove. The [package-event model](../../src/android-observation-model.mjs) and [regression tests](../../test/android-observation-model.test.mjs) are synthetic Windows feasibility work. They use explicit fixture state/continuity assumptions, not a public Android attestation API. They establish no Android permission, OEM, background, battery or native transport success. No SDK, emulator, app or physical-device installation was performed.

Current runtime evidence is in the [reference manifest](phase-4-validation.json); its named environment, source hashes, individual outcomes and explicit limits govern the claim. Approval history and current-run results are separate. Linux evidence is not needed for these priorities.

## Next actual proof

The real-agent pilot needs the user's chosen existing agent/account and a supported direct route. The native Workspace Agent branch additionally needs review of its proposed pairing/authentication and receipt-only result changes; the current direct receiver profile remains unchanged. A token is entered only through protected setup, never chat or source. No blind provider trigger is used as a capability probe.

Android collector measurement needs a pinned Windows development toolchain and an identified owned test device/emulator. Begin with local synthetic/fixture activity and delivery disabled. Actual production Android publication remains dependent on a functioning compliant M2 path. Neither the optional skill nor an SDK install waives that requirement. No delivery infrastructure, independent coach, memory import, device enforcement or production support claim was introduced.
