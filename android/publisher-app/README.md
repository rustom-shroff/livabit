# liveabit Sender: Android → OpenClaw or test receiver

**Current reminders, 2026-10-13:** Gentle reminders use the official OpenClaw Android companion under [ADR-0023](../../docs/decisions/0023-openclaw-companion-reminders.md). Follow the [companion notification guide](../../docs/integration-drafts/openclaw-companion-notifications.md) to select the paired, connected phone. This is a host-side delivery change; the 0.11.0 sender APK, imported connection and activity route are unchanged.

**Current release, 2026-10-13:** [liveabit Sender 0.11.0 APK](../../artifacts/android-publisher/liveabit-sender-0.11.0-poc.apk), version code 13, fixes retained OpenClaw setup imports and the expanded manual editor. [Setup regression review](../../docs/review/android-setup-regressions-2026-10-13.md). Saved sharing on/off and startup restoration under [ADR-0022](../../docs/decisions/0022-android-sharing-restart.md) remain. The frozen [0.10.0 startup review](../../docs/review/android-reboot-resume-2026-10-13.md) preserves its 87 checks and exact binary identity; the preceding [0.9.0 review](../../docs/review/openclaw-task-aware-2026-10-13.md) preserves its 80 checks.

Setup exposes **Import receiver file**, **Connect to OpenClaw** and **Edit connection manually**, followed by Apps to share and sharing controls. These remain the only three connection actions with the editor expanded, the keyboard open or after recreation. The manual editor contains address, key and agent fields only. Connect performs an immediate authenticated check and shows failures there. Only positive selected-app duration generates a new OpenClaw packet, including Send now. Dedicated liveabit receives meaningful activity and reads shared native Workboard tasks before a selective companion notification. Sol 6.1/medium is the user's dedicated-agent choice. Task-grounded coaching is separate from admission and notification command acknowledgement.
**Historical phone confirmation, 2026-10-11:** The user reported that both WhatsApp connection-check messages arrived with a notification. [Confirmation](../../docs/review/openclaw-phone-notification-2026-10-11.md). This does not establish delivery through the new companion route.

This native Android app sends selected-app usage directly to the user's **OpenClaw** activity agent or to the independent desktop display receiver. The app validates bounded native reads, estimates adjacent windows and keeps sharing controls on Android. No hosted relay or desktop forwarding bridge is involved. The existing local inspector remains a separate app.

**Preserved 0.6.0 baseline, 2026-10-11:** [0.6.0-poc APK](../../artifacts/android-publisher/liveabit-sender-0.6.0-poc.apk) clarifies ordinary local hook replies and selective WhatsApp nudges under separate host policy. Its exact bytes passed [all 37 native Android 15/API 35 checks](../../artifacts/android-publisher/run-51d466ec-676e-45fc-bb77-eacbdb39c987/validation.json), including actual installed-gateway delivery. SHA-256: `eb4a8db0aaba5ed9ed33564a70af318ee7790a569dc235131232620b516deaf9`. The user-owned [Sol 6.1 model choice](../../docs/integration-drafts/openclaw-model-settings.md) completed a separate operator run; medium is verified inherited configuration. WhatsApp is linked/connected, and both the helper's own-chat check and a separate policy-aware main-agent send succeeded. Phone receipt and notification for the checks are user-confirmed. Goal-grounded nudges are ready for a real-activity trial. See the [0.6.0 review](../../docs/review/openclaw-whatsapp-2026-10-11.md), which retains earlier HTTP 5xx failures with cause unconfirmed.

The verified [0.5.0-poc APK](../../artifacts/android-publisher/liveabit-sender-0.5.0-poc.apk) remains the existing-main-agent baseline under [ADR-0018](../../docs/decisions/0018-existing-main-agent-context.md), with explicit saved agent selection and actual-port OpenClaw Wi-Fi/USB guides. Its exact bytes passed 37 native Android 15/API 35 checks, actual main admission and additional host-LAN admission; separate completed main output retained uncertainty. Main configuration and AGENTS were preserved during that setup. SHA-256: `fa0214538c6708742951ead442dfe408099ea7fb495c2634ee78e504a71f6c1e`. See the [main-agent review](../../docs/review/openclaw-main-agent-2026-10-11.md).

The earlier [0.4.0-poc](../../artifacts/android-publisher/liveabit-sender-0.4.0-poc.apk), SHA-256 `43650faaef9f304a2a2f4d7522f43be6a78255df77bfc242c2b70623b5e78273`, remains the dedicated liveabit-agent baseline with its own 31-check [review](../../docs/review/openclaw-poc-2026-10-11.md). The first 0.5.0 main hook created the configured canonical conversation; earlier chats were not imported. Physical-phone admission was subsequently [user-confirmed](../../docs/review/openclaw-phone-delivery-2026-10-12.md); selective task-grounded coaching remains pending. Phone receipt and notification for the earlier connection checks are user-confirmed.

## Connect directly to OpenClaw

Use the current 0.11.0 APK and dedicated setup. Installing over the existing sender retains an already-correct liveabit connection without reimporting it. No display-receiver server is required. [Detailed OpenClaw guide](../../docs/integration-drafts/openclaw-direct.md).

1. From the project root, run `.\scripts\configure-openclaw.ps1 -AgentId liveabit -Lan` for Wi-Fi. The helper configures the dedicated workspace/Skill, shared Workboard access and fixed persistent `agent:liveabit:main` route, preserving both agents' models. It no longer copies WhatsApp reminder settings into liveabit. Without `-Lan`, the gateway binding is unchanged and USB/emulator files are generated. Read its actual address/port; no firewall/router change is made.
2. For a new connection, copy `artifacts/openclaw/android-wifi-setup.json` to the phone and tap **Import receiver file** in Setup. Check **OpenClaw (liveabit)**. This fills the draft without starting sharing or changing the saved connection. An older exported `/hooks/liveabit` file with `agent_id: main` is accepted: the app visibly updates its draft agent to liveabit while keeping its address and key. An already-correct saved liveabit connection needs no reimport.
3. Tap **Connect to OpenClaw**. It tests the draft address/key/path using authenticated `{}` and recognizes only the installed handler's exact missing-message HTTP 400 response. It sends no activity and starts no model run. Success confirms reachability/authentication/path; it does not prove model execution. Errors remain visible in Setup with a dialog. If no OpenClaw draft is configured, the button offers Import receiver file, Edit connection manually and Close. **Edit connection manually** reveals address/key/agent fields.
4. Choose Apps to share, enable usage access and receiver warnings, then **Start sharing**. Use a selected app and **Send now**. A packet requires positive foreground-duration estimate for at least one selected app; null/zero duration or transition counts alone mean nothing is sent. Inspect the receiving liveabit conversation separately from HTTP admission.

The mapped `/hooks/liveabit` path requires liveabit; importing an older main-agent export for this exact path migrates only the draft. A generic `/hooks/agent` export keeps its configured agent, including main. New manual OpenClaw setup defaults to liveabit. Use the hook token, not the dashboard login token. Keys stay private. Changing the effective agent, destination, key or apps requires Start and confirmation before pending activity is discarded; meaningful pending packets are never retargeted. Known empty OpenClaw packets from older versions are pruned.

Import status appears immediately and file reading runs independently of ongoing sends. Invalid files leave the draft and saved sharing unchanged. Errors identify the problem in Setup and a **Could not import connection** dialog without showing file contents or keys. OpenClaw's `connection.json` is a computer configuration; use `android-wifi-setup.json` or `android-usb-setup.json` on Android. A retained phone export remains usable if its address and key are still current.

For USB, enable debugging, connect and authorize the computer, then use the actual generated port before importing `artifacts/openclaw/android-usb-setup.json`:

```powershell
$OpenClawPort = (Get-Content .\artifacts\openclaw\connection.json -Raw | ConvertFrom-Json).port
.\artifacts\android-sdk\platform-tools\adb.exe -d reverse "tcp:$OpenClawPort" "tcp:$OpenClawPort"
```

Repeat after reconnecting; the owned emulator instead imports `android-emulator-setup.json`. Wi-Fi remains a direct local connection. Earlier physical-phone admission is [user-confirmed](../../docs/review/openclaw-phone-delivery-2026-10-12.md), with its APK version unobserved.

Use main's existing OpenClaw conversation to manage actual tasks in Workboard, supplying priority, deadline and next step where known. liveabit reads all open non-archived tasks across agents and respects blocked/dependent work. Explicit completion deadlines belong in canonical card notes; execution `scheduledAt` is not a deadline. This uses ordinary tasks, not OpenClaw's internal Goal primitive. Task data stays in OpenClaw and activity never authorizes task mutations.

For initial companion migration, connect the OpenClaw companion to the same gateway, allow notifications, run `.\scripts\configure-openclaw-companion.ps1` and then `.\scripts\configure-openclaw.ps1 -AgentId liveabit`. The first step selects the eligible paired phone, retains timing/delivery state and disables owned legacy WhatsApp reminder policies. The second applies the updated agent instructions/tool access and restarts the managed gateway, preserving gateway binding and models. Later preference updates need only the companion helper. Defaults are a 60-minute cooldown and 22:00–08:00 America/Chicago quiet hours. Hook replies stay local; only a useful task-grounded suggestion warrants a separate gentle phone notification. No tasks or insufficient context means silence. Timing and duplicate suppression remain best-effort agent instructions. The phone must be connected and able to reach the gateway; offline notification recovery is unverified. Android Receiver is down warnings are independent. [Companion guide](../../docs/integration-drafts/openclaw-companion-notifications.md), [user-owned model settings](../../docs/integration-drafts/openclaw-model-settings.md).

## Start the independent display receiver

For a phone over Wi-Fi, open PowerShell in the project root and run:

```powershell
.\scripts\start-activity-receiver.ps1
```

Open [the local dashboard](http://127.0.0.1:8765/). The local file `artifacts/activity-receiver/connection.json` contains the connection key and addresses. Paste the key into the dashboard to view events. Received events stay locally in `artifacts/activity-receiver/events.json`; the latest 200 are displayed.

Keep that PowerShell window open; **Ctrl+C** stops your receiver. The script enables local-network connections by default. The equivalent direct command is `node tools/activity-receiver/server.mjs --host 0.0.0.0`. Use your own trusted network; the test HTTP connection is unencrypted.

### Connect by Wi-Fi

1. Connect your phone and computer to the same Wi-Fi/local network. Avoid a guest network that isolates devices.
2. Start the receiver with the script above. If Windows prompts about Node.js network access, allow it on your **private** network.
3. Open the dashboard on the computer, paste the `token` from `artifacts/activity-receiver/connection.json`, and click Connect.
4. Under **Connection to this computer**, select **Phone on Wi-Fi · [computer address]**. Choose the address on your phone's network if several are listed. A loopback-only receiver now explains why Wi-Fi is unavailable and how to restart it correctly.
5. Use Download setup file and transfer it to your phone. Wi-Fi setup files also appear as `artifacts/activity-receiver/android-wifi-[address]-setup.json`.
6. In Android, choose Import receiver file. Alternatively enter the Wi-Fi `/events` address from `connection.json`'s `wifi_events_urls` and its `token` under Edit connection manually. Choose apps, enable usage access, and tap **Start sharing** to apply the Wi-Fi connection.

Importing the chosen setup fills the receiver address; the connection status identifies the configured Wi-Fi/local-network, USB or emulator address. Wi-Fi and USB use the same three Android connection actions, with the transport determined by the address or imported file. If no acknowledgement arrives, check that the receiver is running, the selected address belongs to the computer's current network, and Windows Firewall allows Node.js/the receiver port on the private network.

### Connect by USB (optional)

1. Start the receiver with `.\scripts\start-activity-receiver.ps1 -LocalOnly` (a Wi-Fi receiver also supports USB).
2. On your phone, enable Developer options, then USB debugging. Connect it by USB and accept the phone's debugging authorization prompt.
3. In a second PowerShell window at the project root, run:

```powershell
.\artifacts\android-sdk\platform-tools\adb.exe -d reverse tcp:8765 tcp:8765
```

4. Select **Phone connected by USB** in the dashboard, download its setup file and import it in Android, then tap Start sharing. Repeat the reverse command after reconnecting the phone. `-d` selects the physical phone; if you attach multiple phones, use `-s [device serial]` instead.

The owned emulator uses `http://10.0.2.2:8765/events`. If you choose a different receiver port, replace `8765` in the corresponding addresses and reverse command.

## Use the Android app

The following workflow uses the independent display receiver. Install the [0.11.0 sender APK](../../artifacts/android-publisher/liveabit-sender-0.11.0-poc.apk); its exact-byte validation is recorded in the [setup regression review](../../docs/review/android-setup-regressions-2026-10-13.md). For this route:

1. In the dashboard, choose **Phone connected by USB**, **Android emulator**, or a Wi-Fi address (available when the receiver listens on the LAN). Download its setup file, move it to the phone, then tap **Import receiver file** in liveabit Setup. Alternatively enter the address and key under **Edit connection manually**. Import only fills the fields; sharing stays under your control. The setup file contains the connection key, so keep it private.
2. Choose apps and enable usage access. Start shares their recent 15 minutes and future observations.
3. Enable receiver warnings. The warning interval defaults to **60 minutes**; enter **1** for a short connection-failure trial. In **Settings**, **Save settings** applies it without starting a new sharing session or discarding pending events.
4. Tap **Start sharing**. Repeating Start with the same receiver, key and selected apps keeps pending events, the sharing session and outage timer. It can also update the warning interval. Changing the receiver, key or selected apps asks you to confirm before clearing unexpired pending events; Cancel keeps the saved sharing setup. Use the selected apps, then **Send now** to inspect fresh activity immediately. Automatic sends target **5 minutes** when new selected-app activity is available. After the screen has been off for **15 minutes**, automatic network sends pause; retained events wait until the phone wakes. Empty automatic observations are skipped; manual OpenClaw sends also require positive selected-app duration. Explicit empty manual display-receiver diagnostics remain available without model use. Both values can be changed in Settings (1–1440 minutes). Android can delay jobs; **Send now** remains a manual action.
5. Watch the dashboard. **Withhold acknowledgements** tests retained events and outage warnings; **Send an incorrect acknowledgement** verifies that an unrelated success response cannot remove a pending event. Restoring acknowledgements and sending again clears the warning and retries the same event without an extra displayed copy.
6. **Stop sharing** cancels jobs, stops sharing and clears unsent activity. Receiver copies already received remain on the computer.

The notification says **Receiver is down** after continuous missing acknowledgements reach your configured interval. A network problem can cause the same warning. Android battery scheduling can delay background sending/alerts; notification permission and the receiver-warning channel must be enabled.

Sharing stays on until you tap **Stop sharing**. Closing the app does not turn it off. After the phone shuts down or restarts, enabled monitoring resumes after startup and your first unlock, without opening liveabit or tapping Start again. A previously stopped sender remains stopped. Installing an update over the existing sender also restores enabled scheduling and retains apps, connection, timing, sharing session, pending event bytes and the existing outage timer. This restore only schedules work locally; normal activity and screen-off rules still decide whether to send.

Android's **Force stop** deliberately blocks background work until you reopen the app; reopening restores a saved enabled schedule. Uninstalling or clearing storage removes saved setup. For Wi-Fi, keep the computer/receiver reachable; stop an already-running loopback receiver before starting its LAN-listening command.

Setup immediately flags an unreachable OpenClaw address, refused key, missing route, server rejection or unexpected check response. Send status separately distinguishes unreachable receivers, refused keys, unavailable receivers and incorrect acknowledgements; meaningful events stay pending on send failure. If warning permission or its channel is disabled, **Enable receiver warnings** opens the appropriate Android settings after the initial permission request.

## Build and test on Android

```powershell
.\scripts\build-android-publisher.ps1 -Offline
.\scripts\test-android-publisher.ps1
```

After configuring OpenClaw, include the actual installed gateway in the emulator run with `.\scripts\test-android-publisher.ps1 -OpenClaw`. This submits a synthetic emulator observation to the agent/route in the generated setup and records native run admission. The current mapped setup selects dedicated liveabit; legacy configurable /hooks/agent routes remain supported. Inspect agent output separately; an admission pass is not proof of interpretation.

The test script accepts only the dedicated `liveabit-api35-test` emulator on `emulator-5580`. Start it using the existing emulator script. The tests start their own copy of the actual receiver on a temporary port, with separate files under the test run, and stop it when finished. They do not use or control your receiver on port 8765. Tests install the exact candidate APK, drive the owned lifecycle fixture, then run native Android instrumentation against the receiver and OpenClaw response fixtures. They include a real one-minute notification interval, repeated Start with retained events, the change-setup confirmation and real enabled/stopped phone-reboot workflows. They clear only the sender's synthetic emulator data. No physical phone is touched.

Setup release checks exercise the actual document picker with both the generated current OpenClaw Wi-Fi export and the retained older main-agent export under `-OpenClaw`. They also reject the computer's `connection.json` and a malformed secret-bearing file with safe useful errors, verify imports while the sending worker is blocked, and compare saved enabled/apps/connection/session/timing/outage/pending bytes before and after. The UI check recursively counts connection actions with manual editing expanded, the keyboard actually visible and after recreation, and checks the no-configuration dialog. For this regression fix, the same new tests must fail on the retained 0.10.0 APK at the reported behaviors, then pass on the exact 0.11.0 candidate. See the [release gate](../../specs/android/test-publisher.md#setup-regression-release-gate); passing direct engine admission checks alone does not cover file import.

New events use the [OAP observation draft 2](../../specs/protocol/activity-observation-draft-2.md), `0.2.0-draft.2` / `activity.observation`. It preserves unknown coverage and nullable estimates, with canonical bytes, stable identifiers and expiry tied to the original window. The test receiver validates and displays this format and still accepts queued older-format events. OpenClaw receives the same original canonical record inside its native webhook message. This is an experimental observation family, separate from the unchanged OAP 0.1.0 measured-summary contract. Details: [specification](../../specs/android/test-publisher.md), [Android-first decision](../../docs/decisions/0015-android-first-test-receiver.md) and [OpenClaw decision](../../docs/decisions/0017-openclaw-direct-integration.md).

**When upgrading the sender from 0.7.0 or earlier, restart your display receiver with Ctrl+C and the launch script so it loads support for the new format.** Keep the existing connection/data files. Installing the new APK over the old one preserves its sharing setup and queued bytes. The receiver uses the project's existing locked Node dependencies for schema validation; no additional package or service was introduced.

The preserved 0.6.0 [37-check validation](../../artifacts/android-publisher/run-51d466ec-676e-45fc-bb77-eacbdb39c987/validation.json) binds exact 0.6.0 bytes; see the [latest build log](../../artifacts/android-publisher-build-0.6.0-http-diagnostic.txt) and [release review](../../docs/review/openclaw-whatsapp-2026-10-11.md). Initial full attempts passed 36 checks then returned live-hook HTTP 5xx, while a later focused check and final full run passed. Earlier failures remain preserved with cause unconfirmed. The [0.5.0 review](../../docs/review/openclaw-main-agent-2026-10-11.md) retains its own 37-check run, preserved main settings and uncertainty-preserving output. The [0.4.0 review](../../docs/review/openclaw-poc-2026-10-11.md) retains its own 31-check emulator run and dedicated-agent output: the owned fixture's 92.889 seconds remained an unverified estimate, coverage stayed unknown and 15 transitions were not proof of leaving the app. Earlier [0.3.3](../../docs/review/android-sender-0.3.3-2026-10-10.md), [0.3.2](../../docs/review/android-sender-0.3.2-2026-10-09.md), [0.3.1](../../docs/review/android-sender-0.3.1-2026-10-09.md) and [0.3.0](../../docs/review/android-sender-0.3.0-2026-10-09.md) evidence remains preserved separately.

## Next steps

Development can continue independently; no approval or required phone test blocks it. Keep the tested 0.11.0 sender and its existing liveabit connection. Use main's conversation in the OpenClaw companion to manage real tasks, and keep the companion connected with notifications allowed. An optional connection-check notification confirms the native command separately from real coaching; physical display still needs observation. No APK update or setup reimport is needed for this reminder-route change.
