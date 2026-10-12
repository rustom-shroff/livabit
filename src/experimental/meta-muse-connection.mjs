// Consumer Muse's native webhook contract is unverified. This module cannot dispatch.
import { randomUUID } from 'node:crypto';
import { LocalSetupError } from './protected-local-input.mjs';

export function getMuseConnectionReadiness() {
  return Object.freeze({target:'meta-muse',evidence_kind:'local_muse_connection_readiness',
    free_with_usage_limit_documented:true,native_webhook_contract_verified:false,
    protected_input_implemented:true,persistent_secure_storage_implemented:false,
    credential_entry_enabled:false,dispatch_enabled:false,native_profile_enabled:false,
    authentication_verified:false,actual_host_accessed:false,m2_gate_satisfied:false,
    needs:'native_webhook_documentation_or_supported_account_setup_contract'});
}

/** Opaque local draft only. Its text is not interpreted as a verified Muse wire credential. */
export class EphemeralMuseConnectionDraft {
  #details;#created;#expires;#lastNow;#clock;#timer;#id=randomUUID();#state='draft';#consumed=false;
  constructor({connectionDetails,clock=()=>Date.now(),lifetimeMs=900000}={}) {
    if(typeof connectionDetails!=='string' || !connectionDetails.length || Buffer.byteLength(connectionDetails)>8192
      || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(connectionDetails)
      || typeof clock!=='function' || !Number.isSafeInteger(lifetimeMs) || lifetimeMs<1 || lifetimeMs>900000)
      throw new LocalSetupError('invalid_local_setup');
    let now;try {now=clock();} catch {throw new LocalSetupError('clock_untrusted');}
    if(!Number.isSafeInteger(now) || now<0 || now>8640000000000000-lifetimeMs)
      throw new LocalSetupError('clock_untrusted');
    this.#clock=clock;this.#created=now;this.#lastNow=now;this.#expires=now+lifetimeMs;
    this.#details=Buffer.from(connectionDetails,'utf8');
    this.#timer=setTimeout(()=>this.#clear('expired'),lifetimeMs);this.#timer.unref();
  }
  #clear(state) {this.#details?.fill(0);this.#details=undefined;clearTimeout(this.#timer);this.#state=state;}
  #current() {
    if(this.#state!=='draft') return false;
    let now;try {now=this.#clock();} catch {this.#clear('clock_untrusted');return false;}
    if(!Number.isSafeInteger(now) || now<this.#lastNow) {this.#clear('clock_untrusted');return false;}
    this.#lastNow=now;
    if(now>=this.#expires) {this.#clear('expired');return false;}
    return true;
  }
  review() {
    this.#current();
    return Object.freeze({target:'meta-muse',evidence_kind:'opaque_ephemeral_connection_draft',session_id:this.#id,
      state:this.#state,created_at:new Date(this.#created).toISOString(),local_expires_at:new Date(this.#expires).toISOString(),
      details_retained:this.#details!==undefined,attempt_consumed:this.#consumed,
      native_webhook_contract_verified:false,dispatch_enabled:false,persistent_storage_used:false,
      actual_host_accessed:false,native_profile_enabled:false,m2_gate_satisfied:false});
  }
  cancel() {this.#clear('cancelled');return this.review();}
  dispose() {this.#clear('disposed');}
  /** Consume local authority and erase the draft before reporting the unsupported native interface. */
  attempt(...args) {
    if(args.length) throw new LocalSetupError('invalid_local_setup');
    if(this.#consumed) throw new LocalSetupError('attempt_already_consumed');
    this.#consumed=true;
    if(!this.#current()) throw new LocalSetupError('local_setup_inactive');
    this.#clear('native_interface_unverified');
    throw new LocalSetupError('native_interface_unverified');
  }
}
