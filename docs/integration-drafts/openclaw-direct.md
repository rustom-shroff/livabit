# OpenClaw direct Android integration

**Phone confirmation, 2026-10-11:** The user reported that both WhatsApp connection-check messages arrived with a notification. [Confirmation](../review/openclaw-phone-notification-2026-10-11.md). Use the existing tested 0.6.0 APK for the [real-activity phone trial](openclaw-phone-pilot.md); its bytes are unchanged.

Updated: **2026-10-11**. Status: **0.6.0 passed all 37 native checks; user-selected model and main-agent WhatsApp check verified**. See the [0.6.0 review](../review/openclaw-whatsapp-2026-10-11.md). Current decision: [ADR-0018](../decisions/0018-existing-main-agent-context.md). The [0.5.0 main-agent](../review/openclaw-main-agent-2026-10-11.md) and [0.4.0 dedicated-agent](../review/openclaw-poc-2026-10-11.md) baselines remain preserved. Sol 6.1 completed a separate operator run; medium is the verified inherited configuration, not directly reported effort telemetry. Phone receipt and notification for the checks are user-confirmed. Goal-grounded nudges are ready for a real-activity trial.

The activity path is **liveabit Sender on Android -> the user's installed OpenClaw -> the explicitly selected agent**. The user selected existing **`main`** for goals and context. OpenClaw is the final recipient; the desktop display receiver remains independent and does not forward activity.

## Native webhook mapping

The verified target is OpenClaw **2026.9.9**, commit **`bcfc888`**, installed through Windows package **2026.9.900.0**. Use the installed version's webhook behavior; current online documentation can describe later releases.

| Android delivery | OpenClaw mapping |
| --- | --- |
| Destination | `/hooks/liveabit` for server-fixed main conversation; legacy `/hooks/agent` for isolated runs |
| Authentication | `Authorization: Bearer` with the dedicated hook token, separate from gateway admin authentication |
| Agent | Saved `agent_id`; mapped `/hooks/liveabit` requires `main`, while `/hooks/agent` supports an explicitly allowed agent, including legacy `liveabit` |
| Conversation | Server-owned canonical main key and persistent mode create/reuse the configured conversation; callers cannot choose session keys |
| Run behavior | `name: "liveabit"`, `wakeMode: "now"`, `deliver: false` |
| Message | Fixed activity-data introduction followed by the original canonical `0.2.0-draft.1` / `activity.observation` JSON |
| Retry identity | `Idempotency-Key` equals the original `event_id` |
| Successful acknowledgement | HTTP 200 with `ok: true` and nonempty `runId`; **run admission only** |

The sender retains its selected-app collection, immutable pending events, bounded queue, expiry, protected token storage and configurable receiver-down warning. A valid OpenClaw admission response clears the admitted event from the local queue. It does not establish completed interpretation, user notification or an OAP valid-consumption receipt. A missing response can cause retry after the run was already admitted. OpenClaw's verified in-memory idempotency cache lasts five minutes and does not survive restart, so this POC does not promise exactly-once delivery.

The original observation remains unchanged inside the webhook message: unknown coverage stays unknown, unavailable durations stay null, and retained estimates stay unverified. OpenClaw's wrapper is a provider mapping, not a change to the OAP observation schema. Existing summary-only adapters remain separate.

## Local setup

The [setup helper](../../scripts/configure-openclaw.ps1) defaults `-AgentId` to `main`, installs liveabit Skill in its existing workspace and generates private files using native `/hooks/liveabit` mapping. The server fixes main and its canonical persistent conversation key; caller session selection is disabled. No canonical conversation record existed before setup, so the first verified hook created it. Earlier chats are not imported. For explicit main-agent local setup:

```powershell
.\scripts\configure-openclaw.ps1 -AgentId main
```

Without `-Lan`, setup leaves the existing gateway binding unchanged and generates USB/emulator files. Read its output for the actual port; this Windows package can use a dynamic port. Main-agent setup preserves its existing AGENTS, model, ordinary tool policy, heartbeat, other skills and unrelated settings. It merges the hook agent allowlist and any explicit skill allowlist instead of replacing earlier entries. Do not apply the dedicated activity agent's restrictions to `main`.

The user-approved LAN binding is enabled. Add `-Lan` when generating Wi-Fi files for the selected agent. Use generated addresses rather than a hardcoded default port. Native [main-agent emulator-to-host-LAN admission](../../artifacts/openclaw/android-main-lan-admission.json) passed with the 0.5.0 APK. Earlier [0.4.0 LAN evidence](../../artifacts/openclaw/android-lan-admission.json) remains separate. Physical-phone delivery is untested.

| Connection file | Intended use |
| --- | --- |
| `artifacts/openclaw/android-wifi-setup.json` | Created with `-Lan`; phone and computer must share a reachable local network |
| `artifacts/openclaw/android-usb-setup.json` | Phone connected through USB port reversal |
| `artifacts/openclaw/android-emulator-setup.json` | Owned Android emulator |

Import the appropriate file in the sender, check the selected OpenClaw agent, choose apps, grant usage access and notification permission, then explicitly start sharing. Import only fills setup. The format remains `liveabit.openclaw.connection.v1` with required `agent_id`, matching `[a-z0-9][a-z0-9_-]{0,63}`. An editable **OpenClaw agent** field defaults to `main` and is effective only for the exact OpenClaw hook paths. `/hooks/liveabit` accepts only `main`, matching the server mapping; `/hooks/agent` remains configurable. Changing agents requires the same explicit Start/queue-clearing confirmation as changing endpoints. Saved legacy settings retain `liveabit` and pending wrappers are not retargeted. The display receiver still uses `liveabit.receiver.connection.v1`.

Generated files belong to the selected agent. Use the emulator-validated [0.6.0 APK](../../artifacts/android-publisher/liveabit-sender-0.6.0-poc.apk) for current main setup. Sender 0.4.0 accepts only earlier liveabit setup; do not combine a main file with the older APK.

For USB, connect the phone with USB debugging enabled and reverse the helper's reported port before importing the USB file: `adb reverse tcp:<port> tcp:<port>`. Substitute the same actual port in both places. Run `adb reverse --remove tcp:<port>` to remove that mapping when finished.

These files contain a credential. Keep them local and outside Git, issue reports and chat. The helper retains local backups and preserves unrelated agents/settings. Hook requests keep `deliver: false`, so ordinary hook responses stay local. A separate host-owned policy can authorize a selective WhatsApp nudge through main's communication tools. The old dedicated agent's `tools.deny: ["*"]` and disabled heartbeat belong to its baseline only. OpenClaw CodeMode still exposes JavaScript `exec`/`wait` and `skills.read`; do not claim that either setup has zero tools or prevents all execution.

The connection is local. Wi-Fi reachability depends on the computer's gateway binding and firewall and on the two devices being on a network that permits communication. USB remains a direct alternative. No public port, hosted relay or tunnel is required.

## Existing-agent context and 0.5.0 baseline

Goals, memories, instructions and conversations stay in OpenClaw. The app/helper do not read or copy them into liveabit. Native mapping creates or reuses the configured canonical main conversation. Its record was absent before setup; the verified first hook created it and completed a main-agent response. Main's configuration entry matched its backup, and AGENTS remained unchanged. This demonstrates use of the existing agent/workspace, not imported earlier chats or proved use of private goals. Activity cannot select a conversation or widen authority.

**0.5.0-poc** adds saved agent routing, selected-agent status and endpoint/port-aware Wi-Fi/USB instructions. Its exact installed APK passed [37 native Android 15/API 35 checks](../../artifacts/android-publisher/run-472c26e5-8a30-4a4d-a025-fa48d09e2228/validation.json), including actual main admission (`bcd8d0a4-801a-4500-b3d8-98ce2c4c3095`). Separate completed main output for the synthetic event preserved unknown coverage and estimate uncertainty. Additional native host-LAN admission passed. The [main-agent review](../review/openclaw-main-agent-2026-10-11.md) records safe results separately from private host content.

A second native LAN event verified [same-conversation continuity](../../artifacts/openclaw/main-continuity.json): both synthetic events and their completed responses are present in canonical `agent:main:main`, with unchanged session identity. This establishes reuse for those two sends. It does not establish access to earlier chats or private goals; no personal history was exported.

The final build took 1 minute 32 seconds; lint reported zero errors and ten warnings. APK SHA-256: `fa0214538c6708742951ead442dfe408099ea7fb495c2634ee78e504a71f6c1e`. The exact-byte emulator gate is satisfied for an optional phone trial. Physical-phone delivery, prior-chat context, battery/background timing and formal M2/M3 remain separate claims. Development can continue independently.

## User-owned model and selective phone delivery

The user controls [main's model and thinking level](openclaw-model-settings.md). The requested `openai/gpt-6.1-sol` model completed a separate trusted operator agent run with matching requested/effective/response model and unchanged canonical conversation. Medium thinking is verified in inherited configuration without session/hook overrides; run telemetry did not directly report effort. Activity and WhatsApp helpers do not change the model. Earlier operator-like probes submitted through the untrusted activity hook were not completed model proofs and are excluded from this result.

The official 2026.9.9 WhatsApp plugin is installed, and the account is [linked and connected](../../artifacts/openclaw/whatsapp-login/state.json). The [delivery guide](openclaw-whatsapp-pairing.md) prepares a private host policy fixed to the account's verified own identity. It defaults to a 60-minute cooldown and quiet hours 22:00–08:00 America/Chicago; the user can change those settings. Incoming direct/group chats and read receipts remain disabled. Ordinary hook replies stay local; separately authorized nudges use the Skill and the host policy. Without established goals or enough context, the agent should not send an unsolicited nudge.

Quiet hours, cooldown and duplicate suppression are best-effort agent policy, not guaranteed transport enforcement. An explicit [connection-check send](../../artifacts/openclaw/whatsapp-delivery-result.json) succeeded with a provider message ID for the verified own target and unchanged agent/model settings. A separate [main-agent WhatsApp check](../../artifacts/openclaw/agent-whatsapp-check-result.json) completed on Sol 6.1: the agent read its private policy and used the native message capability to send one authorized own-chat check. Runtime metadata reported source reply delivery; the terminal reply was silent. This establishes agent-driven channel use, separately from the manual transport check. The user subsequently confirmed phone receipt and notification for the checks. Provider read telemetry and a goal-grounded activity nudge remain unproved.

**0.6.0-poc** clarifies this boundary in the native activity introduction. Initial full emulator attempts passed 36 baseline/contract checks but failed actual live-hook delivery with HTTP 5xx. A later [live-only diagnostic retry](../../artifacts/openclaw/android-live-0.6.0-diagnostic.txt) passed on that unchanged candidate. The final APK then passed [all 37 native checks](../../artifacts/android-publisher/run-51d466ec-676e-45fc-bb77-eacbdb39c987/validation.json), including live delivery. Earlier failures are preserved and their cause remains unconfirmed; no fixed root cause is claimed. The Android receiver-down notification remains independent and is covered by the native suite.

Final APK SHA-256: `eb4a8db0aaba5ed9ed33564a70af318ee7790a569dc235131232620b516deaf9`. The [latest build log](../../artifacts/android-publisher-build-0.6.0-http-diagnostic.txt) and [0.6.0 review](../review/openclaw-whatsapp-2026-10-11.md) bind the release. The exact-byte emulator gate is met for an optional activity phone trial. Physical-phone collection/delivery, real goal-grounded coaching, battery timing and formal M2/M3 remain unproved. Phone receipt and notification for the connection checks are user-confirmed. Development can continue independently.

## Verified dedicated-agent 0.4.0 baseline

The configured runtime was exercised from the exact Android APK on the owned emulator. The [native validation](../../artifacts/android-publisher/run-ea7f57fe-4d14-4b9d-aed9-c6d1828b16c3/validation.json) passed **31 checks** on Android 15/API 35, including real selected-app observations, native hook body/authentication/idempotency, acknowledgement refusal, retained retry, one-minute outage notification/recovery, test-receiver compatibility and actual OpenClaw admission. The installed gateway returned run ID `97595969-b36c-47df-bc32-e344344f9ec8`.

Separate real agent history confirmed that the `liveabit` agent read the Skill and interpreted the observation: the owned fixture's 92.889 seconds remained an unverified estimate, coverage remained unknown, and 15 transitions were not treated as proof of leaving the app. This is observed interpretation for that event, separate from HTTP admission. See the [dated POC review](../review/openclaw-poc-2026-10-11.md).

Native **0.4.0-poc** built successfully, with lint reporting zero errors and nine warnings. APK SHA-256: `43650faaef9f304a2a2f4d7522f43be6a78255df77bfc242c2b70623b5e78273`. Its exact-byte emulator gate is satisfied only for that dedicated-agent build/setup. Physical-phone delivery/background timing, complete coverage, battery behavior and production M2/M3 are not established by this POC.

Grok, Muse and ChatGPT investigations remain historical alternatives. They do not gate this authorized OpenClaw POC, and no account purchase is needed to implement the local path.

## Versioned sources

Webhook behavior was checked against the installed release's [hook configuration documentation](https://github.com/openclaw/openclaw/blob/v2026.9.9/docs/gateway/config-hooks.md) and its actual implementation. The Windows installation is described by the [v2026.9.9-msix.0 packaging README](https://github.com/openclaw/openclaw-windows-packaging/blob/v2026.9.9-msix.0/README.md). Runtime validation must still record what the local instance actually does.
