# OpenClaw direct Android integration

**Current direction, 2026-10-15:** the [personal-agent runtime](../../integrations/openclaw/personal-agent/README.md), [current system guide](../current-system.md) and [ADR-0025](../decisions/0025-durable-activity-analysis.md) govern the new same-main-agent activity-session pipeline. The mappings, setup commands and acknowledgement below describe the preserved October 13 sender/dedicated-agent baseline. Do not apply that historical configuration over a newer personal-agent setup. An acknowledgement-contract change requires matching endpoint/sender compatibility evidence, not relabeling an old `runId` as completed analysis.

## Preserved October 13 direct integration

Updated: **2026-10-13**. Current sender: [liveabit Sender 0.11.0](../../artifacts/android-publisher/liveabit-sender-0.11.0-poc.apk), with retained OpenClaw file migration, safe useful import errors and exactly three connection actions even while editing manually. [Setup regression review](../review/android-setup-regressions-2026-10-13.md). Remembered sharing and startup restoration under [ADR-0022](../decisions/0022-android-sharing-restart.md) remain; the [0.10.0 startup review](../review/android-reboot-resume-2026-10-13.md) preserves its exact 87-check evidence. [ADR-0021](../decisions/0021-task-aware-liveabit-agent.md) retains the dedicated task-aware route; its [0.9.0 review](../review/openclaw-task-aware-2026-10-13.md) preserves 80 native checks. Task coaching remains distinct from HTTP admission and earlier user-confirmed WhatsApp notifications.

Activity travels directly from Android to the user's installed OpenClaw **liveabit** agent. OpenClaw owns personal tasks, interpretation and phone communication. Main manages the tasks; liveabit uses the shared Workboard task store when activity arrives. The independent display receiver remains available for local inspection and does not forward requests.

**Current reminder route:** [ADR-0023](../decisions/0023-openclaw-companion-reminders.md) replaces liveabit's WhatsApp nudges with local notifications in the official OpenClaw Android companion. [Companion setup](openclaw-companion-notifications.md) uses the paired phone's declared `system.notify` capability through the existing gateway. The sender APK and OAP mapping are unchanged. Earlier WhatsApp evidence below is historical.

## Native webhook mapping

The installed target is OpenClaw **2026.9.9**, commit **bcfc888**, Windows package **2026.9.900.0**. Use the installed release's behavior when newer online documentation differs.

| Android delivery | OpenClaw mapping |
| --- | --- |
| Destination | Exact `/hooks/liveabit`; legacy `/hooks/agent` remains a configurable isolated-run route |
| Authentication | Dedicated hook bearer token, separate from gateway administration authentication |
| Agent | Mapped path requires saved `agent_id: liveabit`; server fixes liveabit |
| Conversation | Persistent `agent:liveabit:main`; caller session selection is disabled |
| Run behavior | `name: liveabit`, immediate wake, `deliver: false` |
| Message | Fixed data introduction and original canonical OAP observation draft 2; meaningful older queued bodies remain unchanged |
| Retry identity | Original `event_id` as `Idempotency-Key` |
| Android acknowledgement | HTTP 200, literal `ok: true`, nonempty `runId`; admission only |

Both automatic and manual OpenClaw sends require positive estimated foreground duration for at least one selected app. No apps, null/zero duration and transition counts alone produce no new OpenClaw packet. Empty scans retain local continuity and advance the cursor without starting an outage. Known empty queued packets are removed; meaningful pending bytes/identities remain immutable. Default active interval is five minutes, with automatic network requests paused after fifteen minutes screen-off; both are configurable.

The OpenClaw-native hook transform also drops known empty, expired or invalid observation wrappers before agent dispatch, returning HTTP 204. This prevents model use by older senders. A 204 drop is not a successful Android admission response; upgrade Android to avoid sending empty packets in the first place. The empty-object connection check deliberately remains a missing-message HTTP 400 response and invokes no model.

Unknown coverage and nullable, unverified estimates remain explicit. HTTP admission does not prove completed interpretation, valid OAP consumption or a phone notification. Missing responses can cause retries after admission; OpenClaw's observed in-memory idempotency cache lasts five minutes and does not survive restart. Exactly-once delivery is not promised.

## Local setup

From the repository root:

```powershell
.\scripts\configure-openclaw.ps1 -AgentId liveabit -Lan
```

The default agent is now liveabit; the helper configures its dedicated workspace, liveabit Skill, bounded hook mapping and Workboard access. Main receives the personal-tasks Skill and Workboard management access. Unrelated settings, main's authored instructions and both agents' model/thinking choices are preserved. Existing dedicated instructions are retained around the managed liveabit section. Setup no longer copies main's WhatsApp reminder policy. Configure the phone notification destination separately with the companion helper; rerunning task setup retains that destination and delivery state.

Without `-Lan`, setup preserves the existing gateway binding and generates USB/emulator files. With `-Lan`, it also generates Wi-Fi files using the computer's actual address and port. This option makes no router or firewall change. The previously approved scoped Wi-Fi firewall fix and user-confirmed phone admission are recorded [separately](../review/openclaw-phone-delivery-2026-10-12.md).

| Private connection file | Use |
| --- | --- |
| `artifacts/openclaw/android-wifi-setup.json` | Same reachable Wi-Fi/local network |
| `artifacts/openclaw/android-usb-setup.json` | Phone with USB port reversal |
| `artifacts/openclaw/android-emulator-setup.json` | Owned emulator |

Install 0.11.0 over the existing app. An already-correct liveabit setup needs no reimport: sharing state, connection, apps and timing remain. For a new connection, import a phone setup from the table above. An older exported `/hooks/liveabit` file selecting main is also accepted; the app visibly migrates its draft agent to liveabit while retaining its address and key. Generic `/hooks/agent` files keep their configured agent, including main. Connection files contain the hook credential: keep them local and outside Git, issue reports and chat.

Setup offers exactly **Import receiver file**, **Connect to OpenClaw** and **Edit connection manually**, including when the editor is expanded and the keyboard is open. Manual editing reveals address, key and agent fields only. Import reads independently of ongoing sends and fills draft fields without starting sharing or changing saved settings or pending bytes. Errors remain visible in Setup and a **Could not import connection** dialog without exposing file contents; the computer's `connection.json` is explicitly rejected with instructions to use `android-wifi-setup.json` or `android-usb-setup.json` instead. Connect to OpenClaw immediately checks the draft address/key/path using authenticated `{}` and accepts only the exact known missing-message HTTP 400 response. Failures appear in Setup and an error dialog. This verifies the connection without activity or model use; it does not prove agent/model execution. With no configured OpenClaw draft, the dialog offers Import receiver file, Edit connection manually and Close. The agent defaults to liveabit; mapped `/hooks/liveabit` requires it, while legacy `/hooks/agent` accepts a configured allowed agent.

Choose Apps to share, enable usage access and receiver warnings, then explicitly Start sharing once. Sharing stays enabled after closing the app and resumes automatically after phone startup and first unlock; a stopped sender stays stopped. Installing an update also restores enabled scheduling. Startup only schedules local work: normal activity, screen-off and expiry rules still determine sending. Android Force stop prevents background work until reopening. Connection checks/imports do not start sharing or clear saved activity. Changing the effective destination, agent, key or apps requires Start and confirmation before discarding unexpired pending activity. Activity has Start/Send now/Stop/status; Settings holds timing and warnings.

For USB, enable debugging and authorize the computer, then reverse the generated port before importing its USB file:

```powershell
$OpenClawPort = (Get-Content .\artifacts\openclaw\connection.json -Raw | ConvertFrom-Json).port
.\artifacts\android-sdk\platform-tools\adb.exe -d reverse "tcp:$OpenClawPort" "tcp:$OpenClawPort"
```

Repeat reversal after reconnecting; remove it with `adb reverse --remove tcp:<port>` when finished. Wi-Fi remains direct: no relay, tunnel or public inbound port is required.

## Personal tasks and selective companion reminders

Use the existing main OpenClaw conversation to add or update actual personal tasks, including priority, deadline and a concrete next step when known. The installed personal-tasks Skill stores them in the shared native Workboard. Task records stay in OpenClaw; Android neither reads nor exports them. This is ordinary task management, independent of OpenClaw's internal Goal primitive.

For each fresh, meaningful observation, liveabit lists all open, non-archived tasks across agents and reads relevant cards. It considers actual priority, explicit deadline, task status, dependencies and next step. Completed/archived tasks do not justify nudges; blocked work must respect its blocker. No completion-deadline field exists in this Workboard release: explicit `Deadline: ...` and `Next step: ...` values belong in canonical card notes. Execution `scheduledAt` is not a completion deadline. Unknown deadlines remain unknown. Activity never authorizes creating, completing or modifying a task.

Main's task-management Skill respects native edit limits: `workboard_specify` promotes triage/backlog/todo cards to todo and refuses running/review/blocked cards. It uses the dashboard/native update capability for other edits rather than moving a task merely to change its notes or priority.

The dedicated agent uses the user-selected **Sol 6.1 with medium thinking**; [model changes](openclaw-model-settings.md) remain under user control. A gentle companion notification is appropriate only when a real pending task and the observation support a useful, actionable suggestion. No open task or insufficient context means silence. Synthetic checks, duplicates and expired observations do not justify a behavioral message.

For initial migration, run `.\scripts\configure-openclaw-companion.ps1`, then `.\scripts\configure-openclaw.ps1 -AgentId liveabit` as described in the [companion guide](openclaw-companion-notifications.md). The first binds a paired, connected Android phone that advertises `system.notify` and has notification permission, retains timing/delivery state and disables owned legacy WhatsApp reminder policies. The second applies updated agent instructions/tool access and restarts the managed gateway while preserving its binding and models. Later preference updates need only the companion helper. Defaults are a **60-minute cooldown** and **22:00–08:00 America/Chicago** quiet hours. Without `-SendTest`, setup sends no notification. An explicit `-SendTest` requests one passive connection check and is not a behavioral reminder or proof of physical display.

Ordinary webhook replies stay local (`deliver: false`); selective reminders use native `nodes` notification actions for the configured phone. The agent's instructions restrict those actions to status/describe and `system.notify`, but the broader nodes tool is not independently action-restricted by this setup. Cooldown, quiet hours and duplicate suppression are best-effort agent policy. The phone must maintain its gateway connection; this installed route has no verified offline notification queue. The Android Receiver is down warning is independent. Earlier WhatsApp notifications remain historical evidence; companion command acknowledgement and real task-grounded coaching need their own evidence.

## Wi-Fi troubleshooting

First compare the exported address/port with the computer's current network. Open `http://<host>:<port>/` from the phone. A page or HTTP error proves reachability; timeout means a network, firewall or routing issue. The computer's `/healthz` endpoint checks gateway liveness without invoking a model. Connect to OpenClaw then checks authentication and the exact hook path. See [OpenClaw health checks](https://docs.openclaw.ai/gateway/health).

If the computer responds but the phone times out, check shared Wi-Fi, guest isolation/VPN and Windows Firewall access for the actual bundled OpenClaw program. Any new firewall exception requires explicit approval and should be limited to the executable, actual TCP port, subnet and interface. Keep the firewall enabled; no router port forwarding is needed. [Microsoft firewall reference](https://learn.microsoft.com/en-us/powershell/module/netsecurity/new-netfirewallrule).

## Historical evidence

The following sections preserve the earlier main/dedicated baselines and their limited claims. Current routing/setup is described above.

## Existing-agent context and 0.5.0 baseline

Goals, memories, instructions and conversations stay in OpenClaw. The app/helper do not read or copy them into liveabit. Native mapping creates or reuses the configured canonical main conversation. Its record was absent before setup; the verified first hook created it and completed a main-agent response. Main's configuration entry matched its backup, and AGENTS remained unchanged. This demonstrates use of the existing agent/workspace, not imported earlier chats or proved use of private goals. Activity cannot select a conversation or widen authority.

**0.5.0-poc** adds saved agent routing, selected-agent status and endpoint/port-aware Wi-Fi/USB instructions. Its exact installed APK passed [37 native Android 15/API 35 checks](../../artifacts/android-publisher/run-472c26e5-8a30-4a4d-a025-fa48d09e2228/validation.json), including actual main admission (`bcd8d0a4-801a-4500-b3d8-98ce2c4c3095`). Separate completed main output for the synthetic event preserved unknown coverage and estimate uncertainty. Additional native host-LAN admission passed. The [main-agent review](../review/openclaw-main-agent-2026-10-11.md) records safe results separately from private host content.

A second native LAN event verified [same-conversation continuity](../../artifacts/openclaw/main-continuity.json): both synthetic events and their completed responses are present in canonical `agent:main:main`, with unchanged session identity. This establishes reuse for those two sends. It does not establish access to earlier chats or private goals; no personal history was exported.

The final build took 1 minute 32 seconds; lint reported zero errors and ten warnings. APK SHA-256: `fa0214538c6708742951ead442dfe408099ea7fb495c2634ee78e504a71f6c1e`. The exact-byte emulator gate is satisfied for an optional phone trial. Physical-phone delivery, prior-chat context, battery/background timing and formal M2/M3 remain separate claims. Development can continue independently.

## Earlier model and WhatsApp validation (historical)

The user controls [main's model and thinking level](openclaw-model-settings.md). The requested `openai/gpt-6.1-sol` model completed a separate trusted operator agent run with matching requested/effective/response model and unchanged canonical conversation. Medium thinking is verified in inherited configuration without session/hook overrides; run telemetry did not directly report effort. Activity and delivery helpers preserve the model. The WhatsApp results below are historical; current reminders use the companion route above. Earlier operator-like probes submitted through the untrusted activity hook were not completed model proofs and are excluded from this result.

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
