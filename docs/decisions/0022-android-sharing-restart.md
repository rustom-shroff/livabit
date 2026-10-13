# ADR-0022: remember Android sharing and restore it after startup

Date: **2026-10-13**. Status: **Accepted for POC development by the user's instruction**. Extends ADR-0015/0019/0020/0021. No OAP contract or agent destination changes.

## Context

The user wants liveabit to remember whether OAP sharing was on or off. After phone shutdown and startup, monitoring should resume automatically if it was enabled, without reopening liveabit or pressing Start again. A deliberately stopped sender must remain stopped.

The Android sender already persists its enabled state, sharing setup, immutable pending events and outage state. Its one-off JobScheduler work is persisted, and reopening repairs missing jobs. Startup needs the same restoration even when those jobs are absent.

## Decision

Implement directly in the native Android sender. Add a non-exported StartupReceiver for `BOOT_COMPLETED` and `MY_PACKAGE_REPLACED`, using the existing receive-boot permission and idempotent scheduling restoration. The callback schedules local work only; it does not create an OAP observation, send a packet, open Activity or start a foreground service. Scheduling can read local screen history to respect the existing idle pause.

The saved enabled flag remains the user's choice. Enabled sharing restores missing automatic and outage jobs without resetting the session, cursor, sequence, pending bytes or failure timer. Disabled sharing cancels obsolete jobs and stays disabled. Closing the app or updating it does not require another Start. An already-correct 0.9.0 connection and sharing setup survive installation of 0.10.0 over it; no setup reimport is needed for this feature.

Keep credential-protected private storage. Normal restoration runs after first unlock following boot. Existing JobScheduler constraints, configurable active interval and screen-off pause still govern work, and an empty scan still sends no OpenClaw packet. The receiver introduces no dependency, relay, direct-boot credential storage or always-running service.

Preserve selected apps, endpoint/agent/key, timing preferences, meaningful queued request bytes and event identities, sharing stream and existing outage timestamps. Use the existing collector boot/uptime bounds and continuity reset so shutdown time is not inferred as foreground usage. Earlier pending observations retain their original time and expiry.

Android Force stop intentionally prevents background execution until the user opens the app again; reopening restores a saved enabled schedule. Stop sharing remains the normal control for disabling collection and sending. Uninstalling or clearing storage removes saved setup.

## Verification and limits

Exact release **0.10.0-poc**, version code **12**, passed **87 native Android 15/API 35 checks**, including two real enabled/stopped emulator reboots. Enabled startup restored jobs deliberately removed before reboot, verified before launching Activity or instrumentation; post-reboot delivery acknowledged the original queued event with its retained encrypted connection. Stopped startup kept sharing disabled without jobs or packets. Setup, timing, selection, session, meaningful queue bytes and outage state survived. The exact-byte emulator gate is met for an optional phone update.

The [startup review](../review/android-reboot-resume-2026-10-13.md) records final binary identity and results. The [0.9.0 review](../review/openclaw-task-aware-2026-10-13.md) remains separate historical evidence. Emulator behavior does not prove every phone manufacturer's background policy, exact job timing, precise duration or complete source coverage. Those accepted limits remain; restoration is not immediate delivery. TASK-P6-F05 and existing lifecycle/consent/recovery requirements continue without new stable IDs or changed formal M2/M3 gates.
