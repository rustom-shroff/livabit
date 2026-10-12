import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EphemeralMuseConnectionDraft, getMuseConnectionReadiness } from '../src/experimental/meta-muse-connection.mjs';
import { prepareMetaMuseConnection } from '../scripts/prepare-meta-muse-connection.mjs';

const NOW=Date.parse('2026-10-08T20:00:00.000Z');
const details='https://not-a-muse-endpoint.invalid/PRIVATE_ENDPOINT_MARKER\nPRIVATE_NATIVE_AUTH_MARKER';
const draft=options=>new EphemeralMuseConnectionDraft({connectionDetails:details,clock:()=>NOW,...options});
const run=promisify(execFile);

test('Muse readiness cannot assume Grok bearer, 200, free webhook entitlement or active delivery',()=>{
  const result=getMuseConnectionReadiness();assert(Object.isFrozen(result));
  assert.equal(result.free_with_usage_limit_documented,true);
  for(const field of ['native_webhook_contract_verified','credential_entry_enabled','dispatch_enabled',
    'native_profile_enabled','authentication_verified','actual_host_accessed','m2_gate_satisfied']) assert.equal(result[field],false);
  assert.deepEqual(prepareMetaMuseConnection(),result);
  assert.throws(()=>prepareMetaMuseConnection({endpoint:details}),/accepts no configuration/u);
  assert(!JSON.stringify(result).includes('Bearer'));assert(!JSON.stringify(result).includes('200'));
});

test('opaque local drafts reveal no endpoint or credential through review or serialization',()=>{
  const session=draft();try {
    const review=session.review();assert(Object.isFrozen(review));assert.equal(review.details_retained,true);
    assert.equal(Date.parse(review.local_expires_at)-NOW,900000);
    assert.equal(JSON.stringify(session),'{}');assert(!JSON.stringify(review).includes('PRIVATE'));
    assert.equal(review.dispatch_enabled,false);assert.equal(review.persistent_storage_used,false);
  } finally {session.dispose();}
});

test('an unsupported Muse attempt consumes authority and erases details without dispatch or retry',()=>{
  const session=draft();assert.throws(()=>session.attempt(),{code:'native_interface_unverified'});
  const review=session.review();assert.equal(review.attempt_consumed,true);assert.equal(review.details_retained,false);
  assert.equal(review.state,'native_interface_unverified');assert.equal(review.actual_host_accessed,false);
  assert.throws(()=>session.attempt(),{code:'attempt_already_consumed'});
  assert.throws(()=>session.attempt({responseStatus:200}),{code:'invalid_local_setup'});
});

test('cancellation, disposal, local expiry and clock rollback clear the opaque draft',async()=>{
  for(const change of ['cancel','dispose','expired','rollback','clock-error']) {
    let now=NOW;const session=draft({clock:()=>{if(now===null) throw Error('PRIVATE_CLOCK_ERROR');return now;}});
    if(change==='cancel') session.cancel();else if(change==='dispose') session.dispose();
    else now=change==='expired'?NOW+900000:change==='rollback'?NOW-1:null;
    const review=session.review();assert.equal(review.details_retained,false);
    assert.equal(review.state,change==='cancel'?'cancelled':change==='dispose'?'disposed':change==='expired'?'expired':'clock_untrusted');
    assert.throws(()=>session.attempt(),{code:'local_setup_inactive'});
  }
  const session=draft({lifetimeMs:20});await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(session.review().state,'expired');assert.equal(session.review().details_retained,false);
});

test('local draft bounds reject excessive or malformed material without reflecting it',()=>{
  for(const options of [{connectionDetails:''},{connectionDetails:'X'.repeat(8193)},
    {connectionDetails:'PRIVATE\x00VALUE'},{lifetimeMs:900001},{lifetimeMs:0},{clock:()=>NaN},
    {clock:()=>{throw Error('PRIVATE_CLOCK_ERROR');}}]) {
    assert.throws(()=>draft(options),error=>!error.message.includes('PRIVATE'));
  }
});

test('standalone readiness command accepts no secrets and produces no account or transport action',async()=>{
  const script=new URL('../scripts/prepare-meta-muse-connection.mjs',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u,'$1');
  const {stdout,stderr}=await run(process.execPath,[script]);assert.equal(stderr,'');
  assert.deepEqual(JSON.parse(stdout),getMuseConnectionReadiness());
  await assert.rejects(run(process.execPath,[script,'PRIVATE_ARGUMENT_MARKER']),error=>error.code===2
    && !error.stdout.includes('PRIVATE_ARGUMENT_MARKER') && !error.stderr.includes('PRIVATE_ARGUMENT_MARKER'));
  const help=await run(process.execPath,[script,'--help']);assert(help.stdout.includes('disabled'));
});
