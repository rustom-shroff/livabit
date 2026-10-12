// Ephemeral interactive input only; no file, environment, clipboard or network access.
export class LocalSetupError extends Error {
  constructor(code) { super('Local connection setup could not proceed.'); this.name='LocalSetupError'; this.code=code; }
}

/** Read one bounded UTF-8 value without echo, restoring the terminal on every exit. */
export function readHiddenLocalValue({input,output,prompt,maxBytes=8192,timeoutMs=120000,signal}={}) {
  const reject=code=>Promise.reject(new LocalSetupError(code));
  if(input?.isTTY!==true || output?.isTTY!==true || typeof input.setRawMode!=='function'
    || typeof input.on!=='function' || typeof input.removeListener!=='function' || typeof output.write!=='function'
    || input.readableEncoding || input.listenerCount?.('data')>0 || input.listenerCount?.('readable')>0)
    return reject('interactive_terminal_required');
  if(typeof prompt!=='string' || !/^[A-Za-z0-9 .?:()-]{1,120}$/u.test(prompt)
    || !Number.isSafeInteger(maxBytes) || maxBytes<1 || maxBytes>8192
    || !Number.isSafeInteger(timeoutMs) || timeoutMs<1 || timeoutMs>120000
    || signal!==undefined && !(signal instanceof AbortSignal)) return reject('invalid_local_setup');
  if(signal?.aborted) return reject('local_setup_cancelled');
  return new Promise((resolve,reject)=>{
    const bytes=Buffer.alloc(maxBytes);let length=0,finished=false,timer,drainTimer,drainLimit;
    let finishing=false,pendingError,allowSplitLf=false;
    const wasRaw=input.isRaw===true,wasFlowing=input.readableFlowing===true;
    const cleanup=()=>{
      clearTimeout(timer);clearTimeout(drainTimer);clearTimeout(drainLimit);
      input.removeListener('data',onData);input.removeListener('error',onError);
      input.removeListener('end',onEnd);input.removeListener('close',onEnd);
      signal?.removeEventListener('abort',onAbort);
      let restored=true;
      try {input.setRawMode(wasRaw);if(wasFlowing) input.resume();else input.pause();} catch {restored=false;}
      try {output.write('\n');} catch {}
      return restored;
    };
    const settle=()=>{
      if(finished) return;finished=true;
      let error=pendingError;
      let value;
      if(!error) {
        try {value=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,length));}
        catch {error=new LocalSetupError('invalid_local_value');}
        if(!value?.length) error=new LocalSetupError('invalid_local_value');
      }
      bytes.fill(0);if(!cleanup()) error=new LocalSetupError('terminal_restore_failed');
      if(error) reject(error);else resolve(value);
    };
    const drain=()=>{clearTimeout(drainTimer);drainTimer=setTimeout(settle,100);};
    const finish=error=>{
      if(finished) return;
      if(error) pendingError=error;
      if(!finishing) {finishing=true;clearTimeout(timer);drainLimit=setTimeout(settle,500);}
      // Reject fragmented tails within this bounded capture window while echo remains disabled.
      // Input arriving after restoration is outside the window; arbitrarily delayed tails may echo.
      drain();
    };
    const onAbort=()=>finish(new LocalSetupError('local_setup_cancelled'));
    const onError=()=>finish(new LocalSetupError('local_setup_input_failed'));
    const onEnd=()=>finish(new LocalSetupError('local_setup_cancelled'));
    const onData=chunk=>{
      const incoming=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk,'utf8');
      if(finished) return;
      if(finishing) {
        const permitted=allowSplitLf && incoming.length===1 && incoming[0]===10;
        allowSplitLf=false;
        if(incoming.length && !permitted) pendingError=new LocalSetupError('invalid_local_value');
        drain();return;
      }
      for(let index=0;index<incoming.length;index++) {
        const byte=incoming[index];
        if(byte===3 || byte===4 || byte===27) {onAbort();return;}
        if(byte===10 || byte===13) {
          // Reject multiline/batched paste rather than silently accepting a prefix as authority.
          const rest=incoming.subarray(index+1);
          if(rest.length && !(byte===13 && rest.length===1 && rest[0]===10)) {
            finish(new LocalSetupError('invalid_local_value'));return;
          }
          allowSplitLf=byte===13 && rest.length===0;
          finish();return;
        }
        if(byte===8 || byte===127) {
          if(length) {length--;while(length>0 && (bytes[length]&0xc0)===0x80) length--;bytes.fill(0,length);}
          continue;
        }
        if(byte<32) {finish(new LocalSetupError('invalid_local_value'));return;}
        if(length>=maxBytes) {finish(new LocalSetupError('local_value_too_large'));return;}
        bytes[length++]=byte;
      }
    };
    try {
      input.setRawMode(true);
      input.on('data',onData);input.on('error',onError);input.on('end',onEnd);input.on('close',onEnd);
      signal?.addEventListener('abort',onAbort,{once:true});
      timer=setTimeout(()=>finish(new LocalSetupError('local_setup_timeout')),timeoutMs);
      output.write(prompt);input.resume();if(signal?.aborted) onAbort();
    } catch {finish(new LocalSetupError('local_setup_input_failed'));}
  });
}
