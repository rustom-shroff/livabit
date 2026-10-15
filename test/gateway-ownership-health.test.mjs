import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGatewayOwnership, inspectGatewayOwnerArtifacts } from '../scripts/lib/gateway-ownership-health.mjs';

const fixture = { lockReadConfirmed: true, lockPresent: true, ownerRole: 'gateway',
  ownerStartTime: Date.parse('2026-10-14T12:30:14.490Z'), processLookupConfirmed: true,
  processPresent: true, processStartTime: '2026-10-14T12:30:14.490Z', processIsGateway: true };
test('a reused Windows PID does not establish live gateway ownership', () => {
  const result = classifyGatewayOwnership({ ...fixture, processStartTime: '2026-10-15T03:42:00.000Z', processIsGateway: false, gatewayHealthy: false });
  assert.equal(result.ownership, 'stale_pid_reused');
  assert.equal(result.automatic_lock_removal_allowed, false);
  assert.equal(result.repair_performed, false);
  assert.equal(result.gateway_healthy, false);
});
test('same process start time can be live ownership even when a health probe fails', () => {
  const result = classifyGatewayOwnership({ ...fixture, processStartTime: fixture.ownerStartTime + 500, gatewayHealthy: false });
  assert.equal(result.ownership, 'live_gateway_owner');
  assert.equal(result.reason, 'owner_alive_gateway_unhealthy');
});
test('missing permission or incomplete process identity never licenses repair', () => {
  for (const change of [{ processLookupConfirmed: false }, { ownerStartTime: null },
    { processStartTime: 'invalid' }, { processIsGateway: false }, { ownerRole: 'other' }, { lockReadConfirmed: false }]) {
    const result = classifyGatewayOwnership({ ...fixture, ...change });
    assert.equal(result.ownership, 'unknown');
    assert.equal(result.automatic_lock_removal_allowed, false);
  }
  assert.equal(classifyGatewayOwnership({ ...fixture, processPresent: false }).ownership, 'stale_owner_absent');
});

test('an absent current sidecar does not hide the stale historical projection', () => {
  const inspected = [];
  const report = inspectGatewayOwnerArtifacts({ stateOwnerDirectory: 'synthetic/current', historicalProjectionPath: 'synthetic/historical/gateway.state.lock',
    listFiles: () => ['preserved-backup.json'], readLock: filename => { inspected.push(filename); return { pid: 123, startTime: fixture.ownerStartTime, role: 'gateway', secret: 'private-owner-path' }; },
    lookupProcess: () => ({ confirmed: true, present: true, startTime: fixture.ownerStartTime + 10 * 3600000, isGateway: false }) });
  assert.equal(inspected.length, 1);
  assert.equal(report.result, 'stale_owner_artifact_observed');
  assert.equal(report.artifacts[0].ownership, 'no_lock_observed');
  assert.equal(report.artifacts[1].artifact, 'historical_projection');
  assert.equal(report.artifacts[1].ownership, 'stale_pid_reused');
  assert.equal(report.native_state_changed, false);
  assert(!JSON.stringify(report).includes('private-owner-path'));
});

test('both ownership artifacts are independently inspected and reclaim guards stay unknown', () => {
  const files = [], report = inspectGatewayOwnerArtifacts({ stateOwnerDirectory: 'synthetic/current', historicalProjectionPath: 'synthetic/historical/gateway.state.lock',
    listFiles: () => ['state.0123456789abcdef.lock', 'state.0123456789abcdef.lock.reclaim'],
    readLock: filename => { files.push(filename); return { pid: 42, role: 'gateway', startTime: fixture.ownerStartTime }; },
    lookupProcess: () => ({ confirmed: true, present: true, startTime: fixture.ownerStartTime, isGateway: true }) });
  assert.equal(files.length, 2);
  assert.equal(report.result, 'ownership_unknown');
  assert(report.artifacts.some(row => row.reason === 'reclaim_guard_observed'));
  assert(report.artifacts.filter(row => row.artifact !== 'state_owner_reclaim_guard').every(row => row.ownership === 'live_gateway_owner'));
  assert.equal(report.process_stopped, false);
});
