# Portable Linux verification

Date: **2026-10-04**. Status: **parked; Linux work deferred by the user**. The [priority amendment](decisions/0008-windows-baseline-and-android-integration-priority.md) accepts Windows evidence for progression and prioritizes Android feasibility/direct integration. This preserved Phase 4 tooling is not an activity-delivery component. Its source-only handoff excludes live credentials, activity state, dependencies and historical generated success reports. Nothing is uploaded or published.

## Create and check the handoff

From the development workspace:

```powershell
node scripts/package-linux-verification.mjs
```

The command creates a content-addressed directory under `artifacts/linux-verification/` and prints its path, SHA-256 digest, file count and size. Its `linux-verification-manifest.json` records every input's exact bytes and SHA-256. Keep that original digest separately when transferring the directory privately to an existing Linux machine or VM. Copy bytes without line-ending conversion; the shell runner requires LF endings.

The package checks bounds, ordinary files and directories, symlinks/junctions, unexpected additions and modifications. Its manifest detects transfer errors; it is not a signature or proof of a trusted sender. Dependencies and generated reports are excluded from the input digest. A previously executed directory is separate from the pristine handoff; package output is never silently replaced or cleaned.

To check a transferred directory with Node:

```sh
node scripts/package-linux-verification.mjs --check /absolute/path/to/handoff
```

## Execute on Linux

Use a real Linux kernel, Linux Node.js 22 or newer, and pre-existing **pnpm 11.25.0**. The runner does not install an operating system, Node or a package manager. Node's maintained 22.x release is suitable for checking the supported major; record the exact patch used. Official downloads and checksums are available from the [Node release archive](https://nodejs.org/download/release/latest-v22.x/).

Copy the handoff into the Linux filesystem. WSL2 runs a real Linux kernel; WSL1 and Windows Node invoked from a Linux-looking shell do not qualify. Microsoft recommends the Linux filesystem for Linux tools rather than `/mnt/c`. [WSL architecture](https://learn.microsoft.com/en-us/windows/wsl/compare-versions), [filesystem guidance](https://learn.microsoft.com/en-us/windows/wsl/filesystems).

From that transferred project directory:

```sh
# Install the frozen development dependencies, then verify.
sh scripts/run-linux-verification.sh --install

# When pinned dependencies are already present, verify without installing.
sh scripts/run-linux-verification.sh
```

`--install` explicitly allows the existing pinned package manager to download development dependencies. Package-manager auto-download and automatic version management are disabled. Installation is outside the activity-delivery topology. Both synthetic activity processes run inside Linux and communicate directly over guest loopback; there is no model call, forwarder or external receiver.

The runner verifies kernel/runtime identity, bundle integrity, the exact package-manager version and direct dependency versions before executing the actual reference tests, lifecycle demo, local benchmark and static contract checks. Windows execution is refused before verification records are written. Shell syntax and refusal checks on Windows do not establish Linux success.

## Preserve and review evidence

The recorder writes the general latest-run files, platform files such as `phase-4-validation-linux.json`, and major-version files such as `phase-4-validation-linux-node22.json` under `docs/review/`. The corresponding `contract` and `demo` files are recorded too. It captures actual runtime/kernel, filesystem types, dependency versions, per-case outcomes and exact input hashes. Missing historical report links are represented by explicit `not_run` placeholders; an old Windows pass is never invented in the handoff.

When Linux work resumes, bring Linux-specific reports back alongside the [Windows evidence](review/phase-4-validation-win32.json). Compare complete source/dependency hashes, successful outcomes, exclusions and demo evidence before claiming Linux support. Windows progression is already accepted; future portability evidence has a separate scope. Review [CT-28](../specs/protocol/conformance.md) and the [Phase 4 limits](review/phase-4.md). The preserved handoff revision predates current skill/integration work; review packaging inputs before using it for later release claims.

Linux execution remains untested and **on hold**. No Linux environment choice or WSL installation is needed now. If that priority changes, WSL installation changes Windows and can require administrator access and a restart; no such action is assumed. [Microsoft installation guide](https://learn.microsoft.com/en-us/windows/wsl/install).
