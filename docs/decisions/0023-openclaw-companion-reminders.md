# ADR-0023: gentle reminders through the OpenClaw Android companion

Date: **2026-10-13**. Status: **Accepted for POC development by the user's instruction**. Supersedes ADR-0021's WhatsApp reminder route while retaining its dedicated liveabit agent, shared Workboard tasks and meaningful-activity rules. Earlier WhatsApp evidence stays historical.

## Context

The user installed the official OpenClaw Android companion, package `ai.openclaw.app`, and wants gentle reminders on the phone through that app. Activity already reaches the installed OpenClaw gateway directly. A separate messaging account should no longer be the reminder destination.

## Decision

Keep Android sender **0.11.0-poc**, the existing OAP observation contract and direct `/hooks/liveabit` route. The gateway still fixes agent **liveabit**, persistent session **agent:liveabit:main** and `deliver: false`. A packet admission or ordinary agent reply must not automatically become a phone notification.

Use the companion's declared **`system.notify`** capability through OpenClaw's native **nodes** tool. The installed gateway is **2026.9.9**; its connected Android companion reports **2026.9.80**, the notification command and notification permission. Select the exact paired Android node from trusted gateway status, rather than from activity or task text. Installed behavior governs compatibility when newer documentation differs. The [official nodes reference](https://docs.openclaw.ai/cli/nodes) describes local notifications on nodes declaring this command; the [Android guide](https://docs.openclaw.ai/platforms/android) describes companion pairing and gateway connectivity.

Store private destination/preferences in `liveabit.openclaw.companion-delivery.v1`: `enabled`, `agent_id: liveabit`, `channel: companion`, `identity_source: openclaw.nodes.status`, `node_id`, `command: system.notify`, `cooldown_minutes`, `quiet_start_hour`, `quiet_end_hour` and `time_zone`. Preserve existing cooldown, quiet preferences and delivery state, including its bounded 128 processed-event IDs. Defaults remain 60 minutes and 22:00–08:00 America/Chicago; equal quiet-hour endpoints disable quiet hours.

Initial migration first runs the companion helper to save policy/disable owned legacy WhatsApp reminder policies, then task setup to install updated instructions/tool access and restart the managed gateway. Later notification preference updates use the companion helper alone. Task setup no longer copies main's WhatsApp policy. Preserve the user's global WhatsApp account, gateway binding, unrelated instructions, both agents' model/thinking settings and existing task records. The user controls models; this change does not select a replacement model.

liveabit still reads current open Workboard tasks, priority, actual deadlines and concrete next steps before considering one gentle actionable reminder. Empty, expired, duplicate or synthetic activity and missing task context mean silence. Activity grants no task mutation or device-control authority. Use nodes status/describe only to verify the configured phone and notify only via `system.notify`, with passive priority and system delivery. Replacing `message` with the broad `nodes` tool removes that liveabit messaging capability, but the permitted nodes actions are agent instructions rather than an independent action-level enforcement boundary.

An explicit helper `-SendTest` invokes one connection-check notification directly. It is independent of coaching policy and is never a synthetic behavioral fixture. Normal setup sends no notification. A failed or uncertain reminder is not automatically retried or forwarded to WhatsApp.

## Verification and limits

The [companion review](../review/openclaw-companion-2026-10-13.md) records actual installed capability, configuration, invocation and model-preservation evidence. A native acknowledgement establishes command handling, not physical notification display or reading. Physical receipt and useful task-grounded coaching need separate observation. Older WhatsApp confirmations cannot establish this new route.

The phone must remain connected to a reachable running gateway. Native Android offline notification recovery is unverified; no new queue, hosted relay, intermediary, gateway upgrade or Linux work is introduced. Cooldown, quiet hours and processed-event handling remain best-effort agent policies. TASK-P5-001/002 and TASK-P6-F04 continue without new requirement/acceptance IDs or completed M2/M3 claims.
