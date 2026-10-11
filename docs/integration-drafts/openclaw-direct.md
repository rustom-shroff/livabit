# OpenClaw direct Android integration

Updated: **2026-10-11**. Status: **native emulator delivery and separate agent interpretation verified; user-approved Wi-Fi setup enabled**. Decision: [ADR-0017](../decisions/0017-openclaw-direct-integration.md).

The activity path is **liveabit Sender on Android -> the user's installed OpenClaw -> the dedicated `liveabit` agent**. OpenClaw is the final receiving agent infrastructure. The existing desktop activity receiver is still available for local display tests, but is not part of this path.

## Native webhook mapping

The verified target is OpenClaw **2026.9.9**, commit **`bcfc888`**, installed through Windows package **2026.9.900.0**. Use the installed version's webhook behavior; current online documentation can describe later releases.

| Android delivery | OpenClaw mapping |
| --- | --- |
| Destination | Actual gateway origin plus `/hooks/agent` |
| Authentication | `Authorization: Bearer` with the dedicated hook token, separate from gateway admin authentication |
| Agent | Fixed `agentId: "liveabit"`, allowed by gateway hook configuration |
| Run behavior | `name: "liveabit"`, `wakeMode: "now"`, `deliver: false` |
| Message | Fixed activity-data introduction followed by the original canonical `0.2.0-draft.1` / `activity.observation` JSON |
| Retry identity | `Idempotency-Key` equals the original `event_id` |
| Successful acknowledgement | HTTP 200 with `ok: true` and nonempty `runId`; **run admission only** |

The sender retains its selected-app collection, immutable pending events, bounded queue, expiry, protected token storage and configurable receiver-down warning. A valid OpenClaw admission response clears the admitted event from the local queue. It does not establish completed interpretation, user notification or an OAP valid-consumption receipt. A missing response can cause retry after the run was already admitted. OpenClaw's verified in-memory idempotency cache lasts five minutes and does not survive restart, so this POC does not promise exactly-once delivery.

The original observation remains unchanged inside the webhook message: unknown coverage stays unknown, unavailable durations stay null, and retained estimates stay unverified. OpenClaw's wrapper is a provider mapping, not a change to the OAP observation schema. Existing summary-only adapters remain separate.

## Local setup

The project setup helper is [configure-openclaw.ps1](../../scripts/configure-openclaw.ps1). Run it from the repository to configure the dedicated workspace and hook route and generate private connection files:

```powershell
.\scripts\configure-openclaw.ps1
```

Without `-Lan`, setup leaves the existing gateway binding unchanged and generates USB/emulator files. Read its output for the actual port; this Windows package can use a dynamic port. The dedicated `liveabit` agent, hook token and workspace instructions have been configured and the gateway is running. An initial supervisor restart deadline expired before startup finished; the helper now waits for the managed gateway's actual status rather than treating that deadline as a final failure.

The `-Lan` option additionally changes the gateway binding and creates Wi-Fi setup files. The user explicitly approved this change and it is now applied; `artifacts/openclaw/android-wifi-setup.json` is ready. A private-address probe returned HTTP 401 without authentication and HTTP 400 for an invalid payload with the correct hook token, establishing route reachability and authentication refusal. A separate [native emulator-to-host-LAN check](../../artifacts/openclaw/android-lan-admission.json) also passed actual gateway admission through that Wi-Fi setup. Physical-phone delivery has not been exercised. Use the generated addresses rather than a hardcoded default port.

| Connection file | Intended use |
| --- | --- |
| `artifacts/openclaw/android-wifi-setup.json` | Created with `-Lan`; phone and computer must share a reachable local network |
| `artifacts/openclaw/android-usb-setup.json` | Phone connected through USB port reversal |
| `artifacts/openclaw/android-emulator-setup.json` | Owned Android emulator |

Import the appropriate connection file in the sender, select the apps to share, grant usage access and notification permission, then explicitly start sharing. Import only fills setup; it does not start collection. The OpenClaw format is `liveabit.openclaw.connection.v1`, with `agent_id` fixed to `liveabit`. The earlier `liveabit.receiver.connection.v1` format remains for the desktop display receiver.

For USB, connect the phone with USB debugging enabled and reverse the helper's reported port before importing the USB file: `adb reverse tcp:<port> tcp:<port>`. Substitute the same actual port in both places. Run `adb reverse --remove tcp:<port>` to remove that mapping when finished.

These files contain a credential. Keep them local and outside Git, issue reports and chat. The helper preserves unrelated agents and settings and retains a local configuration backup. The configured agent uses its own workspace instructions and the existing model configuration, with hook channel delivery and heartbeat disabled. `tools.deny: ["*"]` disables the ordinary host tool catalog. OpenClaw's built-in CodeMode still exposes JavaScript `exec`/`wait` and `skills.read`; the recorded activity run used the Skill read. This configuration is not a zero-tool or no-execution claim. Inspect output inside OpenClaw.

The connection is local. Wi-Fi reachability depends on the computer's gateway binding and firewall and on the two devices being on a network that permits communication. USB remains a direct alternative. No public port, hosted relay or tunnel is required.

## Validation and current scope

The configured runtime was exercised from the exact Android APK on the owned emulator. The [native validation](../../artifacts/android-publisher/run-ea7f57fe-4d14-4b9d-aed9-c6d1828b16c3/validation.json) passed **31 checks** on Android 15/API 35, including real selected-app observations, native hook body/authentication/idempotency, acknowledgement refusal, retained retry, one-minute outage notification/recovery, test-receiver compatibility and actual OpenClaw admission. The installed gateway returned run ID `97595969-b36c-47df-bc32-e344344f9ec8`.

Separate real agent history confirmed that the `liveabit` agent read the Skill and interpreted the observation: the owned fixture's 92.889 seconds remained an unverified estimate, coverage remained unknown, and 15 transitions were not treated as proof of leaving the app. This is observed interpretation for that event, separate from HTTP admission. See the [dated POC review](../review/openclaw-poc-2026-10-11.md).

Native **0.4.0-poc** built successfully, with lint reporting zero errors and nine warnings. APK SHA-256: `43650faaef9f304a2a2f4d7522f43be6a78255df77bfc242c2b70623b5e78273`. The exact-byte emulator gate is satisfied for an optional phone trial. Physical-phone delivery/background timing, complete coverage, battery behavior and production M2/M3 are not established by this POC. Development can continue independently; no further approval, purchase or phone test is required first.

Grok, Muse and ChatGPT investigations remain historical alternatives. They do not gate this authorized OpenClaw POC, and no account purchase is needed to implement the local path.

## Versioned sources

Webhook behavior was checked against the installed release's [hook configuration documentation](https://github.com/openclaw/openclaw/blob/v2026.9.9/docs/gateway/config-hooks.md) and its actual implementation. The Windows installation is described by the [v2026.9.9-msix.0 packaging README](https://github.com/openclaw/openclaw-windows-packaging/blob/v2026.9.9-msix.0/README.md). Runtime validation must still record what the local instance actually does.
