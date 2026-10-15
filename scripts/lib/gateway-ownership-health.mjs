// Classification only: this module never deletes a lock, stops a process,
// changes SQLite, or starts a gateway. A live PID alone is not ownership proof.
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
const timestamp = value => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value
  : typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;

export function classifyGatewayOwnership({ lockReadConfirmed, lockPresent, ownerRole,
  ownerStartTime, processLookupConfirmed, processPresent, processStartTime,
  processIsGateway = null, gatewayHealthy = null } = {}) {
  const common = { gateway_healthy: gatewayHealthy === true ? true : gatewayHealthy === false ? false : null,
    repair_performed: false, automatic_lock_removal_allowed: false, process_identity_printed: false };
  if (lockReadConfirmed !== true) return { ...common, ownership: 'unknown', reason: 'lock_not_read' };
  if (lockPresent !== true) return { ...common, ownership: 'no_lock_observed', reason: null };
  if (ownerRole !== 'gateway') return { ...common, ownership: 'unknown', reason: 'foreign_or_unknown_owner_role' };
  if (processLookupConfirmed !== true) return { ...common, ownership: 'unknown', reason: 'process_not_verified' };
  if (processPresent === false) return { ...common, ownership: 'stale_owner_absent', reason: 'recorded_process_no_longer_exists' };
  if (processPresent !== true) return { ...common, ownership: 'unknown', reason: 'process_state_unknown' };
  const saved = timestamp(ownerStartTime), actual = timestamp(processStartTime);
  if (saved == null || actual == null) return { ...common, ownership: 'unknown', reason: 'process_start_time_unavailable' };
  // Allow sub-second reporting precision differences between native lock data
  // and Windows process metadata. Hours of drift establishes a reused PID.
  if (Math.abs(saved - actual) > 1000) return { ...common, ownership: 'stale_pid_reused', reason: 'recorded_and_current_process_start_times_differ' };
  if (processIsGateway !== true) return { ...common, ownership: 'unknown', reason: 'matching_start_time_but_gateway_process_unverified' };
  return { ...common, ownership: 'live_gateway_owner', reason: gatewayHealthy === false ? 'owner_alive_gateway_unhealthy' : null };
}

// Resolve paths in the managed Gateway account using the INSTALLED build's
// resolveGatewayLockPaths(process.env), exported as `u` from gateway-lock in
// OpenClaw 2026.9.9. Its stateLockPath is the historical gateway.state.lock.
// Do not substitute the calling desktop account's TEMP or USERPROFILE.
// Current Windows state sidecars are separately under the managed profile's
// AppData/Local/OpenClaw/locks/openclaw-state-owners. Enumerate exact
// state.<16-hex-canonical-db-hash>.lock names there, including a .reclaim guard
// as a separate diagnostic if present. Never infer absence from one directory.
// This helper only inspects; even definite staleness does not authorize repair.
export function inspectGatewayOwnerArtifacts({ stateOwnerDirectory, historicalProjectionPath,
  lookupProcess, gatewayHealthy = null,
  listFiles = directory => readdirSync(directory),
  readLock = filename => {
    try {
      const stat = lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384) throw new Error('unsupported_lock_file');
      return JSON.parse(readFileSync(filename, 'utf8'));
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  } } = {}) {
  const artifacts = [];
  const inspect = (artifact, filename) => {
    let payload;
    try { payload = readLock(filename); }
    catch { return { artifact, ...classifyGatewayOwnership({ gatewayHealthy }) }; }
    if (payload == null) return { artifact, ...classifyGatewayOwnership({ lockReadConfirmed: true, lockPresent: false, gatewayHealthy }) };
    if (!payload || typeof payload !== 'object' || !Number.isSafeInteger(payload.pid) || payload.pid <= 0)
      return { artifact, ...classifyGatewayOwnership({ gatewayHealthy }) };
    let process = {};
    try { process = lookupProcess?.(payload.pid) ?? {}; } catch { }
    return { artifact, ...classifyGatewayOwnership({ lockReadConfirmed: true, lockPresent: true,
      ownerRole: payload.role, ownerStartTime: payload.startTime,
      processLookupConfirmed: process.confirmed, processPresent: process.present,
      processStartTime: process.startTime, processIsGateway: process.isGateway, gatewayHealthy }) };
  };
  try {
    if (typeof stateOwnerDirectory !== 'string' || !stateOwnerDirectory) throw new Error('path_unavailable');
    const names = listFiles(stateOwnerDirectory);
    if (!Array.isArray(names) || names.length > 256) throw new Error('unbounded_directory');
    const sidecars = names.filter(name => typeof name === 'string' && /^state\.[a-f0-9]{16}\.lock$/.test(name));
    for (const name of sidecars) artifacts.push(inspect('state_owner', join(stateOwnerDirectory, name)));
    if (!sidecars.length) artifacts.push({ artifact: 'state_owner', ...classifyGatewayOwnership({ lockReadConfirmed: true, lockPresent: false, gatewayHealthy }) });
    if (names.some(name => typeof name === 'string' && /^state\.[a-f0-9]{16}\.lock\.reclaim$/.test(name)))
      artifacts.push({ artifact: 'state_owner_reclaim_guard', ownership: 'unknown', reason: 'reclaim_guard_observed', repair_performed: false, automatic_lock_removal_allowed: false });
  } catch (error) {
    artifacts.push({ artifact: 'state_owner_scan', ...classifyGatewayOwnership({
      lockReadConfirmed: error.code === 'ENOENT', lockPresent: false, gatewayHealthy }) });
  }
  artifacts.push(typeof historicalProjectionPath === 'string' && historicalProjectionPath
    ? inspect('historical_projection', historicalProjectionPath)
    : { artifact: 'historical_projection', ...classifyGatewayOwnership({ gatewayHealthy }) });
  return { format: 'liveabit.gateway-ownership-inspection.v1',
    result: artifacts.some(row => row.ownership.startsWith('stale_')) ? 'stale_owner_artifact_observed'
      : artifacts.some(row => row.ownership === 'unknown') ? 'ownership_unknown' : 'ownership_snapshot',
    artifacts, native_state_changed: false, process_stopped: false, device_details_printed: false,
    limitation: 'A snapshot is not a repair authorization; compare the exact current owner bytes and process identities before any separately authorized recovery.' };
}
