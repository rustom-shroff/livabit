#!/bin/sh
# Run with: sh scripts/run-linux-verification.sh [--install]
# Dependency installation is opt-in; no runtime, package manager or OS installer.
set -eu

install_dependencies=false
case "${1-}" in
  '') ;;
  --install) install_dependencies=true ;;
  *) printf '%s\n' 'Usage: sh scripts/run-linux-verification.sh [--install]' >&2; exit 2 ;;
esac
if [ "$#" -gt 1 ]; then printf '%s\n' 'Only the optional --install argument is supported.' >&2; exit 2; fi
if [ "$(uname -s)" != Linux ]; then printf '%s\n' 'A real Linux environment is required; this runner cannot produce Linux evidence here.' >&2; exit 1; fi
if ! command -v node >/dev/null 2>&1; then printf '%s\n' 'Install a supported Node.js runtime (22 or newer) separately.' >&2; exit 1; fi

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
project_directory=$(CDPATH= cd -- "$script_directory/.." && pwd -P)
cd "$project_directory"

node --input-type=module - <<'NODE'
import os from 'node:os';
import { readFileSync } from 'node:fs';
const major = Number(process.versions.node.split('.')[0]);
const fail = message => { console.error(message); process.exit(1); };
if (process.platform !== 'linux' || os.type() !== 'Linux' || readFileSync('/proc/sys/kernel/ostype', 'utf8').trim() !== 'Linux') fail('Linux Node.js and an actual Linux kernel are required.');
const kernel = readFileSync('/proc/sys/kernel/osrelease', 'utf8').trim();
if (kernel !== os.release() || /-Microsoft$/iu.test(kernel)) fail('A compatibility layer or unverified kernel cannot satisfy the Linux gate.');
if (!Number.isInteger(major) || major < 22) fail('Node.js 22 or newer is required.');
console.log(`Linux kernel ${kernel}; Node.js ${process.versions.node}.`);
NODE

node scripts/package-linux-verification.mjs --check "$project_directory"
if ! command -v pnpm >/dev/null 2>&1; then printf '%s\n' 'Provide pnpm 11.25.0 separately; this runner will not download a package manager.' >&2; exit 1; fi
# Existing Corepack or pnpm shims must not silently fetch another package manager.
export COREPACK_ENABLE_NETWORK=0 COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export npm_config_manage_package_manager_versions=false
pnpm_version=$(pnpm --version)
if [ "$pnpm_version" != 11.25.0 ]; then printf '%s\n' 'Exact pnpm version 11.25.0 is required.' >&2; exit 1; fi
if [ "$install_dependencies" = true ]; then
  pnpm install --frozen-lockfile --ignore-scripts --config.manage-package-manager-versions=false
fi

node --input-type=module - <<'NODE'
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
for (const [name, expected] of Object.entries(pkg.dependencies ?? {})) {
  let installed;
  try { installed = JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).version; }
  catch { console.error('Dependencies are missing; use --install only when dependency installation is authorized.'); process.exit(1); }
  if (installed !== expected) { console.error('Installed dependency versions do not match the pinned project versions.'); process.exit(1); }
}
NODE

# This executes the real lifecycle/tests/demo. No platform label is substituted.
node scripts/verify-reference.mjs
