import test from 'node:test';import assert from 'node:assert/strict';
import {displayState,selectableContracts,requestPublished,tradePL,riskSummary,validTrade} from '../dashboard-logic.js';
import worker from '../worker.js';
const now=Date.parse('2026-09-30T14:00:00Z');const data={generated_at:'2026-09-30T13:59:00Z',market_session:'OPEN',session_open_at:'2026-09-30T13:30:00Z',session_close_at:'2026-09-30T20:00:00Z'};
test('expired cards demote without new scan',()=>{const r={bar_end:data.generated_at,execution_state:'TRIGGERED'};assert.equal(displayState(r,data,now),'TRIGGERED');assert.equal(displayState(r,data,now+10*60000),'DATA UNAVAILABLE');});
test('unknown quote time never shows confirmation',()=>{assert.equal(displayState({bar_end:data.generated_at,execution_state:'CONFIRMED',preferred_contracts:[{}]},data,now),'WATCH');});
test('matching run required',()=>{assert.equal(requestPublished({scan_id:'other'},'requested'),false);assert.equal(requestPublished({scan_id:'requested'},'requested'),true);});
test('price filters include retained higher-priced contracts',()=>{const r={eligible_contracts:[{ask:.4,quote_valid:true,delta_ok:true,tight_spread:true}]};assert.equal(selectableContracts(r).length,0);assert.equal(selectableContracts(r,.1,.5).length,1);});
test('journal and risk use fees and open positions',()=>{const t={ticker:'TEST',contract:'C',time:'2026-09-30T13:30:00Z',entry:.2,exit:.3,qty:2,fees:1.3};assert(validTrade(t));assert(Math.abs(tradePL(t)-18.7)<1e-8);assert(!validTrade({...t,qty:1.5}));const r=riskSummary({perTrade:20,maxExposure:50},[{...t,exit:null}],.25,1,new Date(now));assert.equal(r.alerts.length,2);});
test('worker rejects invalid requests before GitHub access',async()=>{const r=await worker.fetch(new Request('https://example.org/refresh',{method:'POST',headers:{Origin:'https://carooch62.github.io','Content-Type':'application/json'},body:JSON.stringify({request_id:'bad'})}),{GITHUB_TOKEN:'test'});assert.equal(r.status,400);});
test('worker passes request id and filters run status',async()=>{const old=globalThis.fetch;let body;globalThis.fetch=async(url,opts)=>{if(url.endsWith('/dispatches')){body=JSON.parse(opts.body);return new Response(null,{status:204});}return Response.json({workflow_runs:[{id:1,display_title:'Scan other-run (manual)',status:'completed'},{id:2,display_title:'Scan wanted-id (manual)',status:'in_progress'}]});};try{const r=await worker.fetch(new Request('https://example.org/refresh',{method:'POST',headers:{Origin:'https://carooch62.github.io','Content-Type':'application/json'},body:JSON.stringify({request_id:'wanted-id'})}),{GITHUB_TOKEN:'test'});assert.equal(r.status,202);assert.equal(body.inputs.request_id,'wanted-id');const h=await worker.fetch(new Request('https://example.org/health?request_id=wanted-id'),{GITHUB_TOKEN:'test'});assert.equal((await h.json()).latestRun.id,2);}finally{globalThis.fetch=old;}});
test('worker CORS preflight has empty 204 body',async()=>{const r=await worker.fetch(new Request('https://example.org/refresh',{method:'OPTIONS',headers:{Origin:'https://carooch62.github.io'}}),{});assert.equal(r.status,204);assert.equal(await r.text(),'');});

import {refreshProgress,publishedReceipt} from '../refresh-progress.js';
const step=(name,status,conclusion=null)=>({name,status,conclusion});
test('refresh progress follows actual scan and publication steps',()=>{
 const scan=step('Scan, enrich, and validate','in_progress');
 let p=refreshProgress({run:{status:'in_progress',steps:[scan]}});
 assert.equal(p[2].state,'done');assert.equal(p[3].state,'active');assert.equal(p[4].state,'waiting');
 p=refreshProgress({run:{status:'completed',conclusion:'success',steps:[{...scan,status:'completed',conclusion:'success'},step('Publish validated data or failure health','completed','success')]}});
 assert.equal(p[4].state,'done');assert.equal(p[5].state,'active');
 assert(refreshProgress({published:true}).every(s=>s.state==='done'));
});
test('failed scan cannot appear published by failure-health commit',()=>{
 const p=refreshProgress({run:{status:'completed',conclusion:'failure',steps:[step('Scan, enrich, and validate','completed','failure'),step('Publish validated data or failure health','completed','success')]}});
 assert.equal(p[3].state,'failed');assert.equal(p[4].state,'waiting');assert.equal(p[5].state,'waiting');
});
test('missing job details do not invent a failed stage',()=>{
 const p=refreshProgress({run:{status:'completed',conclusion:'success',steps:[]}});
 assert(!p.some(s=>s.state==='failed'));assert.equal(p[5].state,'active');
});
test('uncertain dispatch remains pending; prior published requests remain verifiable',()=>{
 assert.equal(refreshProgress({requestStatus:'unknown'})[0].state,'active');
 assert.equal(publishedReceipt({scan_id:'newer'},[{scan_id:'mine',generated_at:'time'}],'mine').generated_at,'time');
 assert.equal(publishedReceipt({scan_id:'newer'},[],'mine'),null);
});
