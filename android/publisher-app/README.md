# liveabit Sender: Android → OpenClaw or test receiver

This native Android app sends selected-app usage directly to the user's **OpenClaw** activity agent or to the independent desktop display receiver. Both paths reuse the accepted collector and keep the sharing controls on Android. No hosted relay or desktop forwarding bridge is involved. The existing local inspector remains a separate app.

**Current POC, 2026-10-11:** [liveabit Sender 0.4.0-poc APK](../../artifacts/android-publisher/liveabit-sender-0.4.0-poc.apk), SHA-256 `43650faaef9f304a2a2f4d7522f43be6a78255df77bfc242c2b70623b5e78273`. The exact installed APK passed **31 native Android checks** on the owned Android 15/API 35 emulator, including admission by the installed OpenClaw gateway. Separate agent history confirmed interpretation that preserved unknown coverage and unverified estimates. Build/lint passed with zero errors and nine warnings. Wi-Fi setup is enabled after explicit approval; the physical phone has not been tested. See the [OpenClaw POC review](../../docs/review/openclaw-poc-2026-10-11.md) and [native validation](../../artifacts/android-publisher/run-ea7f57fe-4d14-4b9d-aed9-c6d1828b16c3/validation.json).

## Connect directly to OpenClaw

The [OpenClaw guide](../../docs/integration-drafts/openclaw-direct.md) explains the dedicated agent and native webhook mapping. No display-receiver server is needed for this route.

1. From the repository root, run `.\scripts\configure-openclaw.ps1`. It preserves the existing model configuration and generates private setup files under `artifacts/openclaw/`. Without `-Lan`, setup leaves the existing gateway binding unchanged and generates USB/emulator files.
2. For a USB phone, enable USB debugging, connect the cable and authorize the computer. Use the actual generated port:

```powershell
$OpenClawPort = (Get-Content .\artifacts\openclaw\connection.json -Raw | ConvertFrom-Json).port
.\artifacts\android-sdk\platform-tools\adb.exe -d reverse "tcp:$OpenClawPort" "tcp:$OpenClawPort"
```

3. Import `artifacts/openclaw/android-usb-setup.json` in the sender. The owned emulator instead uses `android-emulator-setup.json`. Import fills the setup; it does not start sharing. Keep these files private because they contain the hook credential.
4. Choose apps, enable usage access and receiver warnings, then tap **Start sharing**. Use **Send now** to send fresh observations. Inspect the dedicated `liveabit` sessions in OpenClaw for agent output.

The app identifies `/hooks/agent` as OpenClaw and `/events` as the test receiver. Use the hook token from the generated setup, not the OpenClaw dashboard login token. A valid OpenClaw response acknowledges **run admission**; it does not prove completed interpretation or a user notification. Retained-event retry is best effort and duplicates are possible.

For Wi-Fi, the user-approved LAN setup is now enabled and `artifacts/openclaw/android-wifi-setup.json` is ready. Keep the phone and computer on the same reachable private network, transfer that file to the phone and import it. The helper's `-Lan` option prepares this mode for a new setup; without it, the helper preserves the existing gateway binding. Do not hardcode a default gateway port: use the generated setup, because this Windows package uses its configured port. A local-network probe checked authentication and route reachability, and [native emulator-to-host-LAN admission](../../artifacts/openclaw/android-lan-admission.json) passed; actual phone delivery remains untested.

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
5. Use Copy setup or Download setup file and transfer it to your phone. Wi-Fi setup files also appear as `artifacts/activity-receiver/android-wifi-[address]-setup.json`.
6. In Android, use Paste receiver setup or Import receiver setup file. Alternatively enter the Wi-Fi `/events` address from `connection.json`'s `wifi_events_urls` and its `token` manually. Choose apps, enable usage access, and tap **Start sharing** to apply the Wi-Fi connection.

The app's **Connect over Wi-Fi** button opens these instructions on the phone. **Connect by USB** opens the cable/debugging instructions. Importing the chosen setup sets the receiver address; the connection status identifies the configured Wi-Fi/local-network, USB or emulator address. If no acknowledgement arrives, check that the receiver is running, the selected address belongs to the computer's current network, and Windows Firewall allows Node.js/the receiver port on the private network.

### Connect by USB (optional)

1. Start the receiver with `.\scripts\start-activity-receiver.ps1 -LocalOnly` (a Wi-Fi receiver also supports USB).
2. On your phone, enable Developer options, then USB debugging. Connect it by USB and accept the phone's debugging authorization prompt.
3. In a second PowerShell window at the project root, run:

```powershell
.\artifacts\android-sdk\platform-tools\adb.exe -d reverse tcp:8765 tcp:8765
```

4. Select **Phone connected by USB** in the dashboard and import/paste that setup in Android, then tap Start sharing. Repeat the reverse command after reconnecting the phone. `-d` selects the physical phone; if you attach multiple phones, use `-s [device serial]` instead.

The owned emulator uses `http://10.0.2.2:8765/events`. If you choose a different receiver port, replace `8765` in the corresponding addresses and reverse command.

## Use the Android app

The following workflow uses the independent display receiver. Install the [0.4.0 sender APK](../../artifacts/android-publisher/liveabit-sender-0.4.0-poc.apk), whose exact bytes also passed the display-receiver workflows. For this route:

1. In the dashboard, choose **Phone connected by USB**, **Android emulator**, or a Wi-Fi address (available when the receiver listens on the LAN). Download its setup file, move it to the phone, then tap **Import receiver setup file** in liveabit. Alternatively use **Copy setup** and **Paste receiver setup**, or enter the address and key manually. Import only fills the fields; sharing stays under your control. The setup file contains the connection key, so keep it private.
2. Choose apps and enable usage access. Start shares their recent 15 minutes and future observations.
3. Enable receiver warnings. The warning interval defaults to **60 minutes**; enter **1** for a short connection-failure trial. Save warning interval applies it without starting a new sharing session.
4. Tap **Start sharing**. Repeating Start with the same receiver, key and selected apps keeps pending events, the sharing session and outage timer. It can also update the warning interval. Changing the receiver, key or selected apps asks you to confirm before clearing unexpired pending events; Cancel keeps the saved sharing setup. Use the selected apps, then **Send now** to inspect fresh activity immediately. Background sends are scheduled about every 15 minutes.
5. Watch the dashboard. **Withhold acknowledgements** tests retained events and outage warnings; **Send an incorrect acknowledgement** verifies that an unrelated success response cannot remove a pending event. Restoring acknowledgements and sending again clears the warning and retries the same event without an extra displayed copy.
6. **Stop sharing** cancels jobs, stops sharing and clears unsent activity. Receiver copies already received remain on the computer.

The notification says **Receiver is down** after continuous missing acknowledgements reach your configured interval. A network problem can cause the same warning. Android battery scheduling can delay background sending/alerts; notification permission and the receiver-warning channel must be enabled.

For Wi-Fi, stop any already-running loopback receiver before starting the LAN-listening command. After force-stopping the Android app, reopening it restores its background schedule, pending events and existing outage timer. It does not send while force-stopped. Reinstalling over an existing sender preserves its sharing settings; uninstalling or clearing storage removes them.

The connection screen distinguishes an unreachable receiver, a refused key, an unavailable receiver and an incorrect acknowledgement. Events stay pending in each case. If warning permission or its channel is disabled, **Enable receiver warnings** opens the appropriate Android settings after the initial permission request.

## Build and test on Android

```powershell
.\scripts\build-android-publisher.ps1 -Offline
.\scripts\test-android-publisher.ps1
```

After configuring OpenClaw, include the actual installed gateway in the emulator run with `.\scripts\test-android-publisher.ps1 -OpenClaw`. This submits a synthetic emulator observation to the dedicated `liveabit` agent and records native run admission. Inspect agent output separately; an admission pass is not proof of interpretation.

The test script accepts only the dedicated `liveabit-api35-test` emulator on `emulator-5580`. Start it using the existing emulator script. The tests start their own copy of the actual receiver on a temporary port, with separate files under the test run, and stop it when finished. They do not use or control your receiver on port 8765. Tests install the exact candidate APK, drive the owned lifecycle fixture, then run native Android instrumentation against the receiver and OpenClaw response fixtures. They include a real one-minute notification interval, connection guides, repeated Start with retained events and the change-setup confirmation. They clear only the sender's synthetic emulator data. No physical phone is touched.

New events use the [OAP observation draft](../../specs/protocol/activity-observation.md), `0.2.0-draft.1` / `activity.observation`. It preserves unknown coverage and nullable estimates, with canonical bytes, stable identifiers and expiry tied to the original window. The test receiver validates and displays this format and still accepts queued older-format events. OpenClaw receives the same original canonical record inside its native webhook message. This is an experimental observation family, separate from the unchanged OAP 0.1.0 measured-summary contract. Details: [specification](../../specs/android/test-publisher.md), [Android-first decision](../../docs/decisions/0015-android-first-test-receiver.md) and [OpenClaw decision](../../docs/decisions/0017-openclaw-direct-integration.md).

**When upgrading from 0.3.2 or earlier, restart your receiver with Ctrl+C and the launch script so it loads support for the new format.** Keep the existing connection/data files. Installing the new APK over the old one preserves its sharing setup and queued bytes. The receiver uses the project's existing locked Node dependencies for schema validation; no additional package or service was introduced.

The [0.4.0 review](../../docs/review/openclaw-poc-2026-10-11.md) records its own 31-check emulator run, actual OpenClaw admission and separate agent output. The recorded agent described the owned fixture's 92.889 seconds as an unverified estimate, retained unknown coverage and did not treat 15 transitions as proof of leaving the app. Earlier [0.3.3](../../docs/review/android-sender-0.3.3-2026-10-10.md), [0.3.2](../../docs/review/android-sender-0.3.2-2026-10-09.md), [0.3.1](../../docs/review/android-sender-0.3.1-2026-10-09.md) and [0.3.0](../../docs/review/android-sender-0.3.0-2026-10-09.md) evidence remains preserved separately.

## Next steps

Development can continue independently. The exact 0.4.0 APK is ready for an optional personal trial using the generated Wi-Fi or USB setup; no further approval or new account is needed. Phone delivery and physical background timing are still untested and are not prerequisites for continued local development.
