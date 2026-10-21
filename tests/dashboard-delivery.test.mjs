import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deliverySnapshot,writeDashboardDelivery} from '../scripts/write-dashboard-delivery.mjs';
import {loadDashboardSnapshot} from '../dashboard-delivery.js';
import {expirationView} from '../dashboard-logic.js';
const fixture=()=>({scan_id:'original',generated_at:'2026-10-20T19:00:00Z',market_session:'OPEN',candidates:[{ticker:'TEST',score:4,setup_qualified:false,options:[{ask:.29,option_timestamp:null}],eligible_contracts:[],expiry_groups:{week:{chain_status:'SOURCE_FAILURE',options:[]},month:{options:[{ask:.2,theta:null}]}}}]});
test('initial delivery preserves every same-day field and leaves the full source unchanged',async()=>{
 const full=fixture();full.candidates[0].signed_zero=-0;const original=structuredClone(full),small=deliverySnapshot(full);
 const {expiry_groups,...expected}=full.candidates[0],{expiry_groups:omitted,...actual}=small.candidates[0];
 assert.deepEqual(actual,expected);assert.deepEqual(omitted,{});assert.deepEqual(full,original);
 assert.equal(small.scan_id,full.scan_id);assert.equal(small.generated_at,full.generated_at);
 const dir=await mkdtemp(join(tmpdir(),'dashboard-delivery-'));
 try{const raw=JSON.stringify(full,(_,value)=>Object.is(value,-0)?JSON.rawJSON('-0'):value);await writeFile(join(dir,'market-dashboard.json'),raw);await writeDashboardDelivery(dir);assert.deepEqual(JSON.parse(await readFile(join(dir,'market-dashboard-today.json'),'utf8')),small);assert.equal(await readFile(join(dir,'market-dashboard.json'),'utf8'),raw);}finally{await rm(dir,{recursive:true,force:true});}
});
test('today fetches only its view; later expirations fetch all original research without changing it',async()=>{
 const full=fixture(),calls=[];
 const read=async url=>{calls.push(url);return Response.json(url.includes('-today.json')?deliverySnapshot(full):full);};
 const today=await loadDashboardSnapshot('/data/','today',read);assert.equal(calls.length,1);assert.equal(today.delivery_window,'today');
 for(const window of ['week','two_weeks','month']){const later=await loadDashboardSnapshot('/data/',window,read);assert.deepEqual(later,full);assert.deepEqual(expirationView(later.candidates[0],window),expirationView(full.candidates[0],window));}
 assert.equal(calls.length,4);
});
test('legacy fallback is limited to a missing optional file, and never fabricates unavailable windows',async()=>{
 const full=fixture();let count=0;
 const loaded=await loadDashboardSnapshot('/data/','today',async()=>++count===1?new Response('',{status:404}):Response.json(full));assert.deepEqual(loaded,full);assert.equal(count,2);
 for(const response of [new Response('',{status:503}),Response.json({...deliverySnapshot(full),delivery_window:'month'}),Response.json({candidates:[]})]){
  count=0;await assert.rejects(loadDashboardSnapshot('/data/','today',async()=>{count++;return response;}));assert.equal(count,1);
 }
 await assert.rejects(loadDashboardSnapshot('/data/','unknown',async()=>{throw Error('must not fetch');}),/Unknown expiration/);
});

test('a partial response cannot masquerade as the full later-expiration snapshot',async()=>{await assert.rejects(loadDashboardSnapshot('/data/','week',async()=>Response.json(deliverySnapshot(fixture()))),/Invalid research snapshot/);});
