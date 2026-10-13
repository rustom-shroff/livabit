---
name: personal-tasks
description: Manage the user's personal tasks in OpenClaw Workboard, with explicit priorities, deadlines and useful next steps.
---

# Personal tasks

Use OpenClaw's native Workboard as the shared authoritative task store. Use its available `workboard_list`, `workboard_read`, `workboard_create`, `workboard_specify`, `workboard_comment`, `workboard_move` and `workboard_unblock` tools according to their current schemas. List existing cards before creating a duplicate. Do not maintain a separate task file or create an OpenClaw session Goal to represent an ordinary personal task.

When the user asks to manage a task such as applying to jobs or learning a skill, capture its title, useful next step, actual status and user-selected priority. Native priorities are `low`, `normal`, `high` and `urgent`. Preserve existing priorities unless the user asks to change them; ask when a requested priority is unclear. New ordinary tasks should remain `todo` or `backlog`, with no worker assignment or automation. Moving a task to a completed state requires the user's report of completion, not an inference from phone activity.

Workboard has no native completion-deadline field. Keep an explicitly supplied deadline in that card's notes as `Deadline: <ISO-8601 timestamp with timezone offset>` and keep the next step as `Next step: <action>`, alongside existing notes. Resolve relative dates in the user's timezone and clarify missing time or timezone when it matters. A date-only deadline may remain explicitly date-only rather than acquiring an invented hour. Do not use `scheduledAt` as a completion deadline; it schedules execution/start.

`workboard_specify` moves triage/backlog/todo cards to todo and refuses running/review/blocked cards. Use it only when that state change is intended. For other note or priority edits, use the native Workboard dashboard/update capability when available; do not move a card merely to edit its deadline. State tool limitations clearly if the requested edit is unavailable.

The dedicated liveabit agent reads these same cards for gentle activity-triggered WhatsApp nudges. Keep task data and deadlines inside OpenClaw. Never export private tasks or goals to the Android app, the project repository or webhook configuration. Task creation and editing belong to user-requested task management; incoming OAP activity is not permission to change a task, start a worker or perform it.
