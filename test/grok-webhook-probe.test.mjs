import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { GrokWebhookProbe, createSyntheticWebhookProbeEvent } from '../src/experimental/grok-webhook-probe.mjs';
import { validateEvent, canonical, digest } from '../src/protocol.mjs';

const NOW=Date.parse('2026-10-08T19:30:00.200Z');
const endpoint='https://synthetic.example.invalid/exact-routine-path';
const key='synthetic-probe-test-key-not-a-personal-agent-key';
const credentials=()=>({endpoint,key,localExpiresAt:new Date(NOW+900000).toISOString()});
const clock={now:()=>NOW,trusted:()=>true};
const publicAddress='93.184.216.34';
function fake({status=200,peer=publicAddress,authorized=true,respond=true,connect=true,beforeConnect,onWrite,failAfterWrite,throwDuringWrite}={}) {
  const requests=[],writes=[];
  const transport=(url,options,callback)=>{
    requests.push({url,options});
    const request=new EventEmitter(); request.destroyed=false;
    request.destroy=()=>{request.destroyed=true;};
    request.end=body=>{
      writes.push(Buffer.from(body)); onWrite?.(body);
      if(throwDuringWrite) throw Error('PRIVATE_PARTIAL_WRITE_MARKER');
      if(failAfterWrite) setImmediate(()=>request.emit('error',Error('PRIVATE_ERROR_MARKER')));
      else if(respond) setImmediate(()=>{
        if(request.destroyed) return;
        const response={statusCode:status,destroy(){this.destroyed=true;}};
        callback(response);
      });
    };
    setImmediate(()=>{
      if(request.destroyed) return;
      const socket=new EventEmitter(); Object.assign(socket,{authorized,remoteAddress:peer,connecting:true,secureConnecting:true});
      request.emit('socket',socket);
      if(connect) setImmediate(()=>{beforeConnect?.();socket.connecting=false;socket.secureConnecting=false;socket.emit('secureConnect');});
    });
    return request;
  };
  return {transport,requests,writes};
}
const client=(stub,overrides={})=>new GrokWebhookProbe({endpoint,credentialProvider:{get:credentials},
  assertSendAllowed:()=>true,clock,resolver:async()=>[{address:publicAddress,family:4}],
  transport:stub?.transport,connectTimeoutMs:1000,totalTimeoutMs:2000,...overrides});

test('synthetic probe creates a current schema-valid fixed page and accepts no private payload', async()=>{
  for(const now of [NOW,NOW+899999,NOW+900000]) {
    const event=createSyntheticWebhookProbeEvent(now); validateEvent(event,{now});
    assert.equal(event.summary.coverage.status,'complete');
    assert.equal(Date.parse(event.expires_at)-now,900000);
    assert.deepEqual(event.summary.apps.map(record=>record.application),[
      {namespace:'test.app',id:'example.reader'},{namespace:'test.app',id:'example.video'}]);
  }
  const stub=fake(),probe=client(stub);
  await assert.rejects(probe.run({event:{private:'PRIVATE_ACTIVITY_MARKER'}}),{code:'invalid_probe_setup'});
  assert.equal(stub.requests.length,0);
  const result=await probe.run();
  assert.equal(stub.writes.length,1);
  assert.equal(stub.requests[0].url.href,endpoint);
  assert.equal(stub.requests[0].options.method,'POST');
  const body=stub.writes[0]; validateEvent(JSON.parse(body),{now:NOW});
  assert.equal(result.body_sha256,digest(body));
  assert.equal(result.outcome_model.documented_acceptance_report,true);
  assert.equal(result.outcome_model.valid_consumption_proven,false);
  assert.equal(result.m2_gate_satisfied,false);
  assert(!JSON.stringify(result).includes(key));
  assert(!JSON.stringify(result).includes(endpoint));
  assert.equal(JSON.stringify(probe),'{}');
  await assert.rejects(probe.run(),{code:'probe_already_used'});
  assert.equal(stub.writes.length,1);
});

test('unpaired destinations, TLS bypasses and credentials are rejected before request creation', async()=>{
  for(const bad of ['http://synthetic.example.invalid/path','https://localhost/path','https://user@synthetic.example.invalid/path',
    'https://synthetic.example.invalid/path?key=PRIVATE_KEY_MARKER','https://synthetic.example.invalid/path#fragment',
    'https://synthetic.example.invalid/%2e%2e/path']) {
    assert.throws(()=>client(fake(),{endpoint:bad}));
  }
  assert.throws(()=>client(fake(),{testCa:'unapproved-anchor'}),{code:'destination_rejected'});
  for(const value of [{...credentials(),key:'secret\r\nHeader: value'},
    {...credentials(),endpoint:'https://different.example.invalid/path'},
    {...credentials(),localExpiresAt:new Date(NOW).toISOString()},
    {...credentials(),localExpiresAt:new Date(NOW+900001).toISOString()},
    {...credentials(),extra:true}]) {
    const stub=fake(); await assert.rejects(client(stub,{credentialProvider:{get:()=>value}}).run());
    assert.equal(stub.requests.length,0); assert.equal(stub.writes.length,0);
  }
});

test('all DNS addresses and the actual authenticated peer are checked before any write', async()=>{
  for(const records of [[{address:publicAddress},{address:'127.0.0.1'}],[{address:'169.254.169.254'}],
    [{address:'::ffff:10.0.0.1'}],[],Array.from({length:33},()=>({address:publicAddress}))]) {
    const stub=fake();await assert.rejects(client(stub,{resolver:async()=>records}).run(),{code:'destination_rejected'});
    assert.equal(stub.requests.length,0);
  }
  for(const options of [{peer:'93.184.216.35'},{peer:'127.0.0.1'},{authorized:false}]) {
    const stub=fake(options);const result=await client(stub).run();
    assert.equal(stub.writes.length,0);assert.equal(result.transport_error,'destination_rejected');
    assert.equal(result.body_submission_attempted,false);
  }
  const stub=fake();await client(stub).run();
  const request=stub.requests[0];
  assert.equal(request.options.rejectUnauthorized,true);
  assert.equal(request.options.minVersion,'TLSv1.2');
  assert.equal(request.options.maxVersion,'TLSv1.3');
  assert.equal(request.options.agent,false);
  await new Promise(resolve=>request.options.lookup('unused-host',{all:true},(error,records)=>{
    assert.equal(error,null);assert.deepEqual(records,[{address:publicAddress,family:4}]);resolve();
  }));
});

test('denial during credential read, DNS or TLS handshake cannot write synthetic activity', async()=>{
  for(const stage of ['credentials','dns','tls']) {
    let allowed=true;const stub=fake({beforeConnect:()=>{if(stage==='tls') allowed=false;}});
    const probe=client(stub,{assertSendAllowed:()=>allowed,
      credentialProvider:{get:async()=>{if(stage==='credentials') allowed=false;return credentials();}},
      resolver:async()=>{if(stage==='dns') allowed=false;return [{address:publicAddress}];}});
    if(stage==='tls') {
      const result=await probe.run();assert.equal(result.transport_error,'consent_inactive');
      assert.equal(result.outcome_model.local_consent_active,false);
    } else await assert.rejects(probe.run(),{code:'consent_inactive'});
    assert.equal(stub.writes.length,0);
  }
  const stub=fake();await assert.rejects(client(stub,{assertSendAllowed:async()=>true}).run(),{code:'consent_inactive'});
  assert.equal(stub.requests.length,0);
});

test('clock rollback and local setup expiry during preparation prevent request creation', async()=>{
  for(const change of ['rollback','expiry','untrusted']) {
    let now=NOW,trusted=true;const stub=fake();
    const probe=client(stub,{clock:{now:()=>now,trusted:()=>trusted},resolver:async()=>{
      if(change==='rollback') now-=1;
      if(change==='expiry') now+=900000;
      if(change==='untrusted') trusted=false;
      return [{address:publicAddress}];
    }});
    await assert.rejects(probe.run(),{code:change==='expiry'?'local_deadline_expired':'clock_untrusted'});
    assert.equal(stub.requests.length,0);
  }
});

test('late acknowledgement preserves acceptance alongside local denial without restoring permission', async()=>{
  let allowed=true;
  const stub=fake({onWrite:()=>{allowed=false;}});
  const result=await client(stub,{assertSendAllowed:()=>allowed}).run();
  assert.equal(result.response_status,200);
  assert.equal(result.outcome_model.documented_acceptance_report,true);
  assert.equal(result.outcome_model.local_consent_active,false);
  assert.equal(result.outcome_model.retry_decision,'stop_local_denial');
  assert.equal(result.outcome_model.remote_cancellation_proven,false);
  assert.equal(allowed,false);
});

test('redirects, other statuses, connection loss and cancellation never trigger another send', async()=>{
  for(const status of [201,202,301,307,401,413,429,503]) {
    const stub=fake({status});const result=await client(stub).run();
    assert.equal(result.response_status,status);assert.equal(result.outcome_model.documented_acceptance_report,false);
    assert.equal(result.outcome_model.automatic_retry_allowed,false);assert.equal(stub.writes.length,1);
    assert.equal(stub.requests.length,1);
  }
  const failed=fake({failAfterWrite:true}),failedResult=await client(failed).run();
  assert.equal(failedResult.outcome_model.outcome,'ambiguous_after_body_write');
  assert(!JSON.stringify(failedResult).includes('PRIVATE_ERROR_MARKER'));
  assert.equal(failed.writes.length,1);
  const partial=fake({throwDuringWrite:true}),partialResult=await client(partial).run();
  assert.equal(partialResult.body_submission_attempted,true);
  assert.equal(partialResult.outcome_model.outcome,'ambiguous_after_body_write');
  assert.equal(partialResult.outcome_model.automatic_retry_allowed,false);
  assert(!JSON.stringify(partialResult).includes('PRIVATE_PARTIAL_WRITE_MARKER'));
  assert.equal(partial.writes.length,1);
  const controller=new AbortController();
  const cancelled=fake({respond:false,onWrite:()=>controller.abort()});
  const result=await client(cancelled).run({signal:controller.signal});
  assert.equal(result.transport_error,'consent_inactive');
  assert.equal(result.outcome_model.remote_side_effect_possible,true);
  assert.equal(result.outcome_model.retry_decision,'stop_local_denial');
  assert.equal(cancelled.writes.length,1);
});

test('credential, DNS, connect and post-write response waits are bounded with no late dispatch', async()=>{
  for(const stage of ['credentials','dns','connect','response']) {
    let finishWait;const delayed=new Promise(resolve=>{finishWait=resolve;});
    const stub=fake({connect:stage!=='connect',respond:stage!=='response'});
    const probe=client(stub,{connectTimeoutMs:40,totalTimeoutMs:80,
      ...(stage==='credentials'?{credentialProvider:{get:()=>delayed}}:{}),
      ...(stage==='dns'?{resolver:()=>delayed}:{})});
    if(['credentials','dns'].includes(stage)) {
      await assert.rejects(probe.run(),{code:'response_timeout'});
      finishWait(stage==='credentials'?credentials():[{address:publicAddress}]);
      await new Promise(resolve=>setImmediate(resolve));
      assert.equal(stub.requests.length,0);
    } else {
      const result=await probe.run();assert.equal(result.transport_error,'response_timeout');
      assert.equal(result.body_submission_attempted,stage==='response');
      assert.equal(stub.requests.length,1);
    }
  }
});

test('real owned TLS mock verifies certificate identity and receives the exact synthetic page', async t=>{
  // Reuse only the public, deliberately synthetic TLS test material; do not run its test module.
  const text=await readFile(new URL('./transport.test.mjs',import.meta.url),'utf8');
  const cert=text.match(/const testCertificate = `([^`]+)`;/u)?.[1];
  const testKey=text.match(/const testPrivateKey = `([^`]+)`;/u)?.[1];
  assert(cert&&testKey);
  const received=[];
  const server=https.createServer({cert,key:testKey,minVersion:'TLSv1.2',maxVersion:'TLSv1.3'},async(req,res)=>{
    const chunks=[];for await(const chunk of req) chunks.push(chunk);
    received.push({path:req.url,authorization:req.headers.authorization,body:Buffer.concat(chunks)});
    res.writeHead(200);res.end('untrusted response body is not a consumption receipt');
  });
  server.on('tlsClientError',()=>{});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const localEndpoint=`https://127.0.0.1:${server.address().port}/specific/routine-path`;
  const base={endpoint:localEndpoint,clock,credentialProvider:{get:()=>({...credentials(),endpoint:localEndpoint})},
    assertSendAllowed:()=>true,connectTimeoutMs:1000,totalTimeoutMs:2000};
  const result=await new GrokWebhookProbe({...base,testOnlyLocalTls:true,testCa:cert}).run();
  assert.equal(result.response_status,200);assert.equal(received.length,1);
  assert.equal(received[0].path,'/specific/routine-path');
  assert.equal(received[0].authorization,`Bearer ${key}`);
  const event=JSON.parse(received[0].body);validateEvent(event,{now:NOW});
  assert.equal(received[0].body.toString('utf8'),canonical(event));
  assert.equal(result.body_sha256,digest(received[0].body));
  assert.equal(result.test_only_local_tls,true);assert.equal(result.m2_gate_satisfied,false);
  // The same real certificate cannot be used under another paired hostname.
  const wrongServer=https.createServer({cert,key:testKey},(req,res)=>{received.push({unexpected:true});res.end();});
  wrongServer.on('tlsClientError',()=>{});
  await new Promise(resolve=>wrongServer.listen(0,'::1',resolve));
  t.after(()=>new Promise(resolve=>{wrongServer.closeAllConnections();wrongServer.close(resolve);}));
  const wrongEndpoint=`https://[::1]:${wrongServer.address().port}/specific/routine-path`;
  const mismatch=new GrokWebhookProbe({...base,endpoint:wrongEndpoint,testOnlyLocalTls:true,testCa:cert,
    credentialProvider:{get:()=>({...credentials(),endpoint:wrongEndpoint})}});
  const failed=await mismatch.run();assert.equal(failed.body_submission_attempted,false);
  assert.equal(failed.transport_error,'destination_rejected');
  assert.equal(received.length,1);
});
