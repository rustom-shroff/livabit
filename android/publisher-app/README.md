# Livabit Sender: Android activity for your personal agent

Current source: **2026-10-15**, candidate **0.12.0-poc**, version code **14**. The new sender supports durable OpenClaw receipts while retaining legacy hooks and the independent test receiver. Build, emulator, native-host and physical-phone results remain distinct in the [processing review](../../docs/review/personal-agent-processing-2026-10-15.md). A successful build does not mean the candidate is installed on the personal phone.

Read the [current-system guide](../../docs/current-system.md) for the product direction and [ADR-0025](../../docs/decisions/0025-durable-activity-analysis.md). Older reviews retain their own evidence. Old dedicated-agent/WhatsApp setup recipes can overwrite the current routing and should not be rerun for this installation.

## What runs on the phone

Livabit reads selected applications through Android Usage Access and estimates bounded foreground-activity windows. Coverage remains unknown and durations may be null. It does not read screen content, infer feelings or run a model. Only positive selected-app duration creates a new packet; zero/null duration or transitions alone do not.

App-private `sender.json`, written with `AtomicFile`, stores settings, protected connection material, collection continuity and up to 64 pending immutable packets. This is a retry buffer. Longer activity and intervention history lives in the OpenClaw plugin's local SQLite database on the computer.

The **OpenClaw companion is a different phone app**: it displays intervention notifications and provides the existing personal-agent chat. Livabit's own receiver-outage warning is independent of those nudges.

## Connect to the durable activity endpoint

1. Install the tested host bundle with `./scripts/configure-openclaw-personal-agent.ps1 -RestartGateway`. It preserves the personal agent's model, shared Workboard and private companion preferences, and uses a separate persistent activity conversation belonging to the same agent. Automatic accountability emails stay disabled.
2. Install the **0.12.0-poc** sender over the existing sender. Saved sharing state, connection and pending bytes are retained; the old destination is not silently changed.
3. Export a **separate** phone setup from an existing Android connection file:

   ```powershell
   node scripts/export-openclaw-activity-connection.mjs --source artifacts/openclaw/android-wifi-setup.json --output artifacts/openclaw/android-activity-wifi-setup.json
   ```

   This preserves address, port, transport, key and warning interval, changing the path to `/liveabit/activity`. It never overwrites the source or retargets pending packets. The output contains a private key and belongs outside source control.
4. Transfer the new file to the phone. Choose **Import receiver file** and **Connect to OpenClaw** in Setup. The check sends authenticated `{}` and accepts only the exact missing-message response; it stores no activity and starts no model run.
5. Choose Apps to share, enable usage access and receiver warnings, then press **Start sharing**. Changing a destination follows the existing explicit confirmation before discarding pending packets. Drain old pending activity first when preserving it matters. Retries are never silently redirected.

The host owns the receiving agent/session; a packet wrapper cannot choose another conversation or policy. Main chat can read the shared intervention ledger and record a deliberately linked reply. The agent may retrieve relevant authorized task/goal/calendar context; a separate conversation does not automatically inherit every old chat or account.

For USB, export from `android-usb-setup.json` to a separate receipt setup, authorize the connected phone and reverse the actual generated port with `adb -d reverse`. Wi-Fi requires a reachable computer on the permitted network. The exporter makes no firewall/router change.

## What an acknowledgement means

| Destination | Successful response | Model execution |
| --- | --- | --- |
| `/liveabit/activity` | Exact event and request-body hash durably received in SQLite | Separately scheduled; no run ID required |
| `/hooks/liveabit` or `/hooks/agent` | OpenClaw admitted a run and returned `runId` | Legacy path; receipt/run separation is not provided |
| Independent `/events` | Receiver acknowledged this exact event/body | No model involved |

The new endpoint requires literal success/durable booleans, the exact receipt format, event ID, request-body SHA-256 and a recognized disposition. A wrong hash/event, missing field or legacy run acknowledgement cannot remove the pending packet. Receipt and run admission do not prove review completion, notification display or reading.

The 0.12 sender supports saved legacy destinations; the old 0.11 sender cannot use the new receipt endpoint. Keep the old connection working until both the new host route and matching sender are ready. Observation identity, canonical bytes and original expiry remain [draft 2](../../specs/protocol/activity-observation-draft-2.md).

## Background operation and warnings

Sharing remains enabled until **Stop sharing**. Enabled scheduling restores after reboot/first unlock, package replacement or reopening; stopped sharing stays stopped. Default sending is every five minutes, but Android may defer jobs. Automatic sends pause after fifteen minutes screen-off. Each bounded wake drains up to four pending packets with their original bytes. This is not a precise timing guarantee.

Android **Force stop** blocks background work until reopening. Uninstall/clear-storage removes setup. The OpenClaw companion has separate service, socket, battery and notification constraints; installation and a powered-on phone do not establish a background connection. The [companion guide](../../docs/integration-drafts/openclaw-companion-notifications.md) distinguishes host health, connection, invocation and display.

The sender distinguishes unreachable receivers, refused keys, unavailable servers and invalid acknowledgements. Meaningful packets remain pending on failure subject to original expiry. Its warning defaults to sixty minutes of missing acknowledgements; a network failure can produce the same warning. Notification permission and the warning channel must be enabled. This warning does not diagnose the model or companion.

## Build and verify

```powershell
./scripts/build-android-publisher.ps1 -Offline
./scripts/start-android-emulator.ps1
./scripts/test-android-publisher.ps1
```

Tests accept only the project-owned `liveabit-api35-test` emulator on `emulator-5580`. They install the exact candidate/test APKs, start an isolated receiver and exercise collection, receipt fixtures, connection checks, actual setup import flows, screen-off behavior and enabled/stopped real reboots. Only synthetic emulator data is cleared; no physical phone is touched. Force-triggered JobScheduler tests do not establish unforced timing or battery behavior.

`-OpenClaw` additionally submits a synthetic observation through the generated **legacy hook** and may start a real model run. It does not verify the durable endpoint. Native receipt checks and physical display/conversation/behavior outcomes need separate evidence. Prior [0.11 setup](../../docs/review/android-setup-regressions-2026-10-13.md), [0.10 reboot](../../docs/review/android-reboot-resume-2026-10-13.md) and [0.9 task-aware](../../docs/review/openclaw-task-aware-2026-10-13.md) reviews remain version-specific.

## Independent display receiver

Run `./scripts/start-activity-receiver.ps1`, open `http://127.0.0.1:8765`, use the private key in `artifacts/activity-receiver/connection.json` and export an Android Wi-Fi setup. Import it into Livabit and explicitly apply with Start sharing. Keep the receiver window open; Ctrl+C stops it. For local-only/USB use `-LocalOnly` and reverse its actual port. This `/events` receiver has separate local history/display and supplies no agent intervention memory. Local-network HTTP is unencrypted.
