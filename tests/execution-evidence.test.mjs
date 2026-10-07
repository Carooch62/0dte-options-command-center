import test from 'node:test';import assert from 'node:assert/strict';
import {applyExecutionEvidence,validateExecutionPack} from '../execution-evidence.js';
const trade={symbol:'ABC261009C00010000',qty:1,entry:.2,exit:.3,time:'2026-10-07T14:00:30Z',source_ids:['b','s']};
const record=(action='buy')=>({transaction_id:action==='buy'?'b':'s',symbol:trade.symbol,action,qty:1,price:action==='buy'?.2:.3,filled_at:action==='buy'?'2026-10-07T14:02:00Z':'2026-10-07T14:10:00Z',precision:'minute',source_ref:'Broker filled-order screenshot'});
test('minute screenshots preserve precision and do not become exact executions',()=>{const r=applyExecutionEvidence([trade],[record(),record('sell')]);assert.equal(r.rows[0].comparison_at,'2026-10-07T14:02:00Z');assert.equal(r.rows[0].execution_time_verified,false);assert.equal(r.issues.length,0);});
test('contract mismatch cannot attach execution evidence',()=>{const r=applyExecutionEvidence([trade],[{...record(),symbol:'XYZ261009C00010000'}]);assert.equal(r.rows[0].entry_fill_at,null);assert.ok(r.issues.length);});
test('duplicate evidence is rejected',()=>assert.throws(()=>validateExecutionPack({format:'execution-review-v1',records:[record(),record()]})));
test('close before entry rejects both times',()=>{const r=applyExecutionEvidence([trade],[record(),{...record('sell'),filled_at:'2026-10-07T13:50:00Z'}]);assert.equal(r.rows[0].entry_fill_at,undefined);assert.ok(r.issues.length);});
