# OpenClaw WhatsApp pairing and selective delivery

**Existing phone checks, 2026-10-11:** Both WhatsApp connection-check messages arrived with a notification, as [confirmed by the user](../review/openclaw-phone-notification-2026-10-11.md). The account is already linked and connected; no new scan is required. These checks are separate from a task-grounded nudge.

Updated: **2026-10-13**. Activity targets dedicated **liveabit** under [ADR-0021](../decisions/0021-task-aware-liveabit-agent.md). Its setup copies the existing verified private self-chat policy and delivery state from main if absent, retains the target/cooldown/quiet hours and changes policy agent ownership to liveabit. Both agents' model choices are preserved. [Current setup](openclaw-direct.md), [optional task-aware phone trial](openclaw-phone-pilot.md), [current evidence](../review/openclaw-task-aware-2026-10-13.md).

Default policy is a **60-minute cooldown** and **22:00–08:00 America/Chicago** quiet hours. liveabit reads canonical Workboard open tasks before considering a gentle useful reminder based on priority, real deadline and next step. No pending task or insufficient context means silence. Ordinary webhook replies stay local; nudges use OpenClaw's native messaging capability and the private verified own-chat target. Duplicate/expired/synthetic activity does not justify a behavioral message. These remain best-effort agent instructions, separate from Android Receiver is down notifications. Real task-grounded coaching from this revision is not yet user-confirmed.

The delivery helper now selects the receiving agent explicitly and defaults to liveabit. It updates that agent's private policy in its workspace; `-AgentId main` remains available for the earlier main-agent setup. Keep policy/state private. No project relay or forwarding service is involved.

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

## Selected-agent policy and optional own-chat check

The [delivery helper](../../scripts/configure-openclaw-whatsapp.ps1) verifies the linked account's own identity and writes a private liveabit Skill policy in the selected agent's workspace. It fixes the target to that identity, retains existing allowlist entries and disabled incoming chats, and preserves the user's model/settings. Configure dedicated liveabit from the project root:

```powershell
.\scripts\configure-openclaw-whatsapp.ps1 -AgentId liveabit
```

Defaults are a **60-minute cooldown** and **22:00–08:00 quiet hours** in **America/Chicago**. Change them with `-CooldownMinutes`, `-QuietStartHour`, `-QuietEndHour` and `-TimeZone`; equal start/end hours disable the quiet period. Keep the policy and its delivery-state file private in the agent workspace.

For an explicit connection check to that same own chat:

```powershell
.\scripts\configure-openclaw-whatsapp.ps1 -AgentId liveabit -SendTest
```

This sends one fixed test message with explicit selected-agent ownership. It does not invoke a model or change its selection. Omit `-SendTest` to update policy without sending a message. A provider message ID means the provider acknowledged the send; confirm phone receipt separately. The helper does not automatically retry an uncertain send. Use `-AgentId main` only when intentionally managing main's separate policy.

A separate historical [actual main-agent check](../../artifacts/openclaw/agent-whatsapp-check-result.json) completed on Sol 6.1. The agent read its private delivery policy and used the native message capability to send one authorized own-chat check; metadata reported source reply delivery, with a silent terminal reply. The user confirmed phone receipt and notification for those checks. This evidence does not prove a task-grounded nudge from dedicated liveabit; that remains an optional trial.

Current [liveabit hooks](openclaw-direct.md) keep `deliver: false`, so ordinary hook responses stay local. The receiving dedicated agent uses the copied private policy and shared Workboard tasks for selective nudges, as described above. Quiet hours, cooldown and duplicate suppression are **best-effort agent instructions**, not guaranteed transport enforcement. The Android **Receiver is down** notification remains independent.

This workflow follows the installed release's [WhatsApp channel documentation](https://github.com/openclaw/openclaw/blob/v2026.9.9/docs/channels/whatsapp.md). Personal tasks and private context stay in OpenClaw.

## Next steps

Development can continue independently without relinking WhatsApp or another phone test. Earlier check notifications are user-confirmed; a useful task-grounded nudge from liveabit remains a separate optional trial.
