# OpenClaw model ownership and WhatsApp delivery

Date: **2026-10-11**. This continues the [main-agent POC](openclaw-main-agent-2026-10-11.md) without rebinding its frozen 0.5.0 evidence.

## Product progress

The existing main OpenClaw agent receives Android observations directly and can use its native WhatsApp message capability for an optional goal-grounded nudge. There is no relay, hosted service or model client in Android. The webhook's ordinary response remains local; `deliver: false` is retained. [Delivery setup](../integration-drafts/openclaw-whatsapp-pairing.md).

The user explicitly selected **`openai/gpt-6.1-sol` with `medium` reasoning**. The [model helper](../../scripts/set-openclaw-model.ps1) admits that available model into the main agent's effective policy, preserves its authentication profile/runtime, and clears conversation model/reasoning pins without resetting the conversation. Other agents are untouched. Integration and WhatsApp setup do not choose models. The user owns future changes. [Model instructions](../integration-drafts/openclaw-model-settings.md).

An actual owner-authorized run completed with requested, effective and response model `gpt-6.1-sol`, no rerouting and the same canonical main session. Medium is the saved default with no conversation override; the run does not expose direct reasoning-effort telemetry. [Private verification](../../artifacts/openclaw/model-choice-verification.json).

## WhatsApp verification

The official connector is linked and connected. The setup helper verified only the linked account's own identity and retained it in a private host policy. Incoming DM/group chats and read receipts remain disabled. Existing allowlist entries and all agent/model settings were preserved.

Two separately authorized checks obtained provider message IDs: the direct transport check `3EB06621C3933E2265D81E` and the main agent's native message-tool check `3EB06758C265D667A02803`. The latter ran on Sol 6.1 and completed successfully. [Transport result](../../artifacts/openclaw/whatsapp-delivery-result.json), [agent result](../../artifacts/openclaw/agent-whatsapp-check-result.json). These results establish provider acceptance; physical-phone arrival, notification display and reading are unconfirmed.

The installed liveabit Skill reads only the private fixed-destination policy and its local state. With no established goal, it sends no behavioral advice. Defaults are a 60-minute cooldown and quiet hours 22:00–08:00 America/Chicago; existing user preferences take precedence. Repeated, stale or synthetic observations must not create coaching messages. This POC's policy is followed by the agent rather than independently enforced by a delivery service. No real goal-driven coaching is claimed.

## Android verification

The exact [0.6.0 APK](../../artifacts/android-publisher/liveabit-sender-0.6.0-poc.apk), SHA-256 `eb4a8db0aaba5ed9ed33564a70af318ee7790a569dc235131232620b516deaf9` (199,928 bytes), passed **37 real Android checks** on the project-owned Android 15/API 35 emulator. The complete suite covers native networking, actual collection, immutable retries, rejected acknowledgements, setup/agent changes, rendered guides, persistence, JobScheduler delivery, a one-minute outage notification and admission by the installed OpenClaw gateway. [Native report](../../artifacts/android-publisher/run-51d466ec-676e-45fc-bb77-eacbdb39c987/validation.json). Gateway admission returned run `4c5017d9-1990-4926-afc3-a5efec25bd64`.

The [final build and lint](../../artifacts/android-publisher-build-0.6.0-final.txt) passed with zero errors and ten warnings. A final source-comment correction produced the identical tested APK hash, so no new binary was substituted after testing. [Source bindings](openclaw-whatsapp-2026-10-11.json).

Initial full attempts failed only the final live gateway check with an HTTP 5xx outcome; their failed reports remain in ignored artifacts. An isolated live attempt and the final complete suite passed. Replaying one captured fixture request from the host also returned HTTP 200. The underlying intermittent gateway error was not identified or claimed fixed. The app's durable retry behavior remains covered by native failure/recovery checks. Debug builds now retain a bounded private server-error response, excluding request fields; the instrumentation APK can preserve the synthetic failed request without its key. Release builds skip the runtime diagnostic.

The suite's isolated receiver was stopped. The owned emulator was stopped after validation, and the managed OpenClaw gateway was left running. The user's inspection receiver was not controlled. [Receiver cleanup](../../artifacts/android-publisher/run-51d466ec-676e-45fc-bb77-eacbdb39c987/receiver-cleanup.json), [emulator cleanup](../../artifacts/android-publisher/run-51d466ec-676e-45fc-bb77-eacbdb39c987/emulator-cleanup.json).

## Remaining input

The tested APK is ready for an optional physical-phone trial with the private Wi-Fi setup. Confirm whether the WhatsApp check messages arrived and produced a phone notification. Personal goals and notification preferences should be supplied directly to the main OpenClaw agent. Duration accuracy, complete coverage, battery behavior and exact background timing remain deferred POC limits. This validates a local integration slice, not formal completion of the broader protocol milestones.
