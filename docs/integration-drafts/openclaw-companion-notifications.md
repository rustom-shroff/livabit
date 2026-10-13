# Gentle reminders in the OpenClaw Android companion

Updated: **2026-10-13**. Current reminder route under [ADR-0023](../decisions/0023-openclaw-companion-reminders.md). The official app is [OpenClaw on Google Play](https://play.google.com/store/apps/details?id=ai.openclaw.app&hl=en_US), package `ai.openclaw.app`.

liveabit sends meaningful activity to the installed OpenClaw gateway. The dedicated liveabit agent reads your open personal tasks and can ask the companion to show a gentle local notification. The existing **0.11.0 sender** and its saved activity connection remain unchanged; no new APK or setup-file import is needed for this reminder change.

## Connect the phone

Open the OpenClaw companion, connect it to your existing gateway and allow Android notifications for OpenClaw. The phone must appear as a paired, connected Android node that declares `system.notify` and reports `permissions.notifications: true`. The [official Android guide](https://docs.openclaw.ai/platforms/android) covers pairing and gateway connectivity. The current installed gateway is 2026.9.9 and connected Android app reports 2026.9.80; use their actual supported behavior when newer online instructions differ.

For an initial migration, run these two steps from the project root in order:

```powershell
.\scripts\configure-openclaw-companion.ps1
.\scripts\configure-openclaw.ps1 -AgentId liveabit
```

The helper selects the single eligible connected Android phone. If several qualify, inspect `openclaw nodes status` locally and rerun with `-NodeId <intended-node-id>`. Node identity comes from the gateway, never from activity or task text. No notification is sent during ordinary setup.

The companion helper keeps existing notification timing and delivery state and disables this project's old WhatsApp reminder policies. The second step installs the updated agent instructions and tool access and restarts the managed gateway; it preserves the current gateway binding, global WhatsApp account and both agents' models. Task setup no longer copies WhatsApp settings into liveabit. Destination/state files stay private in the liveabit Skill's host workspace; the helper saves private configuration evidence under `artifacts/openclaw/companion-delivery/`. Once this migration is applied, preference updates need only the companion helper and do not restart the gateway.

For one explicit connection check:

```powershell
.\scripts\configure-openclaw-companion.ps1 -SendTest
```

This requests a single passive **liveabit connection check** notification. The [native nodes reference](https://docs.openclaw.ai/cli/nodes) documents local notification delivery through `system.notify`. A successful invocation means the phone acknowledged the command; it does not establish that Android displayed it or that you read it. The check neither creates a task nor represents behavioral coaching, and failures are not automatically retried.

## Timing preferences

Defaults remain a **60-minute cooldown** and **22:00–08:00 America/Chicago** quiet hours. Existing preferences are retained unless you explicitly change them:

```powershell
.\scripts\configure-openclaw-companion.ps1 -CooldownMinutes 60 -QuietStartHour 22 -QuietEndHour 8 -TimeZone America/Chicago
```

Cooldown accepts 1–1440 minutes. Quiet endpoints accept hours 0–23; equal endpoints disable quiet hours. The policy retains its existing enabled state, so reconfiguration does not silently enable a previously disabled reminder policy. Quiet hours, cooldown and duplicate suppression remain best-effort agent instructions.

## Use your current tasks

Use main's existing conversation in the companion to manage actual personal tasks. Include priority, a real deadline where relevant and a concrete next step. Main stores them in OpenClaw Workboard; liveabit reads the shared open cards without making a second task list. Task details stay in OpenClaw. Unknown deadlines stay unknown, and execution scheduling is not treated as a completion deadline.

Meaningful activity can justify one gentle suggestion connected to real pending work. No useful task context means silence. Empty, expired, duplicate and synthetic observations never justify a behavioral reminder. Ordinary hook replies remain local, and a successful OAP admission alone does not trigger a notification. liveabit's instructions authorize only destination checks and passive `system.notify` notifications; other nodes capabilities are outside this Skill's authority, though the broad tool itself is not independently action-restricted by setup.

Keep the computer's gateway running and the companion connected on a network that can reach it. Offline notification recovery is not verified for this installed route. Android notification permission, notification settings and background restrictions can affect visible delivery. There is no WhatsApp fallback, new delivery queue or project-hosted relay. The liveabit sender's **Receiver is down** warning remains a separate Android notification.

## Native regression checks

Before changing these host helpers, run the permanent fixture suite on both supported PowerShell targets:

```powershell
powershell.exe -NoProfile -File .\scripts\test-openclaw-companion.ps1
pwsh -NoProfile -File .\scripts\test-openclaw-companion.ps1
```

The suite executes the actual embedded helper scripts against isolated synthetic files and a native CLI double. It contacts no gateway and sends no real notification. Keep migration/default-timezone/state preservation, strict acknowledgement, saved-phone selection and legacy-route guards in this gate. Actual phone invocation and user confirmation remain separate evidence in the [companion review](../review/openclaw-companion-2026-10-13.md).

## Next steps

Development can continue independently; no approval or required phone test blocks it. After the initial migration is applied, there is no need to rerun it. Keep the companion connected, manage real tasks in main's conversation and use the tested sender as before. Observing the optional connection check and whether a real task reminder is useful adds phone evidence; it does not gate local development. Keep credentials, task details and raw activity private.
