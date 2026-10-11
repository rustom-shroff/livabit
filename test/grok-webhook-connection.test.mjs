import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { GrokWebhookConnectionSession, captureGrokWebhookConnection,
  getGrokConnectionReadiness } from '../src/experimental/grok-webhook-connection.mjs';
import { canonical, digest, validateEvent } from '../src/protocol.mjs';

const NOW=Date.parse('2026-10-08T19:30:00.200Z');
const endpoint='https://synthetic.example.invalid/reviewed-routine';
const key='PRIVATE_SYNTHETIC_KEY_MARKER';
const sha=value=>createHash('sha256').update(value).digest('hex');
const clock={now:()=>NOW,trusted:()=>true};
const reviewed=(url=endpoint)=>({endpointSha256:sha(url),reviewedAt:NOW,
  existingBotVerified:true,basePlanWebhookVerified:true,providerOwnedDestinationVerified:true,
  intendedRoutineVerified:true,onDemandDisabledVerified:true});
const safeError=error=>typeof error.code==='string'
  && !`${error.message} ${error.code}`.includes(key)
  && !`${error.message} ${error.code}`.includes(endpoint);

function fake({respond=true,status=200,beforeConnect,onWrite}={}) {
  const requests=[],writes=[];
  const transport=(url,options,callback)=>{
    requests.push({url,options});
    const request=new EventEmitter();request.destroyed=false;
    request.destroy=()=>{request.destroyed=true;};
    request.end=body=>{
      writes.push(Buffer.from(body));onWrite?.();
      if(respond) setImmediate(()=>{
        if(!request.destroyed) callback({statusCode:status,destroy(){}});
      });
    };
    setImmediate(()=>{
      if(request.destroyed) return;
      const socket=new EventEmitter();
      Object.assign(socket,{authorized:true,remoteAddress:'93.184.216.34',connecting:true,secureConnecting:true});
      request.emit('socket',socket);
      setImmediate(()=>{
        beforeConnect?.();socket.connecting=false;socket.secureConnecting=false;socket.emit('secureConnect');
      });
    });
    return request;
  };
  return {requests,writes,transport};
}
const probeOptions=stub=>({transport:stub.transport,resolver:async()=>[{address:'93.184.216.34',family:4}],
  connectTimeoutMs:500,totalTimeoutMs:1000});
const session=(stub,options={})=>new GrokWebhookConnectionSession({endpoint,key,reviewedSetup:reviewed(),
  clock,probeOptions:probeOptions(stub),...options});
const authorize=value=>value.authorizeOneSyntheticAttempt({session_id:value.review().session_id,
  action:'send_one_synthetic_page'});
const io=value=>({input:value.input,output:value.output});

function terminal(values=[]) {
  const input=new EventEmitter(),written=[];let index=0;
  Object.assign(input,{isTTY:true,isRaw:false,readableFlowing:false,readableEncoding:null,
    setRawMode(value){this.isRaw=value;},resume(){this.readableFlowing=true;},pause(){this.readableFlowing=false;}});
  const output={isTTY:true,write(text){
    written.push(text);
    if(text!=='\n' && index<values.length) {
      const value=values[index++];setImmediate(()=>input.emit('data',Buffer.from(`${value}\r`)));
    }
  }};
  return {input,output,written};
}

test('account/destination attestations are mandatory before any hidden prompt',async()=>{
  for(const field of ['existingBotVerified','basePlanWebhookVerified','providerOwnedDestinationVerified',
    'intendedRoutineVerified','onDemandDisabledVerified']) {
    const t=terminal([endpoint,key]),review={...reviewed(),[field]:false};
    await assert.rejects(captureGrokWebhookConnection({...io(t),reviewedSetup:review,clock}),safeError);
    assert.deepEqual(t.written,[]);assert.equal(t.input.isRaw,false);
  }
  for(const review of [{...reviewed(),extra:true},{...reviewed(),reviewedAt:NOW+1},
    {...reviewed(),reviewedAt:NOW-900000},{...reviewed(),endpointSha256:'bad'}]) {
    const t=terminal([endpoint,key]);
    await assert.rejects(captureGrokWebhookConnection({...io(t),reviewedSetup:review,clock}),safeError);
    assert.deepEqual(t.written,[]);
  }
});

test('review accessors and transport authority overrides cannot run during setup',()=>{
  let getterCalls=0;const review=reviewed();
  Object.defineProperty(review,'intendedRoutineVerified',{get(){getterCalls++;throw Error(key);}});
  assert.throws(()=>session(fake(),{reviewedSetup:review}),safeError);assert.equal(getterCalls,0);
  for(const field of ['endpoint','credentialProvider','assertSendAllowed','clock']) {
    assert.throws(()=>session(fake(),{probeOptions:{...probeOptions(fake()),[field]:key}}),safeError);
  }
});

test('a mismatched destination is rejected before the key prompt, without echo',async()=>{
  const t=terminal(['https://other.example.invalid/different-routine',key]);
  await assert.rejects(captureGrokWebhookConnection({...io(t),reviewedSetup:reviewed(),clock}),safeError);
  assert.equal(t.written.filter(text=>text!=='\n').length,1);
  assert(!t.written.join('').includes(key));assert(!t.written.join('').includes(endpoint));
  assert.equal(t.input.isRaw,false);assert.equal(t.input.listenerCount('data'),0);
});

test('hidden capture binds the reviewed destination and synthetic key without returning either',async()=>{
  const t=terminal([endpoint,key]),stub=fake();
  const value=await captureGrokWebhookConnection({...io(t),reviewedSetup:reviewed(),clock,probeOptions:probeOptions(stub)});
  try {
    const metadata=JSON.stringify(value.review());
    for(const secret of [endpoint,key,sha(endpoint)]) assert(!metadata.includes(secret));
    assert.equal(JSON.stringify(value),'{}');assert.equal(stub.requests.length,0);
    assert(!t.written.join('').includes(endpoint));assert(!t.written.join('').includes(key));
    assert.equal(t.input.isRaw,false);assert.equal(t.input.listenerCount('data'),0);
    authorize(value);const result=await value.attempt();
    assert.equal(stub.writes.length,1);assert.equal(stub.requests[0].url.href,endpoint);
    assert.equal(stub.requests[0].options.headers.Authorization,`Bearer ${key}`);
    assert.equal(result.outcome_model.documented_acceptance_report,true);
    assert.equal(result.outcome_model.valid_consumption_proven,false);
    assert.equal(result.m2_gate_satisfied,false);
    for(const secret of [endpoint,key,sha(endpoint)]) assert(!JSON.stringify(result).includes(secret));
  } finally {value.dispose();}
});

test('unreviewed URLs and invalid keys cannot be retained or submitted',()=>{
  for(const url of ['http://synthetic.example.invalid/routine','https://user@synthetic.example.invalid/routine',
    'https://synthetic.example.invalid/routine?key=secret','https://synthetic.example.invalid/routine#fragment',
    'https://synthetic.example.invalid/%2e/routine']) {
    assert.throws(()=>session(fake(),{endpoint:url,reviewedSetup:reviewed(url)}),safeError);
  }
  for(const invalidKey of ['',`${key}\r\nHeader: value`,'A'.repeat(4097)]) {
    assert.throws(()=>session(fake(),{key:invalidKey}),safeError);
  }
});

test('authorization is bound to this session and never permits caller-supplied activity',async()=>{
  const stub=fake(),value=session(stub);
  try {
    assert.throws(()=>value.authorizeOneSyntheticAttempt({session_id:'different',action:'send_one_synthetic_page'}),safeError);
    assert.throws(()=>value.authorizeOneSyntheticAttempt({session_id:value.review().session_id,action:'send_private_activity'}),safeError);
    assert.equal(stub.requests.length,0);
    authorize(value);const result=await value.attempt();
    const event=JSON.parse(stub.writes[0]);validateEvent(event,{now:NOW});
    assert.deepEqual(event.summary.apps.map(x=>x.application.namespace),['test.app','test.app']);
    assert.equal(result.body_sha256,digest(stub.writes[0]));
    await assert.rejects(value.attempt(),safeError);assert.equal(stub.requests.length,1);
  } finally {value.dispose();}
  const denied=session(stub);
  try {
    await assert.rejects(denied.attempt({event:{private:key}}),safeError);
    assert.throws(()=>authorize(denied),safeError);
    assert.equal(stub.requests.length,1);
  } finally {denied.dispose();}
});

test('an unapproved valid attempt consumes authority without network access',async()=>{
  const stub=fake(),value=session(stub);
  try {
    await assert.rejects(value.attempt(),safeError);
    assert.throws(()=>authorize(value),safeError);
    await assert.rejects(value.attempt(),safeError);assert.equal(stub.requests.length,0);
  } finally {value.dispose();}
});

test('concurrent attempts can create only one request and an ambiguous result grants no resend',async()=>{
  const stub=fake({respond:false}),value=session(stub,{probeOptions:{...probeOptions(stub),totalTimeoutMs:50}});
  try {
    authorize(value);const first=value.attempt();
    await assert.rejects(value.attempt(),safeError);
    const result=await first;
    assert.equal(stub.requests.length,1);assert.equal(stub.writes.length,1);
    assert.equal(result.outcome_model.outcome,'ambiguous_after_body_write');
    assert.equal(result.outcome_model.automatic_retry_allowed,false);
    await assert.rejects(value.attempt(),safeError);assert.equal(stub.requests.length,1);
  } finally {value.dispose();}
});

test('review/transport mutation cannot redirect a session or revive denied eligibility',async()=>{
  const stub=fake(),review=reviewed(),options=probeOptions(stub);
  const value=session(stub,{reviewedSetup:review,probeOptions:options});
  try {
    review.endpointSha256=sha('https://evil.example.invalid/routine');review.basePlanWebhookVerified=false;
    options.transport=()=>{throw Error(key);};options.endpoint='https://evil.example.invalid/routine';
    authorize(value);const result=await value.attempt();
    assert.equal(stub.requests[0].url.href,endpoint);assert.equal(result.response_status,200);
  } finally {value.dispose();}
});

test('old review authority cannot be renewed by constructing a fresh session',async()=>{
  let now=NOW;const stub=fake(),value=session(stub,{clock:{now:()=>now,trusted:()=>true},
    reviewedSetup:{...reviewed(),reviewedAt:NOW-899000}});
  try {
    // Leave real scheduling room for authorization, then reach the original review deadline.
    authorize(value);now+=1000;
    await assert.rejects(value.attempt(),safeError);assert.equal(stub.requests.length,0);
  } finally {value.dispose();}
});

test('expiry and clock rollback deny transport; cancel/dispose deny further authority',async()=>{
  for(const mode of ['expire','rollback','cancel','dispose']) {
    let now=NOW;const stub=fake(),value=session(stub,{clock:{now:()=>now,trusted:()=>true},lifetimeMs:10});
    try {
      authorize(value);
      if(mode==='expire') now+=10;
      else if(mode==='rollback') now--;
      else if(mode==='cancel') value.cancel();
      else value.dispose();
      await assert.rejects(value.attempt(),safeError);
      assert.equal(stub.requests.length,0);assert.throws(()=>authorize(value),safeError);
    } finally {value.dispose();}
  }
});

test('clock/consent fences apply again during preparation and immediately before TLS body write',async()=>{
  for(const stage of ['dns','tls']) {
    let now=NOW;const stub=fake({beforeConnect:()=>{if(stage==='tls') now--;}});
    const options=probeOptions(stub);
    if(stage==='dns') options.resolver=async()=>{now--;return [{address:'93.184.216.34',family:4}];};
    const value=session(stub,{clock:{now:()=>now,trusted:()=>true},probeOptions:options});
    try {
      authorize(value);
      try {await value.attempt();} catch(error) {assert(safeError(error));}
      assert.equal(stub.writes.length,0);
    } finally {value.dispose();}
  }
});

test('abort during hidden capture restores the terminal without producing a session',async()=>{
  const controller=new AbortController(),t=terminal();
  const pending=captureGrokWebhookConnection({...io(t),reviewedSetup:reviewed(),clock,signal:controller.signal});
  setImmediate(()=>controller.abort());await assert.rejects(pending,safeError);
  assert.equal(t.input.isRaw,false);assert.equal(t.input.listenerCount('data'),0);
});

test('capture expiry is bounded while waiting for hidden input',async()=>{
  const t=terminal();
  await assert.rejects(captureGrokWebhookConnection({...io(t),reviewedSetup:reviewed(),clock,lifetimeMs:10}),safeError);
  assert.equal(t.input.isRaw,false);assert.equal(t.input.listenerCount('data'),0);
});

test('cancellation after possible submission preserves uncertainty without claiming remote cancellation',async()=>{
  let value;const stub=fake({respond:false,onWrite:()=>value.cancel()});value=session(stub);
  try {
    authorize(value);const result=await value.attempt();
    assert.equal(result.body_submission_attempted,true);
    assert.equal(result.outcome_model.remote_side_effect_possible,true);
    assert.equal(result.outcome_model.local_consent_active,false);
    assert.equal(result.outcome_model.remote_cancellation_proven,false);
    assert.equal(result.outcome_model.automatic_retry_allowed,false);
    assert.equal(stub.requests.length,1);
  } finally {value.dispose();}
});

test('owned final TLS mock receives exact fixed synthetic bytes through hidden setup',async t=>{
  const text=await readFile(new URL('./transport.test.mjs',import.meta.url),'utf8');
  const cert=text.match(/const testCertificate = `([^`]+)`;/u)?.[1];
  const tlsKey=text.match(/const testPrivateKey = `([^`]+)`;/u)?.[1];assert(cert&&tlsKey);
  const received=[];
  const server=https.createServer({cert,key:tlsKey},async(req,res)=>{
    const chunks=[];for await(const chunk of req) chunks.push(chunk);
    received.push({path:req.url,authorization:req.headers.authorization,body:Buffer.concat(chunks)});
    res.writeHead(200);res.end('PRIVATE_UNTRUSTED_REPLY');
  });
  server.on('tlsClientError',()=>{});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const localEndpoint=`https://127.0.0.1:${server.address().port}/owned/final-routine`;
  const terminalState=terminal([localEndpoint,key]);
  const value=await captureGrokWebhookConnection({...io(terminalState),reviewedSetup:reviewed(localEndpoint),clock,
    probeOptions:{testOnlyLocalTls:true,testCa:cert,connectTimeoutMs:1000,totalTimeoutMs:2000}});
  try {
    authorize(value);const result=await value.attempt();
    assert.equal(received.length,1);assert.equal(received[0].path,'/owned/final-routine');
    assert.equal(received[0].authorization,`Bearer ${key}`);
    const event=JSON.parse(received[0].body);validateEvent(event,{now:NOW});
    assert.equal(received[0].body.toString(),canonical(event));assert.equal(result.body_sha256,digest(received[0].body));
    assert.equal(result.test_only_local_tls,true);assert.equal(result.actual_bot_evaluation_observed,false);
    assert.equal(result.m2_gate_satisfied,false);assert(!JSON.stringify(result).includes('PRIVATE_UNTRUSTED_REPLY'));
  } finally {value.dispose();}
});

test('standalone readiness CLI never asks for credentials or reflects unexpected arguments',()=>{
  assert.equal(getGrokConnectionReadiness().credential_entry_enabled,false);
  assert.equal(getGrokConnectionReadiness().dispatch_enabled,false);
  const script='scripts/prepare-grok-webhook-connection.mjs';
  const good=spawnSync(process.execPath,[script],{encoding:'utf8'});
  assert.equal(good.status,0);assert.equal(JSON.parse(good.stdout).dispatch_enabled,false);
  for(const value of [key,endpoint,'--probe']) {
    const result=spawnSync(process.execPath,[script,value],{encoding:'utf8'});
    assert.equal(result.status,2);assert(!`${result.stdout}${result.stderr}`.includes(value));
  }
});
