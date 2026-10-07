import test from 'node:test';import assert from 'node:assert/strict';
import {parseOption,reconcile,scannerComparison,researchDataset} from '../dashboard-broker-logic.js';
const buy={account_key:'test',investment_transaction_id:'b',ticker_symbol:'TEST261006C00100000',transaction_datetime:'2026-10-06T15:00:00Z',type:'buy',name:'buy 1.000 TEST call to open',price:.2,quantity:100,amount:20,fees:.04};
const sell={...buy,investment_transaction_id:'s',transaction_datetime:'2026-10-06T15:30:00Z',type:'sell',name:'sell 1.000 TEST call to close',quantity:-100,amount:-30,price:.3};
const pack=rows=>({format:'broker-review-v1',retrieved_at:'2026-10-07T01:00:00Z',transactions:rows,holdings:[]});
test('standard option parsing rejects malformed dates and adjusted roots',()=>{assert.equal(parseOption('TEST261006P00100000').strike,100);assert.equal(parseOption('TEST261332C00100000'),null);assert.equal(parseOption('TEST1261006C00100000'),null);});
test('reported shares become contracts once; fees deducted once',()=>{const t=reconcile(pack([sell,buy,buy])).trades[0];assert.equal(t.qty,1);assert.ok(Math.abs(t.net-9.92)<1e-8);assert.equal(reconcile(pack([buy,sell])).trades.length,1);});
test('unknown fees remain unknown and malformed pairs fail closed',()=>{assert.equal(reconcile(pack([buy,{...sell,fees:null}])).trades[0].net,null);for(const row of [{...sell,amount:-999},{...sell,quantity:-1},{...sell,transaction_datetime:null},{...sell,name:'sell 1 to open'}])assert.equal(reconcile(pack([buy,row])).trades.length,0);});
test('missing legs, partial fills, conflicting duplicates and separate accounts do not invent P/L',()=>{for(const rows of [[buy],[sell],[buy,sell,{...sell,investment_transaction_id:'s2'}],[buy,{...buy,price:.4},sell],[buy,{...sell,account_key:'other'}]])assert.equal(reconcile(pack(rows)).trades.length,0);});
test('comparison cannot use a later publication or previous session',()=>{
 const t={ticker:'TEST',side:'call',time:'2026-10-06T15:00:00Z'};
 const h=[{scan_id:'prior',generated_at:'2026-10-06T14:50:00Z',dashboard_generated_at:'2026-10-06T14:51:00Z',candidate_state:[{ticker:'TEST',direction:'UP',rank:3}]},{scan_id:'future',generated_at:'2026-10-06T14:59:00Z',dashboard_generated_at:'2026-10-06T15:01:00Z',candidate_state:[]}];
 assert.equal(scannerComparison(t,h).scan_id,'prior');assert.equal(scannerComparison(t,h).direction_aligned,true);assert.equal(scannerComparison({...t,time:'2026-10-07T15:00:00Z'},h).status,'NO_PRIOR_SNAPSHOT');assert.equal(researchDataset(pack([buy,sell]),h).ml_ready,false);
});
