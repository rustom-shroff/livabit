import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readHiddenLocalValue } from '../src/experimental/protected-local-input.mjs';

function terminal({raw=false,flowing=false,failEnter=false,failRestore=false,outputFailure=false}={}) {
  const input=new EventEmitter(),written=[],modes=[];
  Object.assign(input,{isTTY:true,isRaw:raw,readableFlowing:flowing,readableEncoding:null,
    setRawMode(value){modes.push(value);if(failEnter && modes.length===1 || failRestore && modes.length===2) throw Error('PRIVATE_TERMINAL_ERROR');this.isRaw=value;},
    resume(){this.readableFlowing=true;},pause(){this.readableFlowing=false;}});
  const output={isTTY:true,write(text){if(outputFailure) throw Error('PRIVATE_OUTPUT_ERROR');written.push(text);}};
  return {input,output,written,modes};
}
const prompt='Connection details (hidden): ';
const read=(t,options={})=>readHiddenLocalValue({input:t.input,output:t.output,prompt,...options});
const clean=t=>{assert.equal(t.input.listenerCount('data'),0);assert.equal(t.input.listenerCount('error'),0);assert.equal(t.input.listenerCount('close'),0);};

test('hidden terminal input yields exact bytes without echo and restores original terminal state',async()=>{
  for(const original of [{raw:false,flowing:false},{raw:true,flowing:true}]) {
    const t=terminal(original),pending=read(t);
    t.input.emit('data',Buffer.from('PRIVATE_LOCAL_SECRET_MARKER\r\n'));
    assert.equal(await pending,'PRIVATE_LOCAL_SECRET_MARKER');
    assert.deepEqual(t.written,[prompt,'\n']);assert(!t.written.join('').includes('PRIVATE_LOCAL_SECRET_MARKER'));
    assert.equal(t.input.isRaw,original.raw);assert.equal(t.input.readableFlowing,original.flowing);clean(t);
  }
});

test('UTF-8 split input and backspace edit the hidden value without printing it',async()=>{
  const t=terminal(),pending=read(t),unicode=Buffer.from('á');
  t.input.emit('data',unicode.subarray(0,1));t.input.emit('data',unicode.subarray(1));
  t.input.emit('data',Buffer.from([127]));t.input.emit('data',Buffer.from('paired-value\r'));
  assert.equal(await pending,'paired-value');assert.equal(t.written.join(''),`${prompt}\n`);clean(t);
});

test('redirected, encoded or concurrently consumed input is rejected before prompting',async()=>{
  for(const mutate of [t=>{t.input.isTTY=false;},t=>{t.output.isTTY=false;},
    t=>{t.input.readableEncoding='utf8';},t=>{t.input.on('data',()=>{});},t=>{t.input.on('readable',()=>{});}]) {
    const t=terminal();mutate(t);await assert.rejects(read(t),{code:'interactive_terminal_required'});
    assert.deepEqual(t.written,[]);assert.deepEqual(t.modes,[]);
  }
  const t=terminal(),first=read(t);
  await assert.rejects(read(t),{code:'interactive_terminal_required'});
  t.input.emit('data',Buffer.from('one-value\r'));assert.equal(await first,'one-value');clean(t);
});

test('empty, oversized, malformed, control and multiline values fail with safe errors',async()=>{
  for(const [bytes,code] of [[Buffer.from('\r'),'invalid_local_value'],[Buffer.from('12345'),'local_value_too_large'],
    [Buffer.from([255,13]),'invalid_local_value'],[Buffer.from('one\rtwo'),'invalid_local_value'],
    [Buffer.from([65,1]),'invalid_local_value']]) {
    const t=terminal(),pending=read(t,{maxBytes:4});t.input.emit('data',bytes);
    await assert.rejects(pending,error=>error.code===code && !error.message.includes('PRIVATE'));
    assert.equal(t.input.isRaw,false);clean(t);
  }
});

test('fragmented multiline paste remains hidden through drain and cannot authorize its first line',async()=>{
  const t=terminal(),pending=read(t);
  t.input.emit('data',Buffer.from('PRIVATE_FIRST\r'));
  assert.equal(t.input.isRaw,true);
  await new Promise(resolve=>setTimeout(resolve,15));
  t.input.emit('data',Buffer.from('PRIVATE_TAIL'));
  assert.equal(t.input.isRaw,true);
  await assert.rejects(pending,{code:'invalid_local_value'});
  assert.equal(t.input.isRaw,false);assert(!t.written.join('').includes('PRIVATE'));clean(t);
  const crlf=terminal(),allowed=read(crlf);
  crlf.input.emit('data',Buffer.from('exact-value\r'));crlf.input.emit('data',Buffer.from('\n'));
  assert.equal(await allowed,'exact-value');clean(crlf);
});

test('keyboard cancellation, abort, close and input failures restore the terminal',async()=>{
  for(const stage of ['ctrl-c','ctrl-d','escape','abort','end','close','error']) {
    const t=terminal(),controller=new AbortController(),pending=read(t,{signal:controller.signal});
    t.input.emit('data',Buffer.from('PRIVATE_PARTIAL'));
    if(stage==='abort') controller.abort();
    else if(stage==='error') t.input.emit('error',Error('PRIVATE_INPUT_ERROR'));
    else if(['end','close'].includes(stage)) t.input.emit(stage);
    else t.input.emit('data',Buffer.from([stage==='ctrl-c'?3:stage==='ctrl-d'?4:27]));
    await assert.rejects(pending,error=>error.code===(stage==='error'?'local_setup_input_failed':'local_setup_cancelled')
      && !error.message.includes('PRIVATE'));
    assert.equal(t.input.isRaw,false);assert(!t.written.join('').includes('PRIVATE'));clean(t);
  }
});

test('timeouts and terminal/output failures are bounded and cannot return a hidden value',async()=>{
  const timeout=terminal();await assert.rejects(read(timeout,{timeoutMs:20}),{code:'local_setup_timeout'});clean(timeout);
  for(const options of [{failEnter:true},{outputFailure:true}]) {
    const t=terminal(options);await assert.rejects(read(t),{code:'local_setup_input_failed'});clean(t);
  }
  const t=terminal({failRestore:true}),pending=read(t);t.input.emit('data',Buffer.from('PRIVATE_SECRET\r'));
  await assert.rejects(pending,{code:'terminal_restore_failed'});clean(t);
});

test('invalid input options and pre-cancelled setup do not alter the terminal',async()=>{
  const controller=new AbortController();controller.abort();
  for(const options of [{maxBytes:8193},{timeoutMs:120001},{prompt:'unsafe\nPrompt'},
    {signal:{}},{signal:controller.signal}]) {
    const t=terminal();await assert.rejects(read(t,options));assert.deepEqual(t.modes,[]);assert.deepEqual(t.written,[]);
  }
});
