import { performance } from 'node:perf_hooks';
export class SystemClock {
  constructor({wall=Date.now,monotonic=()=>performance.now(),toleranceMs=300000}={}){this.wall=wall;this.monotonic=monotonic;this.wallAnchor=wall();this.elapsedAnchor=monotonic();this.toleranceMs=toleranceMs;}
  now(){return this.wall();}
  elapsed(){return this.monotonic();}
  trusted(){const elapsed=this.monotonic()-this.elapsedAnchor;return elapsed>=0&&Math.abs(this.wall()-(this.wallAnchor+elapsed))<=this.toleranceMs;}
  sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
}
export class ManualClock {
  constructor(now=Date.parse('2026-10-04T00:00:00.000Z')){this.time=typeof now==='string'?Date.parse(now):now;this.ticks=0;this.isTrusted=true;}
  now(){return this.time;}
  elapsed(){return this.ticks;}
  trusted(){return this.isTrusted;}
  advance(ms){this.time+=ms;this.ticks+=Math.max(0,ms);return this.time;}
  set(now){const next=typeof now==='string'?Date.parse(now):now;if(Math.abs(next-this.time)>300000)this.isTrusted=false;this.time=next;}
  sleep(ms){this.advance(ms);return Promise.resolve();}
}
