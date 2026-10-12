// Isolated synthetic pilot, not a registered OAP adapter or Android publisher.
import https from 'node:https';
import dns from 'node:dns/promises';
import tls from 'node:tls';
import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';
import { canonical, digest, validateEvent } from '../protocol.mjs';
import { validateAddress } from '../direct-adapter.mjs';
import { classifyGrokWebhookAttempt } from './grok-webhook-outcome.mjs';

class ProbeError extends Error {
  constructor(code) { super('Synthetic connection probe could not proceed.'); this.name='ProbeError'; this.code=code; }
}
const fail = code => { throw new ProbeError(code); };
const bareHost = host => host.startsWith('[') ? host.slice(1,-1) : host;
const safeCodes = new Set(['probe_already_used','invalid_probe_setup','destination_rejected','credential_unusable',
  'local_deadline_expired','consent_inactive','clock_untrusted','connection_failed','response_timeout']);
const safeCode = error => error instanceof ProbeError && safeCodes.has(error.code) ? error.code
  : /^(?:ERR_TLS|ERR_SSL|ERR_OSSL|CERT_|DEPTH_ZERO|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER|EPROTO)/u.test(error?.code??'')
    ? 'destination_rejected' : 'connection_failed';
const plainData = (value, fields) => value !== null && typeof value === 'object'
  && [Object.prototype,null].includes(Object.getPrototypeOf(value))
  && Reflect.ownKeys(value).length === fields.length
  && Reflect.ownKeys(value).every(key => typeof key==='string' && fields.includes(key)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));

/** Only fixed example observations; callers cannot supply an activity payload. */
export function createSyntheticWebhookProbeEvent(now) {
  if(!Number.isSafeInteger(now) || now < 900000 || now > 8640000000000000-900000) fail('clock_untrusted');
  const end=Math.floor(now/900000)*900000, start=end-900000;
  const iso=value=>new Date(value).toISOString();
  const event={protocol_version:'0.1.0',event_name:'activity.summary',event_id:randomUUID(),
    recipient_id:randomUUID(),stream_id:randomUUID(),subscription_id:randomUUID(),scope_revision:1,sequence:1,
    emitted_at:iso(now),expires_at:iso(now+900000),
    window:{window_id:randomUUID(),start:iso(start),end:iso(end)},
    summary:{metric:'foreground_duration',unit:'millisecond',aggregation_interval_ms:900000,page_index:0,page_count:1,
      coverage:{status:'complete',observed_intervals:[{start:iso(start),end:iso(end)}],reasons:[]},
      apps:[{application:{namespace:'test.app',id:'example.reader'},foreground_duration_ms:120000},
        {application:{namespace:'test.app',id:'example.video'},foreground_duration_ms:300000}]}};
  validateEvent(event,{now}); return event;
}

/** One explicit synthetic attempt. Protected pairing is supplied by a future setup flow. */
export class GrokWebhookProbe {
  #url; #credentials; #assertAllowed; #clock; #resolver; #transport; #testCa;
  #connectMs; #totalMs; #used=false;
  constructor({endpoint,credentialProvider,assertSendAllowed,clock={now:()=>Date.now(),trusted:()=>true},
    resolver=(host,options)=>dns.lookup(host,options),transport,
    testOnlyLocalTls=false,testCa,connectTimeoutMs=10000,totalTimeoutMs=30000}={}) {
    if(typeof endpoint!=='string' || endpoint.length>2048 || /[\\%\s]/u.test(endpoint)
      || typeof credentialProvider?.get!=='function' || typeof assertSendAllowed!=='function'
      || typeof clock?.now!=='function' || typeof clock?.trusted!=='function' || typeof resolver!=='function'
      || transport!==undefined && typeof transport!=='function' || typeof testOnlyLocalTls!=='boolean'
      || !Number.isSafeInteger(connectTimeoutMs) || connectTimeoutMs<1 || connectTimeoutMs>10000
      || !Number.isSafeInteger(totalTimeoutMs) || totalTimeoutMs<1 || totalTimeoutMs>30000) fail('invalid_probe_setup');
    let url; try { url=new URL(endpoint); } catch { fail('destination_rejected'); }
    if(url.href!==endpoint || url.protocol!=='https:' || url.username || url.password || url.search || url.hash) fail('destination_rejected');
    if(testOnlyLocalTls) {
      if(!['127.0.0.1','[::1]'].includes(url.hostname) || typeof testCa!=='string'
        || testCa.length<1 || Buffer.byteLength(testCa)>65536) fail('invalid_probe_setup');
    } else if(testCa!==undefined || ['localhost','127.0.0.1','[::1]'].includes(url.hostname)) fail('destination_rejected');
    this.#url=url; this.#credentials=credentialProvider; this.#assertAllowed=assertSendAllowed;
    this.#clock=clock; this.#resolver=resolver; this.#transport=transport;
    this.#testCa=testOnlyLocalTls?testCa:undefined; this.#connectMs=connectTimeoutMs; this.#totalMs=totalTimeoutMs;
  }
  #now() {
    let now; try { if(this.#clock.trusted()!==true) fail('clock_untrusted'); now=this.#clock.now(); }
    catch { fail('clock_untrusted'); }
    if(!Number.isSafeInteger(now) || now<900000) fail('clock_untrusted'); return now;
  }
  #allowed(signal) {
    if(signal?.aborted) return false;
    try { return this.#assertAllowed()===true; } catch { return false; }
  }
  #guard(credential,event,signal) {
    if(!this.#allowed(signal)) fail('consent_inactive');
    const now=this.#now();
    if(now<Date.parse(event.emitted_at)) fail('clock_untrusted');
    if(credential.endpoint!==this.#url.href || typeof credential.key!=='string'
      || credential.key.length<1 || credential.key.length>4096 || !/^[A-Za-z0-9._~+\/-]+=*$/u.test(credential.key)) fail('credential_unusable');
    if(typeof credential.localExpiresAt!=='string') fail('local_deadline_expired');
    const expiry=Date.parse(credential.localExpiresAt);
    if(!Number.isFinite(expiry) || new Date(expiry).toISOString()!==credential.localExpiresAt
      || expiry<=now || expiry>now+900000) fail('local_deadline_expired');
    validateEvent(event,{now});
    if(!this.#allowed(signal)) fail('consent_inactive');
  }
  #address(address) {
    try { return validateAddress(address,this.#testCa?'direct-local-tls-v1':'direct-https-v1',
      this.#testCa?[bareHost(this.#url.hostname)]:[]); } catch { fail('destination_rejected'); }
  }
  async run(...args) {
    if(args.length>1 || args.length===1 && !plainData(args[0],['signal'])) fail('invalid_probe_setup');
    const signal=args[0]?.signal;
    if(signal!==undefined && !(signal instanceof AbortSignal)) fail('invalid_probe_setup');
    if(this.#used) fail('probe_already_used'); this.#used=true;
    if(!this.#allowed(signal)) fail('consent_inactive');
    const event=createSyntheticWebhookProbeEvent(this.#now());
    const body=Buffer.from(canonical(event),'utf8');
    const started=performance.now(); let expired=false, prepTimer, prepAbort;
    const prepare=async()=>{
      const value=await this.#credentials.get();
      if(expired) fail('response_timeout');
      if(!plainData(value,['endpoint','key','localExpiresAt'])) fail('credential_unusable');
      const credential=Object.freeze({...value});
      this.#guard(credential,event,signal);
      const host=bareHost(this.#url.hostname);
      const records=isIP(host)?[{address:host}]:await this.#resolver(host,{all:true,verbatim:true});
      if(expired) fail('response_timeout');
      if(!Array.isArray(records) || records.length<1 || records.length>32) fail('destination_rejected');
      const addresses=records.map(record=>this.#address(record?.address));
      this.#guard(credential,event,signal); return {credential,host,selected:addresses[0]};
    };
    let prepared;
    try {
      prepared=await Promise.race([prepare(),new Promise((_,reject)=>{
        prepTimer=setTimeout(()=>{expired=true;reject(new ProbeError('response_timeout'));},Math.min(this.#connectMs,this.#totalMs));
        if(signal) {
          prepAbort=()=>{expired=true;reject(new ProbeError('consent_inactive'));};
          signal.addEventListener('abort',prepAbort,{once:true}); if(signal.aborted) prepAbort();
        }
      })]);
    } catch(error) { throw new ProbeError(safeCode(error)); }
    finally { clearTimeout(prepTimer); if(prepAbort) signal.removeEventListener('abort',prepAbort); }
    const {credential,host,selected}=prepared;
    if(performance.now()-started>=Math.min(this.#connectMs,this.#totalMs)) fail('response_timeout');
    this.#guard(credential,event,signal);
    return new Promise(resolve=>{
      let request,response,complete=false,bodyWritten=false,connectTimer,totalTimer,responseStatus=null;
      const finish=error=>{
        if(complete) return; complete=true;
        clearTimeout(connectTimer); clearTimeout(totalTimer);
        if(signal) signal.removeEventListener('abort',abort);
        // HTTP status is already enough for this native interface; consume no untrusted response body.
        request?.destroy(); response?.destroy();
        const localConsentActive=this.#allowed(signal);
        const outcome=classifyGrokWebhookAttempt({requestBodyWritten:bodyWritten,responseStatus,
          connectionFailed:!!error,localConsentActive});
        resolve(Object.freeze({evidence_kind:'synthetic_only_webhook_probe',event_id:event.event_id,
          body_sha256:digest(body),body_submission_attempted:bodyWritten,response_status:responseStatus,
          transport_error:error?safeCode(error):null,transport_backend:this.#transport?'injected_test':'node_https',
          test_only_local_tls:!!this.#testCa,outcome_model:outcome,native_profile_enabled:false,
          actual_bot_evaluation_observed:false,m2_gate_satisfied:false}));
      };
      const abort=()=>finish(new ProbeError('consent_inactive'));
      const options={method:'POST',agent:false,maxHeaderSize:16384,minVersion:'TLSv1.2',maxVersion:'TLSv1.3',
        rejectUnauthorized:true,servername:isIP(host)?'':host,...(this.#testCa?{ca:this.#testCa}:{}),
        checkServerIdentity:(_host,cert)=>tls.checkServerIdentity(host,cert),
        headers:{Authorization:`Bearer ${credential.key}`,'Content-Type':'application/json',
          'Content-Length':String(body.length),'Cache-Control':'no-store'},
        lookup:(_host,lookupOptions,callback)=>{
          if(typeof lookupOptions==='function') {callback=lookupOptions;lookupOptions={};}
          if(lookupOptions?.all) callback(null,[{address:selected.address,family:selected.family}]);
          else callback(null,selected.address,selected.family);
        }};
      try {
        request=(this.#transport??https.request)(new URL(this.#url.href),options,incoming=>{
          if(complete) {incoming.destroy();return;}
          response=incoming;
          if(!bodyWritten || !Number.isInteger(incoming.statusCode) || incoming.statusCode<200 || incoming.statusCode>599) {
            finish(new ProbeError('connection_failed')); return;
          }
          responseStatus=incoming.statusCode; finish();
        });
        request.once('error',error=>finish(error));
        request.once('socket',socket=>{
          const verifyAndWrite=()=>{
            if(complete || bodyWritten) return;
            try {
              if(socket.authorized!==true || this.#address(socket.remoteAddress).address!==selected.address) fail('destination_rejected');
              this.#guard(credential,event,signal);
              clearTimeout(connectTimer); bodyWritten=true;
              // Headers and body wait for authenticated peer and the last synchronous local fence.
              // Mark possible submission before end(): a throwing/partial write is still ambiguous.
              request.end(body);
            } catch(error) {finish(error);}
          };
          socket.once('secureConnect',verifyAndWrite);
          if(!socket.connecting && socket.secureConnecting===false) verifyAndWrite();
        });
        if(complete) {request.destroy();return;}
        const elapsed=performance.now()-started;
        connectTimer=setTimeout(()=>finish(new ProbeError('response_timeout')),Math.max(1,this.#connectMs-elapsed));
        totalTimer=setTimeout(()=>finish(new ProbeError('response_timeout')),Math.max(1,this.#totalMs-elapsed));
        if(signal) {signal.addEventListener('abort',abort,{once:true});if(signal.aborted) abort();}
      } catch(error) {finish(error);}
    });
  }
}
