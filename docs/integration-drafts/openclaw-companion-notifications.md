# Notifications and conversation in the OpenClaw Android companion

**Current direction, 2026-10-15:** the user's main personal agent provides ongoing support under [ADR-0024](../decisions/0024-personal-agent-behavior-change.md) and [ADR-0025](../decisions/0025-durable-activity-analysis.md). The [current system guide](../current-system.md) and [runtime setup](../../integrations/openclaw/personal-agent/README.md) govern current installation. The October 13 dedicated-agent commands below are preserved history and must not overwrite a newer personal-agent configuration.

The **OpenClaw companion app** (`ai.openclaw.app`) displays intervention notifications and provides the existing chat. The **Livabit sender app** observes permitted activity and sends it to the gateway. They have independent background paths: successful activity receipt does not prove that the companion is connected or able to show a notification.

## Current background-delivery design

The new host-side implementation stores a notification intent before checking phone inventory. An exact saved Android phone that is still paired, declares `system.notify` and reports notification permission can wait briefly if disconnected. Missing identity, ambiguity, lost pairing, missing permission or changed policy cannot authorize a delayed send. The model supplies a stored decision ID, never an alternate destination or replacement message.

Pending intents have a useful lifetime no longer than 15 minutes from decision creation, supporting observation end or original event expiry, whichever comes first. Connectivity checks back off from 30 seconds to at most four minutes, with at most eight checks. Only pre-invocation unavailability can be retried. A durable reservation before native invocation prevents blind replay after an uncertain acknowledgement or crash. A newer queued prompt supersedes an older unreserved queued/checking prompt for the same owner; quiet hours, cooldown and current permissions are rechecked before dispatch. Implementation and local test evidence are separate from native installation and physical background behavior.

This queue cannot wake a stopped or unreachable app, repair an Android foreground service or keep the gateway computer awake. A phone being on and the app being installed do not establish a connected node. When the computer is stopped, host work waits; if a suggestion expires, it must not be replayed as a stale nudge on return. Automatic accountability email and alternate-channel fallback remain disabled.

The read-only diagnostic below reports app version, stopped state, notification permission, foreground-service state and battery exemption when a permitted ADB-connected phone is available. It changes no settings and returns a safe unavailable result when no device is connected. It cannot prove physical display or long-term background reliability.

```powershell
node scripts/inspect-companion-background.mjs
```

Verify a real companion notification while the UI is closed/backgrounded, screen off and ordinary battery settings are in effect; repeat across network loss/return and gateway restart. Record the exact device/OS/app version and distinguish native acknowledgement from visible display and user reply. No connected device or physical pass should be invented from a fixture. See the [conversation/physical evaluation plan](../evaluation/personal-agent-conversation.md#physical-and-integration-checks-still-separate).

## Preserved October 13 companion setup

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
