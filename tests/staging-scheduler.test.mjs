import test from 'node:test';import assert from 'node:assert/strict';
import {collectionSnapshotOpen,coordinateStaging,scheduledStagingCollection} from '../staging-scheduler.js';
const now=new Date('2026-11-23T15:10:00Z');
const snapshot={stage:'VALIDATED',status:'DEGRADED',market_session:'OPEN',generated_at:'2026-11-23T15:06:00Z',session_open_at:'2026-11-23T14:30:00Z',session_close_at:'2026-11-23T21:00:00Z'};
const state=()=>{const values=new Map();return {storage:{get:async k=>values.get(k),put:async(k,v)=>values.set(k,v)}};};
test('collection requires fresh real source session bounds and rejects holiday/early close/stale clocks',()=>{
 assert.equal(collectionSnapshotOpen(snapshot,now),true);
 for(const s of [{...snapshot,market_session:'CLOSED'},{...snapshot,generated_at:'2026-11-20T15:06:00Z'},{...snapshot,generated_at:'2026-11-23T15:11:00Z'},{...snapshot,session_close_at:'2026-11-23T15:00:00Z'},{...snapshot,session_open_at:null}])assert.equal(collectionSnapshotOpen(s,now),false);
 assert.equal(collectionSnapshotOpen({...snapshot,generated_at:'2026-11-27T17:55:00Z',session_open_at:'2026-11-27T14:30:00Z',session_close_at:'2026-11-27T18:00:00Z'},new Date('2026-11-27T18:00:00Z')),false);
});
test('dispatch selects staging workflow only and reserves uncertain requests against duplicates',async()=>{
 const s=state(),calls=[];const api=async(path,env,options)=>{calls.push({path,options});if(!options?.method)return {workflow_runs:[]};throw Error('timeout');};
 assert.equal((await (await coordinateStaging(s,{},'staging-slot-1994991',api,0)).json()).status,'dispatch-uncertain');
 assert.equal((await (await coordinateStaging(s,{},'staging-slot-1994991',api,1)).json()).status,'dispatch-pending');
 const dispatch=calls.find(x=>x.options?.method==='POST');assert.equal(dispatch.path,'actions/workflows/staging-scan.yml/dispatches');assert.deepEqual(JSON.parse(dispatch.options.body),{ref:'main',inputs:{request_id:'staging-slot-1994991'}});
 assert.equal((await coordinateStaging(s,{},'bad',()=>{throw Error('no request');})).status,400);
});
test('unfinished and visible duplicate staging runs are not dispatched',async()=>{
 for(const [run,status] of [[{status:'queued'},'already-running'],[{status:'completed',display_title:'Staging staging-slot-1994991'},'already-requested']]){
  let calls=0;const api=async()=>{calls++;return {workflow_runs:[run]};};
  assert.equal((await (await coordinateStaging(state(),{},'staging-slot-1994991',api)).json()).status,status);assert.equal(calls,1);
 }
});
test('preview, disabled and off-hours schedules never fetch or touch the production object',async()=>{
 const fail=()=>{throw Error('must not call');};
 assert.equal(await scheduledStagingCollection({APP_ENV:'preview',STAGING_COLLECTION_ENABLED:'true'},now,fail),'disabled');
 assert.equal(await scheduledStagingCollection({},now,fail),'disabled');
 assert.equal(await scheduledStagingCollection({STAGING_COLLECTION_ENABLED:'true'},new Date('2026-11-23T22:00:00Z'),fail),'outside-session');
 let name,body;const env={STAGING_COLLECTION_ENABLED:'true',GITHUB_TOKEN:'private',SCAN_COORDINATOR:{idFromName:x=>(name=x),get:()=>({fetch:async(url,options)=>{body=JSON.parse(options.body);return Response.json({status:'dispatched'});}})}};
 assert.equal(await scheduledStagingCollection(env,now,async()=>Response.json(snapshot)),'dispatched');assert.equal(name,'prospective-staging-collection');assert.match(body.id,/^staging-slot-/);assert.ok(!JSON.stringify(body).includes('private'));
 assert.equal(await scheduledStagingCollection(env,now,async()=>Response.json({...snapshot,market_session:'CLOSED'})),'no-fresh-open-calendar');
});

test('Worker uses a separate object and fails closed when the feature is disabled',async()=>{
 const {ScanCoordinator}=await import('../worker.js');
 let blocked=0;const owner=new ScanCoordinator({blockConcurrencyWhile:async f=>{blocked++;return f();}},{});
 const r=await owner.fetch(new Request('https://scan-coordinator/staging',{method:'POST',body:JSON.stringify({id:'staging-slot-1994991'})}));
 assert.equal((await r.json()).status,'disabled');assert.equal(blocked,1);
});

test('failed or unfinished health cannot trigger research even with copied OPEN metadata',async()=>{
 const env={STAGING_COLLECTION_ENABLED:'true',GITHUB_TOKEN:'private',SCAN_COORDINATOR:{get:()=>{throw Error('must not dispatch');}}};
 for(const changed of [{status:'FAILED'},{stage:'ARCHIVE'}]) assert.equal(await scheduledStagingCollection(env,now,async()=>Response.json({...snapshot,...changed})),'no-fresh-open-calendar');
});
