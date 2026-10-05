import { readFile, open, mkdir, rename, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonical, parseJson, OapError } from './protocol.mjs';

/** One process owns each embedded file. Multiple processes sharing it are unsupported. */
export class JsonStore {
  #state; #loading; #queue = Promise.resolve();
  constructor(filename, initial = {}, { maxBytes = 32 * 1024 * 1024 } = {}) {
    this.filename = path.resolve(filename); this.initial = structuredClone(initial); this.maxBytes=maxBytes;
  }
  async open() {
    if (!this.#loading) this.#loading = this.#load();
    await this.#loading; return this;
  }
  async #load() {
    try {
      const details = await stat(this.filename); if (!details.isFile() || details.size > this.maxBytes) throw new OapError('storage_unavailable');
      this.#state = parseJson(await readFile(this.filename), this.maxBytes);
      if (!this.#state || Array.isArray(this.#state) || typeof this.#state !== 'object') throw new OapError('storage_unavailable');
    } catch (error) {
      if (error.code === 'ENOENT') { await this.#persist(this.initial); this.#state=structuredClone(this.initial); }
      else throw new OapError('storage_unavailable', 'Local state is unavailable or invalid.');
    }
  }
  async #persist(state) {
    let handle; const temporary = `${this.filename}.${randomUUID()}.tmp`;
    try {
      const bytes=Buffer.from(canonical(state)); if(bytes.length>this.maxBytes) throw new OapError('storage_unavailable');
      await mkdir(path.dirname(this.filename),{recursive:true,mode:0o700});
      handle=await open(temporary,'wx',0o600); await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle=undefined;
      await rename(temporary,this.filename);
      if(process.platform!=='win32') { const directory=await open(path.dirname(this.filename),'r'); try{await directory.sync();}finally{await directory.close();} }
    } catch { if(handle) await handle.close().catch(()=>{}); await unlink(temporary).catch(()=>{}); throw new OapError('storage_unavailable','Local state could not be committed.'); }
  }
  async read() { await this.open(); await this.#queue; return structuredClone(this.#state); }
  peek() { if(!this.#state) throw new OapError('storage_unavailable'); return structuredClone(this.#state); }
  transaction(fn,{afterCommit}={}) {
    const task=this.#queue.then(async()=>{
      await this.open(); const draft=structuredClone(this.#state), result=await fn(draft);
      await this.#persist(draft); this.#state=draft;
      if(afterCommit) afterCommit(result,structuredClone(draft)); // Begin fenced work before releasing the lock.
      return structuredClone(result);
    });
    this.#queue=task.catch(()=>{}); return task;
  }
  async close(){await this.#queue;}
}
