import test from 'node:test';import assert from 'node:assert/strict';import {watchTransitions} from './contract-watch.js';
const watch={ticker:'TTD',direction:'UP',contract_id:'TTD261106C00013000',expiry:'2026-11-06'};
const before={scan_id:'a',generated_at:'2026-11-02T14:45:00Z',candidates:[{ticker:'TTD',direction:'UP',execution_state:'WATCH'}]};
const after={scan_id:'b',generated_at:'2026-11-02T14:50:00Z',candidates:[{ticker:'TTD',direction:'UP',execution_state:'TRIGGERED'}]};
const now=Date.parse('2026-11-02T14:51:00Z');
test('one exact-direction transition requires quote recheck',()=>{const a=watchTransitions([watch],before,after,now);assert.equal(a.length,1);assert.equal(a[0].status,'TRIGGERED_RECHECK_REQUIRED')});
test('rejects old, duplicate, missing and reverse-direction data',()=>{
 assert.equal(watchTransitions([watch],before,after,now+11*60_000).length,0);
 assert.equal(watchTransitions([watch],before,{...after,scan_id:'a'},now).length,0);
 assert.equal(watchTransitions([watch],before,{...after,candidates:[]},now).length,0);
 assert.equal(watchTransitions([watch],before,{...after,candidates:[{ticker:'TTD',direction:'DOWN',execution_state:'TRIGGERED'}]},now).length,0);
});
test('rejects an expired option, stale prior scan, and unchanged WATCH state',()=>{
 assert.equal(watchTransitions([{...watch,expiry:'2026-10-30'}],before,after,now).length,0);
 assert.equal(watchTransitions([watch],{...before,generated_at:'2026-11-02T14:55:00Z'},after,now).length,0);
 assert.equal(watchTransitions([watch],before,{...after,candidates:[{ticker:'TTD',direction:'UP',execution_state:'WATCH'}]},now).length,0);
});
