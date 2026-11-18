import test from 'node:test';import assert from 'node:assert/strict';
import {evidenceRecords,mergeEvidence} from '../private-evidence.js';
import {RobinhoodCoordinator,handleRobinhood} from '../robinhood-live.js';
const context={kind:'option',received_at:'2026-11-17T15:00:01Z',scan_id:'scan-1',generated_at:'2026-11-17T15:00:00Z'};
const observations=[{quote:{instrument_id:'uuid',updated_at:'2026-11-17T15:00:00Z',bid_price:'.20',ask_price:'.22',account_number:'SECRET'},instrument:{id:'uuid',chain_symbol:'TEST',account_number:'SECRET'}}];
test('quote evidence is allowlisted, timestamped, not executions, and idempotent',()=>{
 const records=evidenceRecords(observations,context);assert.doesNotMatch(JSON.stringify(records),/SECRET|account_number/);assert.equal(records[0].execution,false);
 assert.equal(mergeEvidence(records,records).records.length,1);
 assert.throws(()=>mergeEvidence(records,[{...records[0],quote:{...records[0].quote,ask_price:'.30'}}]),/Conflicting/);
 assert.throws(()=>evidenceRecords(observations,{...context,generated_at:'2026-11-17T15:10:00Z'}),/clock/);
});
test('private coordinator encrypts quotes, exports original clocks, and survives re-instantiation',async()=>{
 const values=new Map();const storage={get:async k=>values.get(k),put:async(k,v)=>values.set(k,v),delete:async k=>values.delete(k)};
 const state={storage,blockConcurrencyWhile:fn=>fn()};const env={PLAID_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')};
 const call=async(owner,path,body)=>(await owner.fetch(new Request('https://internal'+path,{method:'POST',body:JSON.stringify(body)}))).json();
 const owner=new RobinhoodCoordinator(state,env);
 await call(owner,'/evidence-write',{observations,context});await call(owner,'/evidence-write',{observations,context});
 assert.doesNotMatch(JSON.stringify([...values.values()]),/ask_price|instrument_id|uuid/);
 const result=await call(new RobinhoodCoordinator(state,env),'/evidence-read',{day:'2026-11-17'});
 assert.equal(result.records.length,1);assert.equal(result.records[0].quote.updated_at,observations[0].quote.updated_at);
 assert.equal((await handleRobinhood(new Request('https://test/private/plaid/robinhood/evidence'),{})).status,401);
});
