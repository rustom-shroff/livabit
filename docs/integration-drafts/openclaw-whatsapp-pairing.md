# Pair the existing phone with OpenClaw

Updated: **2026-10-11**. The user selected WhatsApp for phone communication. The official OpenClaw **2026.9.9** WhatsApp plugin is installed. Configuration, managed restart and corrected native login/status calls were exercised; a private QR was generated with status `awaiting_phone_scan`. Phone pairing and outbound testing remain pending; no activity nudge has been delivered.

The [preparation helper](../../scripts/prepare-openclaw-whatsapp.ps1) uses the installed Windows Gateway and its managed login. It prepares the `default` WhatsApp account with incoming direct/group chats and read receipts disabled, preserves unrelated settings and existing phone credentials, and saves a local configuration backup. It does not send a message. This channel belongs to OpenClaw, with no project-operated relay.

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

Linking the account and delivering an activity response are separate checks. Current [liveabit hooks](openclaw-direct.md) use `deliver: false`; automatic WhatsApp responses still need channel routing and a successful outbound test. The Android **Receiver is down** notification remains independent.

This workflow follows the installed release's [WhatsApp channel documentation](https://github.com/openclaw/openclaw/blob/v2026.9.9/docs/channels/whatsapp.md). Main-agent goals and private context stay in OpenClaw.

## Next steps

Phone-side QR scanning requires the account owner's action. Other local development can continue independently; after pairing, verify the connection and test the selected phone channel before claiming delivered nudges.
