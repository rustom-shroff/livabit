import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGrokWebhookAttempt as classify } from '../src/experimental/grok-webhook-outcome.mjs';

const attempt = overrides => ({ connectionFailed: false, localConsentActive: true,
  requestBodyWritten: true, responseStatus: 200, ...overrides });
const unproven = result => {
  for (const key of ['actual_host_observed','network_accessed','valid_consumption_proven',
    'completion_proven','agent_evaluation_observed','user_visible_output_observed',
    'remote_cancellation_proven','consent_established','native_profile_enabled','m2_gate_satisfied']) {
    assert.equal(result[key],false,key);
  }
  assert.equal(Object.hasOwn(result,'received_at'),false);
  assert.equal(Object.hasOwn(result,'validation'),false);
  assert.equal(Object.hasOwn(result,'disposition'),false);
  assert(Object.isFrozen(result));
};

test('200 models acceptance without fabricating a receipt, completion or evaluation', () => {
  for(const connectionFailed of [false,true]) {
    const result = classify(attempt({connectionFailed}));
    assert.equal(result.outcome,'accepted_run_start_report');
    assert.equal(result.documented_acceptance_report,true);
    assert.equal(result.automatic_retry_allowed,false);
    assert.equal(result.retry_decision,'stop_accepted');
    unproven(result);
  }
});

test('lost acknowledgement after body write remains ambiguous and cannot retry blindly', () => {
  for(const connectionFailed of [false,true]) {
    const result = classify(attempt({responseStatus:null,connectionFailed}));
    assert.equal(result.outcome,'ambiguous_after_body_write');
    assert.equal(result.remote_side_effect_possible,true);
    assert.equal(result.documented_acceptance_report,false);
    assert.equal(result.retry_decision,'reconcile_before_any_resend');
    assert.equal(result.automatic_retry_allowed,false);
    unproven(result);
  }
});

test('local denial remains effective even when an already submitted request reports acceptance', () => {
  for(const responseStatus of [200,null,401,429,503]) {
    const result = classify(attempt({localConsentActive:false,responseStatus}));
    assert.equal(result.local_consent_active,false);
    assert.equal(result.remote_side_effect_possible,true);
    assert.equal(result.retry_decision,'stop_local_denial');
    assert.equal(result.documented_acceptance_report,responseStatus===200);
    assert.equal(result.automatic_retry_allowed,false);
    unproven(result);
  }
});

test('a pre-body failure is distinct from ambiguous submitted work and is not retry authority', () => {
  for(const connectionFailed of [false,true]) for(const localConsentActive of [false,true]) {
    const result = classify(attempt({responseStatus:null,requestBodyWritten:false,connectionFailed,localConsentActive}));
    assert.equal(result.outcome,'body_not_submitted');
    assert.equal(result.remote_side_effect_possible,false);
    assert.equal(result.automatic_retry_allowed,false);
    if(!localConsentActive) assert.equal(result.retry_decision,'stop_local_denial');
    unproven(result);
  }
});

test('every final status except exact 200 stays nonaccepted with no redirect or automatic retry', () => {
  for(let responseStatus=201;responseStatus<=599;responseStatus++) {
    const result = classify(attempt({responseStatus}));
    assert.equal(result.outcome,'not_accepted_report');
    assert.equal(result.documented_acceptance_report,false);
    assert.equal(result.automatic_retry_allowed,false);
    assert.equal(result.redirect_allowed,false);
    unproven(result);
  }
  for(const responseStatus of [301,302,307,308]) {
    assert.equal(classify(attempt({responseStatus})).attention,'destination_rejected');
  }
  for(const responseStatus of [401,403]) {
    assert.equal(classify(attempt({responseStatus})).attention,'credential_attention');
  }
  assert.equal(classify(attempt({responseStatus:413})).attention,'payload_attention');
  assert.equal(classify(attempt({responseStatus:429})).attention,'backpressure_attention');
});

test('response bodies, endpoints, credentials and activation arguments are rejected without reflection', () => {
  for(const extra of [{body:'PRIVATE_TEST_MARKER'},{endpoint:'PRIVATE_TEST_MARKER'},
    {token:'PRIVATE_TEST_MARKER'},{native_profile_enabled:true},{validation:'valid'}]) {
    assert.throws(()=>classify(attempt(extra)),error=>error instanceof TypeError
      && error.message==='Invalid offline webhook attempt.');
  }
  for(const value of [null,[],true,'PRIVATE_TEST_MARKER',{},attempt({responseStatus:'200'}),
    attempt({responseStatus:NaN}),attempt({responseStatus:100}),attempt({responseStatus:600}),
    attempt({requestBodyWritten:false}),attempt({localConsentActive:1})]) {
    assert.throws(()=>classify(value),/Invalid offline webhook attempt\./u);
  }
  const accessor=attempt();
  let read=false;
  Object.defineProperty(accessor,'responseStatus',{enumerable:true,get(){read=true;throw Error('PRIVATE_TEST_MARKER');}});
  assert.throws(()=>classify(accessor),/Invalid offline webhook attempt\./u);
  assert.equal(read,false);
  const symbol=attempt(); symbol[Symbol('extra')]=true;
  assert.throws(()=>classify(symbol),/Invalid offline webhook attempt\./u);
  const hidden=attempt(); Object.defineProperty(hidden,'token',{value:'PRIVATE_TEST_MARKER'});
  assert.throws(()=>classify(hidden),/Invalid offline webhook attempt\./u);
});
