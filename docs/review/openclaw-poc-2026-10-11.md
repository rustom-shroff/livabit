# Android to OpenClaw development review

Date: **2026-10-11**. Implements [ADR-0017](../decisions/0017-openclaw-direct-integration.md) on the accepted Android collector and [native observation baseline](android-sender-0.3.3-2026-10-10.md).

## App progress

The **0.4.0-poc** Android app sends selected-app OAP `0.2.0-draft.1` observations directly to the installed OpenClaw Gateway's `/hooks/agent` endpoint. The native sender wraps each canonical observation once, stores the immutable request, sends the separate webhook key and original event ID, and removes the event only after HTTP 200 with literal `ok: true` and a nonempty `runId`. The app labels this as acceptance for processing. The desktop test receiver remains available as an independent inspection destination; neither route requires a forwarding server.

The dedicated `liveabit` agent uses the existing model and credentials, its own workspace, and observation-aware [liveabit Skill](../../integrations/openclaw/skills/liveabit/SKILL.md). Android retains protected key storage, durable bounded retries, Stop sharing, and the user-configurable receiver-down warning with a 60-minute default. No JavaScript sender prototype or new dependency was added.

The [Windows setup helper](../../scripts/configure-openclaw.ps1) uses the installed package's supported CLI, validates the patch, saves a private configuration backup, and retains unrelated agents. Wi-Fi exposure was explicitly approved and enabled on the authenticated gateway. Router and firewall settings were not changed. Private Wi-Fi, USB and emulator setup files are saved under ignored `artifacts/openclaw/`; they are not publication artifacts.

## Verification

The exact [APK](../../artifacts/android-publisher/liveabit-sender-0.4.0-poc.apk), **128,460 bytes**, has SHA-256 `43650faaef9f304a2a2f4d7522f43be6a78255df77bfc242c2b70623b5e78273`. Build and lint passed with **zero errors and nine warnings** (existing localization and `.ps1` spelling warnings). The installed APK was pulled and hash-matched before testing.

The complete Windows PowerShell 5.1 suite passed **31 real Android checks** on the project-owned Android 15/API 35 emulator. [Native run report](../../artifacts/android-publisher/run-ea7f57fe-4d14-4b9d-aed9-c6d1828b16c3/validation.json), [source/evidence bindings](openclaw-poc-2026-10-11.json). The 26 existing checks cover actual collection and receiver acknowledgement, immutable retries, native connection/import screens, migration, force-stop/reopen, JobScheduler delivery, notification permission, and a real one-minute outage notification and recovery. Four added native checks exercise the actual Java sender against an on-device HTTP fixture: destination/setup restrictions, collected webhook body/authentication/idempotency, malformed admission responses, HTTP refusal, durable retries and recovery. The final check sends an actual collected observation to the installed OpenClaw Gateway.

A separate [native LAN check](../../artifacts/openclaw/android-lan-admission.json) passed using the host LAN address from the phone's setup file. This establishes emulator-to-host LAN delivery, not a physical-phone Wi-Fi trial. Gateway probes returned 401 without a key and 400 for an authenticated empty request; the latter was deliberately invalid and did not start an agent run.

One actual admitted fixture observation was followed through the dedicated agent's local history to a completed model response. [Private synthetic history](../../artifacts/openclaw/agent-history.json), [trajectory](../../artifacts/openclaw/agent-trajectory.txt). The response reported the event/window and `org.liveabit.fixture`, described **92.889 seconds** as an unverified estimate, stated that 15 transitions did not establish leaving the app, and preserved unknown coverage. This verifies an observed interpretation as well as transport admission. It is not a general model behavior guarantee.

The effective ordinary host-tool catalog was empty under `tools.deny: ["*"]`. OpenClaw Code Mode still exposed its JavaScript `exec`/`wait` controllers; the observed call only read the installed liveabit Skill. That call was not shell execution. The agent has no recurring heartbeat or configured external delivery channel; the tested response remained local. These are the observed configuration and run, not a proof of unrestricted runtime isolation.

An earlier contract run exposed an incorrect test assumption that every retry belonged to one event: automatic Android scheduling can legitimately enqueue a second observation window. The test now checks immutable bytes per event ID and matching payload/header identities, and requires retries of the original event. This was a test-only repair; the main APK hash did not change. Earlier failed reports remain in ignored artifacts.

The repository's retained reference/research suite also passed **369 tests**, with one intentional exclusion for device-local consent that a receiver cannot observe. [Reference run](../../artifacts/openclaw/reference-suite-unsandboxed.txt). Its first restricted run could not perform the required Windows permission and local transport checks; the full run with those capabilities passed without source changes. This supplementary check does not replace the native Android evidence. The contract/document checker passed nine OAP 0.1.0 schemas, 86 fixtures, eight groups, 1,372 local links, 33 requirements and 29 acceptance mappings. Its schema scope remains OAP 0.1.0; the new observation draft is exercised by the native HTTP suite.

## Practical limits

OpenClaw HTTP admission is not a completed-response receipt. Its v2026.9.9 replay cache is temporary, clears on restart, and retains terminal entries for five minutes; delivery is not exactly once. The sender's durable queue improves retries without guaranteeing delivery. Android can delay background jobs and warnings. The one-minute user setting was tested in real time; the one-hour default was checked without waiting an hour.

Physical-phone background behavior, precise duration and complete coverage remain unproven and are not blockers for continued development. The observation family remains a draft; the agreed OAP 0.1.0 summary contract and its separate Skill package are preserved. No production conformance, remote channel notification or coaching policy is claimed here.

The owned test receiver was stopped after testing. The user's primary receiver was not controlled. The owned emulator is stopped after final checks; the configured OpenClaw Gateway remains running for a phone trial.

## Next steps

Install the tested APK, transfer the private `artifacts/openclaw/android-wifi-setup.json` to the phone, import it, grant usage access and notification permission, choose applications, and start sharing while the phone and computer share the local network. [Connection guide](../../android/publisher-app/README.md). Phone testing is now optional and can provide device-specific feedback; it is not required for further local development. Subsequent app work can improve connection feedback and the agent's user-directed behavior without introducing an intermediary service.

## Exact-release sources

- [OpenClaw v2026.9.9 hooks contract](https://github.com/openclaw/openclaw/blob/v2026.9.9/docs/gateway/config-hooks.md)
- [Hook request admission and replay handling](https://github.com/openclaw/openclaw/blob/v2026.9.9/src/gateway/server/hooks-request-handler.ts)
- [Code Mode controllers and policy](https://github.com/openclaw/openclaw/blob/v2026.9.9/docs/tools/code-mode.md)
- [Windows packaging architecture](https://github.com/openclaw/openclaw-windows-packaging/blob/v2026.9.9-msix.0/docs/architecture.md)
