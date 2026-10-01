import test from 'node:test';import assert from 'node:assert/strict';
import {displayState,selectableContracts,requestPublished,tradePL,riskSummary,validTrade} from '../dashboard-logic.js';
import worker from '../worker.js';
const now=Date.parse('2026-09-30T14:00:00Z');const data={generated_at:'2026-09-30T13:59:00Z',market_session:'OPEN',session_open_at:'2026-09-30T13:30:00Z',session_close_at:'2026-09-30T20:00:00Z'};
test('expired cards demote without new scan',()=>{const r={bar_end:data.generated_at,execution_state:'TRIGGERED'};assert.equal(displayState(r,data,now),'TRIGGERED');assert.equal(displayState(r,data,now+10*60000),'STALE PRICE DATA');});
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

import {dataStatus} from '../dashboard-logic.js';
import {scheduledScan,regularWeekday} from '../worker.js';
test('stale bars, stale snapshots and missing downloads have distinct explanations',()=>{
 assert.equal(dataStatus({bar_end:'2026-09-30T13:45:00Z'},data,now).state,'STALE PRICE DATA');
 assert.match(dataStatus({bar_end:'2026-09-30T13:45:00Z'},data,now).detail,/15.0 min/);
 assert.equal(dataStatus({bar_end:data.generated_at},{...data,generated_at:'2026-09-30T13:45:00Z'},now).state,'STALE SCAN');
 assert.equal(dataStatus({bar_end:data.generated_at},{...data,generated_at:null},now).state,'DATA UNAVAILABLE');
 assert.equal(dataStatus({bar_end:data.generated_at},data,now),null);
});
test('scheduler respects New York hours in winter and summer',()=>{
 assert(regularWeekday(new Date('2026-09-30T13:31:00Z')));
 assert(!regularWeekday(new Date('2026-09-30T20:01:00Z')));
 assert(!regularWeekday(new Date('2026-12-01T14:01:00Z')));
 assert(regularWeekday(new Date('2026-12-01T14:31:00Z')));
 assert(!regularWeekday(new Date('2026-10-03T15:00:00Z')));
});
test('scheduler skips queued/recent runs and dispatches when overdue',async()=>{
 const old=globalThis.fetch;let runs=[],sent=0;
 globalThis.fetch=async(url,opts)=>{if(url.endsWith('/dispatches')){sent++;assert.match(JSON.parse(opts.body).inputs.request_id,/^scheduled-/);return new Response(null,{status:204});}return Response.json({workflow_runs:runs});};
 try{
 const env={GITHUB_TOKEN:'test'},clock=new Date(now);
 assert.equal(await scheduledScan(env,clock),'dispatched');assert.equal(sent,1);
 runs=[{status:'queued',created_at:'2026-09-30T13:00:00Z'}];assert.equal(await scheduledScan(env,clock),'already-running');
 runs=[{status:'completed',display_title:'Scan scheduled-'+Math.floor(now/300000)+' (manual)'}];assert.equal(await scheduledScan(env,clock),'already-requested');assert.equal(sent,1);
 runs=[{status:'completed',display_title:'Scan user-request (manual)',created_at:'2026-09-30T13:58:00Z'}];assert.equal(await scheduledScan(env,clock),'dispatched');assert.equal(sent,2);
 assert.equal(await scheduledScan(env,new Date('2026-09-30T22:00:00Z')),'outside-session');
 }finally{globalThis.fetch=old;}
});

import {contractExplanation,contractRank} from '../dashboard-logic.js';
test('contract messages distinguish coverage, missing delta and low delta',()=>{
 assert.match(contractExplanation({chain_status:'NOT_SCANNED'}),/not scanned/);
 assert.match(contractExplanation({chain_status:'SOURCE_FAILURE'}),/source failed/);
 assert.match(contractExplanation({chain_status:'NO_EXPIRATION_TODAY'}),/no contracts expiring today/);
 const base={ask:.2,bid:.19,side:'put',delta:-.1,delta_verified:true,quote_valid:true,tight_spread:true,volume:100,near_atm:true,direction_aligned:true,expiry_verified:true};
 assert.match(contractExplanation({options:[base]}),/1 absolute delta below 0.25/);
 assert(!contractExplanation({options:[base]}).includes('delta missing'));
 assert.match(contractExplanation({options:[{...base,delta:null,delta_verified:false}]}),/1 delta missing/);
 assert.match(contractExplanation({options:[{...base,ask:.8}]}),/None of the 1 returned/);
 assert.equal(contractRank({chain_status:'NOT_SCANNED'}),0);
 assert.equal(contractRank({chain_status:'SUCCESS',options:[base]}),1);
});

import {recordedState,matchesState,robinhoodStockUrl,snapshotUsable} from '../dashboard-logic.js';
test('stale data retains recorded status without making it current',()=>{
 const row={execution_state:'TRIGGERED',bar_end:data.generated_at},later=now+10*60000;
 assert.equal(recordedState(row),'TRIGGERED');
 assert.equal(displayState(row,data,later),'STALE PRICE DATA');
 assert(matchesState(row,data,'TRIGGERED',later));
 assert(!matchesState(row,data,'STALE PRICE DATA',later));
 assert(!snapshotUsable(data,later));
});
test('Robinhood links target a stock page and reject invalid symbols',()=>{
 assert.equal(robinhoodStockUrl('spy'),'https://robinhood.com/stocks/SPY');
 assert.equal(robinhoodStockUrl('BRK.B'),'https://robinhood.com/stocks/BRK.B');
 assert.equal(robinhoodStockUrl('SPY?order=buy'),null);
 assert.equal(robinhoodStockUrl(''),null);
});

test('recorded setup survives unavailable execution data without becoming a live signal',()=>{
 const row={execution_state:'DATA UNAVAILABLE',bar_end:data.generated_at,last_status:{state:'TRIGGERED',observed_at:data.generated_at}};
 assert.equal(recordedState(row),'TRIGGERED');
 assert(matchesState(row,data,'TRIGGERED',now+10*60000));
 assert.equal(displayState(row,data,now+10*60000),'STALE PRICE DATA');
 assert.equal(recordedState({execution_state:'DATA UNAVAILABLE'}),'NO RECORDED STATUS');
});

import {closedReceipt} from '../refresh-progress.js';
test('closed request finishes without pretending a new snapshot was published',()=>{
 const health={status:'CLOSED',request_id:'wanted',updated_at:'2026-10-01T00:57:00Z'};
 assert.equal(closedReceipt([],health,'other'),null);
 const receipt=closedReceipt([],health,'wanted');assert.equal(receipt.status,'CLOSED');
 assert.equal(closedReceipt([{...receipt,scan_id:'wanted'}],{...health,request_id:'later'},'wanted').status,'CLOSED');
 assert.equal(publishedReceipt({},[receipt],'wanted'),null);
 const steps=refreshProgress({closed:true});
 assert(!steps.some(s=>s.state==='active'));
 assert.equal(steps.find(s=>s.id==='scan').state,'skipped');
 assert.equal(steps.at(-1).label,'Market closed');
});
