# Android to the main OpenClaw agent

Date: **2026-10-11**. Follows the user's selection of their existing `main` agent under [ADR-0018](../decisions/0018-existing-main-agent-context.md). The [0.4.0 dedicated-agent review](openclaw-poc-2026-10-11.md) remains a separate, preserved baseline.

## App progress

Native Android **0.5.0-poc** explicitly imports, stores and displays the receiving OpenClaw agent. The selected main-agent setup uses `/hooks/liveabit`. OpenClaw's native mapping fixes the receiving agent and canonical main conversation server-side, with persistent session mode and caller-selected sessions disabled. Android supplies neither a session key nor a session mode. The existing `/hooks/agent` and independent display-receiver routes remain available.

The main agent keeps its model, tools, heartbeat and existing workspace instructions. The observation-aware liveabit Skill is installed in that workspace; goals and personal context remain in OpenClaw. The Android app has no copy of the user's goals or chat history. A comparison against the local configuration backup verified the main agent configuration was unchanged; instruction-file metadata and installed Skill hashes were recorded privately.

The app migrates older settings to `agent_id: liveabit` without rewriting queued bodies. Repeating the same configuration retains the queue; changing the selected agent uses the existing pending-event confirmation. Cancel leaves the previous configuration and immutable bodies intact. The fixed main mapping rejects a setup declaring another agent. Native Wi-Fi and USB help follows the imported OpenClaw connection and shows its actual port, instead of launching the inspection receiver.

## Verification

The exact [0.5.0 APK](../../artifacts/android-publisher/liveabit-sender-0.5.0-poc.apk), SHA-256 `fa0214538c6708742951ead442dfe408099ea7fb495c2634ee78e504a71f6c1e`, passed **37 real Android checks** on the owned Android 15/API 35 emulator. The installed candidate was hash-matched before testing. [Native report](../../artifacts/android-publisher/run-472c26e5-8a30-4a4d-a025-fa48d09e2228/validation.json), [source bindings](openclaw-main-agent-2026-10-11.json). Build and lint passed with **zero errors and ten warnings**. [Final build log](../../artifacts/android-publisher-build-0.5.0-final.txt).

The full suite retains the 26 real collector/receiver, persistence, notification and native-screen checks. Ten OpenClaw checks exercise actual Java networking, import without starting sharing, selected-agent UI, dynamic guides, acknowledgement refusal, immutable retries, legacy agent migration, fixed main routing and agent-change confirmation. The final check sends a real fixture observation through the installed main mapping; HTTP admission returned run ID `bcd8d0a4-801a-4500-b3d8-98ce2c4c3095`. A separate [native LAN send](../../artifacts/openclaw/android-main-lan-admission.json) passed through the host address supplied to the phone.

The actual main conversation contained the synthetic input and a completed response referencing event `de197dba-61ff-4a47-9b92-c487c722bec0`, with unknown coverage and estimate uncertainty preserved. [Private synthetic response](../../artifacts/openclaw/main-synthetic-response.json). The initial metadata lookup found no canonical main conversation record: the first hook created it in the existing main agent, rather than importing another chat. The second native LAN event and its completed response were found in that same conversation with its session ID unchanged. [Bounded continuity check](../../artifacts/openclaw/main-continuity.json). This does not imply that every existing OpenClaw chat or memory is automatically available.

The first response-check script assumed user-message content was an array; this runtime returned it as a string. Correcting that diagnostic parser exposed the input and successful response without any application or gateway change. Admission was never used as a substitute for observed model completion.

The model response remains local. The official WhatsApp 2026.9.9 connector was installed because the user already has WhatsApp on their phone. The [pairing helper](../../scripts/prepare-openclaw-whatsapp.ps1) configured the default account with incoming DM/group chats and read receipts disabled, restarted the managed gateway, and generated a private QR image. Its refresh path and native login/status calls completed successfully with status `awaiting_phone_scan`. [Private login state](../../artifacts/openclaw/whatsapp-login/state.json), [phone instructions](../integration-drafts/openclaw-whatsapp-pairing.md). No successful phone link or nudge delivery is claimed.

The first login attempt exposed Windows PowerShell 5 / `.cmd` stripping embedded JSON quotes. The helper now escapes quotes for legacy native argument passing while retaining plain JSON for Standard mode. The corrected calls were exercised against the installed Windows gateway; failed diagnostics stay in ignored local files. Human pairing completion remains untested.

## Limits and next steps

The phone and computer must be reachable on the local network. Gateway HTTP acceptance records run admission; retries can still duplicate work after the temporary idempotency cache expires or the gateway restarts. Android scheduling can delay sending and warnings. A one-minute notification setting was exercised; the 60-minute default was checked without waiting an hour. Duration precision, complete coverage and physical-phone delivery remain unproven and do not block continued POC development.

Transfer the private `artifacts/openclaw/android-wifi-setup.json` to the phone, import it in the tested APK, choose apps and explicitly start sharing. [Phone connection guide](../../android/publisher-app/README.md). Further local work can continue independently. Linking WhatsApp requires the account owner's phone approval; personal goals should be given directly to the main OpenClaw agent.

## Exact-release sources

- [OpenClaw v2026.9.9 hook configuration and persistent sessions](https://github.com/openclaw/openclaw/blob/v2026.9.9/docs/gateway/config-hooks.md)
- [Native hook mapping dispatch](https://github.com/openclaw/openclaw/blob/v2026.9.9/src/gateway/server/hooks.ts)
- [Persistent session preparation](https://github.com/openclaw/openclaw/blob/v2026.9.9/src/cron/isolated-agent/run-prepare.ts)
- [WhatsApp personal-number linking](https://github.com/openclaw/openclaw/blob/v2026.9.9/docs/channels/whatsapp.md)
