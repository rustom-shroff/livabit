# OpenClaw WhatsApp pairing and selective delivery

**Phone confirmation, 2026-10-11:** The user reported that both WhatsApp connection-check messages arrived with a notification. [Confirmation](../review/openclaw-phone-notification-2026-10-11.md). Use the existing tested 0.6.0 APK for the [real-activity phone trial](openclaw-phone-pilot.md); its bytes are unchanged.

Updated: **2026-10-11**. The user selected WhatsApp for phone communication. The official OpenClaw **2026.9.9** WhatsApp plugin is installed, and the account is [linked and connected](../../artifacts/openclaw/whatsapp-login/state.json). Managed configuration/restart and corrected login/status calls were exercised before successful phone pairing. The [explicit connection-check send](../../artifacts/openclaw/whatsapp-delivery-result.json) succeeded with a provider message ID for the verified own target; the helper confirmed agent/model settings were unchanged. The user confirmed phone receipt and notification for both connection checks. A real-activity trial is next.

The [preparation helper](../../scripts/prepare-openclaw-whatsapp.ps1) uses the installed Windows Gateway and its managed login. It prepares the `default` WhatsApp account with incoming direct/group chats and read receipts disabled, preserves unrelated settings and existing phone credentials, and saves a local configuration backup. It does not send a message. This channel belongs to OpenClaw, with no project-operated relay. The following pairing steps are retained for reconnecting; the connected account needs no new scan now.

1. From the project root, run:

```powershell
.\scripts\prepare-openclaw-whatsapp.ps1
```

2. Open the reported private QR image at `artifacts/openclaw/whatsapp-login/qr.png` on the computer. On the existing phone, open WhatsApp's **Linked devices**, choose **Link a device** and scan it.
3. Refresh the managed login after scanning, or if the QR expires:

```powershell
.\scripts\prepare-openclaw-whatsapp.ps1 -Refresh
```

4. Check the reported connection state. A QR image means **awaiting phone scan**; it is not proof of a linked or connected account. The helper records status in `artifacts/openclaw/whatsapp-login/state.json` without printing a phone number. Keep login artifacts private and outside Git.

## Selective delivery to the account's own chat

The [delivery helper](../../scripts/configure-openclaw-whatsapp.ps1) verifies the linked account's own identity and writes a private liveabit Skill policy in main's existing workspace. It fixes the target to that identity, retains existing allowlist entries and disabled incoming chats, and preserves the user's model/settings. Configure it from the project root:

```powershell
.\scripts\configure-openclaw-whatsapp.ps1
```

Defaults are a **60-minute cooldown** and **22:00–08:00 quiet hours** in **America/Chicago**. Change them with `-CooldownMinutes`, `-QuietStartHour`, `-QuietEndHour` and `-TimeZone`; equal start/end hours disable the quiet period. Keep the policy and its delivery-state file private in the agent workspace.

For an explicit connection check to that same own chat:

```powershell
.\scripts\configure-openclaw-whatsapp.ps1 -SendTest
```

This sends one fixed test message with explicit main ownership. It does not invoke a model or change its selection. A provider message ID means the provider acknowledged the send; confirm phone receipt separately. The helper does not automatically retry an uncertain send.

A separate [actual main-agent check](../../artifacts/openclaw/agent-whatsapp-check-result.json) completed on Sol 6.1. The agent read its private delivery policy and used the native message capability to send one authorized own-chat check; metadata reported source reply delivery, with a silent terminal reply. This verifies agent-driven channel use rather than only the helper's transport call. The user confirmed phone receipt and notification for the checks. A real goal-grounded activity trial is next.

Current [liveabit hooks](openclaw-direct.md) keep `deliver: false`, so ordinary hook responses stay local. A separate host-owned policy authorizes a selective nudge only when available user goals/context justify it. Missing goals means no unsolicited nudge. Quiet hours, cooldown and duplicate suppression are **best-effort agent instructions**, not guaranteed transport enforcement. The Android **Receiver is down** notification remains independent.

This workflow follows the installed release's [WhatsApp channel documentation](https://github.com/openclaw/openclaw/blob/v2026.9.9/docs/channels/whatsapp.md). Main-agent goals and private context stay in OpenClaw.

## Next steps

The account is connected, both the transport check and separate main-agent send succeeded, and exact Android 0.6.0 bytes passed all 37 native checks. Further development can continue independently. Phone receipt and notification for the checks are user-confirmed; a real goal-grounded activity trial is next. No new pairing action is required.
