# ADR-0016: Express native Android estimates as OAP observations

Date: **2026-10-10**. Status: **implementation decision within the user's authorized Android development**, not a replacement approval for the agreed OAP 0.1.0 contract.

The user accepted the collector for continued development, deferred further duration/coverage proof and instructed direct Android implementation under [ADR-0015](0015-android-first-test-receiver.md). The functioning sender must preserve unknown coverage and nullable estimates. OAP 0.1.0 `activity.summary` cannot express those values without inventing established observation intervals.

Add a separate experimental `0.2.0-draft.1` / `activity.observation` record and [schema/specification](../../specs/protocol/activity-observation.md). Implement its construction, stable local identifiers, restricted timestamps and canonical serialization directly in Android. Derive expiry from the original window start. The real final desktop receiver validates the schema and cross-field semantics and displays the record. Its saved-event acknowledgement remains a test receipt; authenticated agent pairing, production admission and valid consumption are not inferred.

Keep the OAP 0.1.0 schemas, source, fixtures, reference evidence and liveabit Skill's current supported family unchanged. Do not feed observations to an existing summary-only adapter or claim Grok compatibility. A future native agent integration must explicitly map/support the observation family and verify the actual receiving account and webhook behavior.

An APK upgrade must not relabel or erase pending activity. Add missing local recipient/subscription identities durably, preserve the previous stream/cursor/timer/queued bytes, and let the receiver accept the prior `liveabit.test.activity.v1` envelope as well. New records use only the observation draft. The user's receiver remains theirs to restart/manage; native tests use an isolated receiver and only the owned emulator.

No hosting, relay, forwarding process, account purchase, JavaScript sender prototype, new dependency or device enforcement is introduced. Accuracy and physical-phone background behavior remain separate future evidence. TASK-P6-F04 carries this work; existing requirement and acceptance IDs retain their original scope.
