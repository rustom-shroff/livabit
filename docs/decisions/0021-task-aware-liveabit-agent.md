# ADR-0021: meaningful activity and a task-aware liveabit agent

Date: **2026-10-13**. Status: **Accepted for POC development by the user's instruction**. Extends ADR-0015/0017/0019/0020 and supersedes ADR-0018's current main-agent destination. Earlier main-agent evidence remains historical evidence.

## Context

The user wants OpenClaw to manage ordinary personal tasks, such as job applications and upskilling. Activity should inform gentle reminders about open work, its priority and its real deadline. Empty activity requests waste model tokens. Setup should expose only the three requested connection choices and report connection failures immediately.

## Decision

Implement directly in Android. Setup exposes **Import receiver file**, **Connect to OpenClaw** and **Edit connection manually**, followed by the existing app selection and sharing controls. Manual address/key/agent fields and connection guides sit inside the manual editor. Activity keeps daily sharing controls and status without a Change apps or connection shortcut.

Connect to OpenClaw performs an authenticated, bounded POST of an empty JSON object to the configured hook. The known handler's exact HTTP 400 missing-message response confirms reachable address, accepted key and supported path without starting an agent run. Authentication, route, network and unexpected-response failures remain visible in Setup, with an error dialog. The check neither starts sharing nor changes saved activity/outage state. It is a connection check, not proof of agent execution or interpretation.

For OpenClaw, both automatic and manual sends require at least one selected app with a positive numeric foreground-duration estimate. Null/zero durations and transition counts alone do not qualify. Empty scans advance local collection context/cursor without creating a packet or outage. Known empty queued OpenClaw packets are removed; meaningful queued request bytes and identities remain unchanged. Explicit manual empty diagnostics may still reach the independent display receiver, which invokes no model.

Native `/hooks/liveabit` fixes agent **liveabit** and persistent session **agent:liveabit:main**. A versioned OpenClaw-native transform drops known empty, expired or invalid observation wrappers with HTTP 204 before model dispatch. This protects older senders without creating a relay. HTTP 204 is a drop, not an Android run-admission acknowledgement; current Android skips empty requests locally. Meaningful requests retain their original OAP message.

Enable the installed **Workboard** plugin as the canonical shared task store. Main manages user-requested tasks through its personal-tasks Skill. liveabit lists current open, non-archived tasks and reads relevant cards, including main-owned tasks, before considering a nudge. Its role is interpretation and selective communication, with no task mutation authorized by activity. This is not OpenClaw's internal Goal primitive and creates no shadow task store or worker automation.

Use actual task status, priority, dependencies and explicitly supplied deadline/next step. Workboard has no completion-deadline field: retain `Deadline: ...` in canonical card notes and do not treat execution `scheduledAt` as a deadline. Unknown deadlines remain unknown. No pending task or no useful actionable connection to the observation means silence.

The user explicitly selected **openai/gpt-6.1-sol** with **medium** thinking for liveabit. Model changes use the model helper's explicit `-AgentId liveabit`; activity/task/channel setup preserves both agents' model choices. Copy the existing verified WhatsApp self-chat policy into the dedicated workspace, changing its receiving-agent identity while preserving its destination, cooldown, quiet hours and state. Ordinary webhook replies stay local. Selective nudges use that private policy; its default 60-minute cooldown and 22:00–08:00 America/Chicago quiet hours remain best-effort agent instructions.

## Verification and limits

The exact **0.9.0-poc**, version code **11**, APK passed **80 native Android emulator checks**, including local meaningful-send gates, actual connection checks/UI and installed OpenClaw admission. The [dated review](../review/openclaw-task-aware-2026-10-13.md) records final host/task evidence separately. Existing user-confirmed phone admission and WhatsApp check notifications retain their original scope; they do not prove task-grounded coaching from this revision.

Unknown source coverage, unverified duration estimates, duplicate delivery risk, Android background delay and deferred battery/physical precision remain. No OAP schema revision, project-hosted infrastructure or Linux work is introduced. TASK-P5-001/002 and TASK-P6-F04/F05 continue; formal M2/M3 and AC-22/23/24/29 need their own complete evidence.
