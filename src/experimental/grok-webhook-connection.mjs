// Ephemeral, explicit synthetic setup only; not a production OAP adapter or Android publisher.
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { GrokWebhookProbe } from './grok-webhook-probe.mjs';
import { LocalSetupError, readHiddenLocalValue } from './protected-local-input.mjs';

const MAX_LIFETIME_MS=900000;
const CAPTURE_DEADLINE=Symbol('owned-capture-deadline');
const REVIEW_FIELDS=['endpointSha256','reviewedAt','existingBotVerified','basePlanWebhookVerified',
  'providerOwnedDestinationVerified','intendedRoutineVerified','onDemandDisabledVerified'];
const PROBE_FIELDS=['resolver','transport','testOnlyLocalTls','testCa','connectTimeoutMs','totalTimeoutMs'];
const SESSION_FIELDS=['endpoint','key','reviewedSetup','clock','lifetimeMs','probeOptions'];
const CAPTURE_FIELDS=['input','output','reviewedSetup','clock','lifetimeMs','timeoutMs','signal','probeOptions'];
const safeInputCodes=new Set(['interactive_terminal_required','invalid_local_setup','local_setup_cancelled',
  'invalid_local_value','terminal_restore_failed','local_setup_input_failed','local_value_too_large','local_setup_timeout']);
const safeProbeCodes=new Set(['probe_already_used','invalid_probe_setup','destination_rejected','credential_unusable',
  'local_deadline_expired','consent_inactive','clock_untrusted','connection_failed','response_timeout']);
const safeCaptureCodes=new Set([...safeInputCodes,'clock_untrusted','local_deadline_expired',
  'destination_rejected','destination_review_mismatch','credential_unusable']);
const fail=code=>{throw new LocalSetupError(code);};
const errorCode=(error,codes,fallback)=>{
  try {const code=error?.code;return codes.has(code)?code:fallback;} catch {return fallback;}
};

function dataCopy(value,fields,{exact=false}={}) {
  try {
    if(value===null || typeof value!=='object' || ![Object.prototype,null].includes(Object.getPrototypeOf(value)))
      fail('invalid_local_setup');
    const keys=Reflect.ownKeys(value);
    if(exact && keys.length!==fields.length || keys.some(key=>typeof key!=='string' || !fields.includes(key)))
      fail('invalid_local_setup');
    const copy={};
    for(const key of keys) {
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      if(!descriptor || !Object.hasOwn(descriptor,'value')) fail('invalid_local_setup');
      copy[key]=descriptor.value;
    }
    return Object.freeze(copy);
  } catch {fail('invalid_local_setup');}
}

function copyClock(value={now:()=>Date.now(),trusted:()=>true}) {
  const clock=dataCopy(value,['now','trusted'],{exact:true});
  if(typeof clock.now!=='function' || typeof clock.trusted!=='function') fail('invalid_local_setup');
  return clock;
}

function sampleClock(clock,previous=0) {
  let now;
  try {if(clock.trusted()!==true) fail('clock_untrusted');now=clock.now();}
  catch {fail('clock_untrusted');}
  if(!Number.isSafeInteger(now) || now<900000 || now<previous || now>8640000000000000-MAX_LIFETIME_MS)
    fail('clock_untrusted');
  return now;
}

function copyReview(value,now) {
  const review=dataCopy(value,REVIEW_FIELDS,{exact:true});
  if(typeof review.endpointSha256!=='string' || !/^[a-f0-9]{64}$/u.test(review.endpointSha256)
    || !Number.isSafeInteger(review.reviewedAt) || review.reviewedAt<0 || review.reviewedAt>now
    || now-review.reviewedAt>=MAX_LIFETIME_MS || REVIEW_FIELDS.slice(2).some(field=>review[field]!==true))
    fail('reviewed_setup_required');
  return review;
}

function copyProbeOptions(value={}) {
  const options=dataCopy(value,PROBE_FIELDS);
  if(options.resolver!==undefined && typeof options.resolver!=='function'
    || options.transport!==undefined && typeof options.transport!=='function'
    || options.testOnlyLocalTls!==undefined && typeof options.testOnlyLocalTls!=='boolean'
    || options.testCa!==undefined && (typeof options.testCa!=='string' || !options.testCa.length || Buffer.byteLength(options.testCa)>65536)
    || options.testCa!==undefined && options.testOnlyLocalTls!==true
    || options.testOnlyLocalTls===true && options.testCa===undefined
    || options.connectTimeoutMs!==undefined && (!Number.isSafeInteger(options.connectTimeoutMs) || options.connectTimeoutMs<1 || options.connectTimeoutMs>10000)
    || options.totalTimeoutMs!==undefined && (!Number.isSafeInteger(options.totalTimeoutMs) || options.totalTimeoutMs<1 || options.totalTimeoutMs>30000))
    fail('invalid_local_setup');
  return options;
}

function checkEndpoint(endpoint,review,probeOptions) {
  if(typeof endpoint!=='string' || !endpoint.length || Buffer.byteLength(endpoint)>2048 || /[\\%\s]/u.test(endpoint))
    fail('destination_rejected');
  let url;try {url=new URL(endpoint);} catch {fail('destination_rejected');}
  if(url.href!==endpoint || url.protocol!=='https:' || url.username || url.password || url.search || url.hash)
    fail('destination_rejected');
  const loopback=['127.0.0.1','[::1]'].includes(url.hostname);
  if(probeOptions.testOnlyLocalTls===true ? !loopback : loopback || url.hostname==='localhost')
    fail('destination_rejected');
  const actual=createHash('sha256').update(endpoint,'utf8').digest();
  const expected=Buffer.from(review.endpointSha256,'hex');
  const matches=timingSafeEqual(actual,expected);actual.fill(0);expected.fill(0);
  if(!matches) fail('destination_review_mismatch');
}

function checkLifetime(lifetimeMs) {
  if(!Number.isSafeInteger(lifetimeMs) || lifetimeMs<1 || lifetimeMs>MAX_LIFETIME_MS) fail('invalid_local_setup');
}

export function getGrokConnectionReadiness() {
  return Object.freeze({target:'grok-bot',evidence_kind:'local_grok_connection_readiness',
    native_webhook_contract_documented:true,protected_input_implemented:true,
    protected_ephemeral_setup_implemented:true,operator_destination_and_plan_review_required:true,
    operator_attestation_is_provider_proof:false,base_plan_entitlement_automatically_verified:false,
    credential_entry_enabled:false,dispatch_enabled:false,persistent_secure_storage_implemented:false,
    persistent_storage_used:false,native_profile_enabled:false,actual_bot_accessed:false,
    actual_bot_evaluation_observed:false,m2_gate_satisfied:false,
    needs:'existing_bot_and_current_base_plan_entitlement_then_reviewed_native_destination'});
}

/** A trusted local driver supplies attestation; these booleans do not inspect an account or prove entitlement. */
export class GrokWebhookConnectionSession {
  #endpoint;#key;#clock;#options;#created;#expires;#monotonicExpires;#lastNow;#timer;
  #id=randomUUID();#state='ready';#consumed=false;#authorized=false;#controller;
  constructor(value={},ownedDeadline) {
    if(arguments.length>2) fail('invalid_local_setup');
    const options=dataCopy(value,SESSION_FIELDS);
    const clock=copyClock(options.clock),now=sampleClock(clock),review=copyReview(options.reviewedSetup,now);
    const probeOptions=copyProbeOptions(options.probeOptions),lifetimeMs=options.lifetimeMs??MAX_LIFETIME_MS;
    checkLifetime(lifetimeMs);checkEndpoint(options.endpoint,review,probeOptions);
    if(typeof options.key!=='string' || !options.key.length || Buffer.byteLength(options.key)>4096
      || !/^[A-Za-z0-9._~+\/-]+=*$/u.test(options.key)) fail('credential_unusable');
    const deadline=ownedDeadline===undefined?undefined
      :dataCopy(ownedDeadline,['token','expiresAt','monotonicExpiresAt'],{exact:true});
    if(deadline!==undefined && (deadline.token!==CAPTURE_DEADLINE || !Number.isSafeInteger(deadline.expiresAt)
      || !Number.isFinite(deadline.monotonicExpiresAt))) fail('invalid_local_setup');
    this.#created=now;this.#lastNow=now;this.#clock=clock;this.#options=probeOptions;
    this.#expires=Math.min(now+lifetimeMs,review.reviewedAt+MAX_LIFETIME_MS,deadline?.expiresAt??Infinity);
    this.#monotonicExpires=Math.min(performance.now()+this.#expires-now,deadline?.monotonicExpiresAt??Infinity);
    if(this.#expires<=now || this.#monotonicExpires<=performance.now()) fail('local_deadline_expired');
    this.#endpoint=Buffer.from(options.endpoint,'utf8');this.#key=Buffer.from(options.key,'utf8');
    this.#timer=setTimeout(()=>this.#clear('expired'),Math.max(1,this.#monotonicExpires-performance.now()));this.#timer.unref();
  }
  #clear(state) {
    this.#endpoint?.fill(0);this.#key?.fill(0);this.#endpoint=undefined;this.#key=undefined;
    this.#authorized=false;this.#state=state;clearTimeout(this.#timer);this.#controller?.abort();
  }
  #current() {
    if(!['ready','authorized','attempting'].includes(this.#state)) return false;
    let now;try {now=sampleClock(this.#clock,this.#lastNow);} catch {this.#clear('clock_untrusted');return false;}
    this.#lastNow=now;
    if(now>=this.#expires || performance.now()>=this.#monotonicExpires) {this.#clear('expired');return false;}
    return true;
  }
  review() {
    this.#current();
    return Object.freeze({target:'grok-bot',evidence_kind:'operator_attested_ephemeral_synthetic_setup',session_id:this.#id,
      state:this.#state,created_at:new Date(this.#created).toISOString(),local_expires_at:new Date(this.#expires).toISOString(),
      endpoint_retained:this.#endpoint!==undefined,credential_retained:this.#key!==undefined,
      attempt_authorized:this.#authorized,attempt_consumed:this.#consumed,operator_attestation:true,
      provider_or_account_proof:false,test_mode:this.#options.resolver!==undefined || this.#options.transport!==undefined
        || this.#options.testOnlyLocalTls===true,persistent_storage_used:false,native_profile_enabled:false,
      actual_bot_evaluation_observed:false,m2_gate_satisfied:false});
  }
  authorizeOneSyntheticAttempt(value) {
    if(this.#consumed) fail('attempt_already_consumed');
    if(!this.#current()) fail('local_setup_inactive');
    const authority=dataCopy(value,['session_id','action'],{exact:true});
    if(authority.session_id!==this.#id || authority.action!=='send_one_synthetic_page') fail('invalid_local_authority');
    if(this.#authorized) fail('authorization_already_granted');
    this.#authorized=true;this.#state='authorized';return this.review();
  }
  cancel() {this.#clear('cancelled');return this.review();}
  dispose() {this.#clear('disposed');}
  async attempt(...args) {
    if(this.#consumed) fail('attempt_already_consumed');
    // Even malformed or refused attempts spend the one local attempt. No retry/re-grant path.
    this.#consumed=true;
    let signal;
    try {
      if(args.length>1) fail('invalid_local_setup');
      if(args.length) signal=dataCopy(args[0],['signal'],{exact:true}).signal;
      if(signal!==undefined && !(signal instanceof AbortSignal)) fail('invalid_local_setup');
      if(!this.#current()) fail('local_setup_inactive');
      if(!this.#authorized) fail('synthetic_attempt_not_authorized');
      if(signal?.aborted) fail('local_setup_cancelled');
    } catch(error) {
      const code=errorCode(error,new Set(['invalid_local_setup','local_setup_inactive',
        'synthetic_attempt_not_authorized','local_setup_cancelled']),'invalid_local_setup');
      this.#clear('refused');fail(code);
    }
    this.#state='attempting';this.#controller=new AbortController();
    const abort=()=>this.#clear('cancelled');signal?.addEventListener('abort',abort,{once:true});
    try {
      const probe=new GrokWebhookProbe({
        ...this.#options,endpoint:this.#endpoint.toString('utf8'),
        credentialProvider:{get:()=>{
          if(!this.#current() || !this.#authorized) fail('local_setup_inactive');
          return {endpoint:this.#endpoint.toString('utf8'),key:this.#key.toString('utf8'),
            localExpiresAt:new Date(this.#expires).toISOString()};
        }},
        assertSendAllowed:()=>this.#current() && this.#authorized,
        clock:{trusted:()=>this.#current(),now:()=>this.#lastNow}
      });
      if(signal?.aborted) abort();
      // Probe builds its own fixed synthetic event and returns its native outcome without promoting evidence.
      return await probe.run({signal:this.#controller.signal});
    } catch(error) {
      fail(errorCode(error,safeProbeCodes,'connection_failed'));
    } finally {
      signal?.removeEventListener('abort',abort);
      if(this.#state==='attempting') this.#clear('completed');else this.#clear(this.#state);
      this.#controller=undefined;
    }
  }
}

/** Capture exact destination before key; no arguments/environment/files become connection material. */
export async function captureGrokWebhookConnection(value={}) {
  const options=dataCopy(value,CAPTURE_FIELDS),clock=copyClock(options.clock),started=sampleClock(clock);
  const review=copyReview(options.reviewedSetup,started),probeOptions=copyProbeOptions(options.probeOptions);
  const lifetimeMs=options.lifetimeMs??MAX_LIFETIME_MS,timeoutMs=options.timeoutMs??120000;
  checkLifetime(lifetimeMs);
  if(!Number.isSafeInteger(timeoutMs) || timeoutMs<1 || timeoutMs>120000
    || options.signal!==undefined && !(options.signal instanceof AbortSignal)) fail('invalid_local_setup');
  if(options.signal?.aborted) fail('local_setup_cancelled');
  const expiresAt=Math.min(started+lifetimeMs,review.reviewedAt+MAX_LIFETIME_MS);
  const monotonicExpiresAt=performance.now()+expiresAt-started;
  const controller=new AbortController();let lastNow=started,reason,endpoint,key;
  const abort=()=>{reason??='local_setup_cancelled';controller.abort();};
  const sample=()=>{
    try {lastNow=sampleClock(clock,lastNow);if(lastNow>=expiresAt || performance.now()>=monotonicExpiresAt) fail('local_deadline_expired');return lastNow;}
    catch(error) {reason=errorCode(error,new Set(['clock_untrusted','local_deadline_expired']),'clock_untrusted');
      controller.abort();throw new LocalSetupError(reason);}
  };
  const deadline=setTimeout(()=>{reason='local_deadline_expired';controller.abort();},expiresAt-started);
  const monitor=setInterval(()=>{try {sample();} catch {}},100);monitor.unref();
  options.signal?.addEventListener('abort',abort,{once:true});
  try {
    endpoint=await readHiddenLocalValue({input:options.input,output:options.output,
      prompt:'Exact reviewed webhook address (hidden): ',maxBytes:2048,timeoutMs,signal:controller.signal});
    sample();checkEndpoint(endpoint,review,probeOptions);
    key=await readHiddenLocalValue({input:options.input,output:options.output,
      prompt:'Webhook key (hidden): ',maxBytes:4096,timeoutMs,signal:controller.signal});
    sample();if(options.signal?.aborted) fail('local_setup_cancelled');
    // Preserve the earlier capture deadline; input time cannot renew the local authority.
    return new GrokWebhookConnectionSession({endpoint,key,reviewedSetup:review,
      clock:{trusted:()=>clock.trusted()===true,
        now:()=>{lastNow=sampleClock(clock,lastNow);return lastNow;}},lifetimeMs,probeOptions},
      {token:CAPTURE_DEADLINE,expiresAt,monotonicExpiresAt});
  } catch(error) {
    fail(reason??errorCode(error,safeCaptureCodes,'invalid_local_setup'));
  } finally {
    clearTimeout(deadline);clearInterval(monitor);options.signal?.removeEventListener('abort',abort);
    // Owned byte buffers are erased by the input/session implementations. JS strings cannot be reliably wiped.
    endpoint=undefined;key=undefined;
  }
}
