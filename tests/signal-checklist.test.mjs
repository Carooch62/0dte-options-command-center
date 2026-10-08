import test from 'node:test';
import assert from 'node:assert/strict';
import {signalChecklist,earlyWatchVisible,relativeVolumeEvidence} from '../signal-checklist.js';
const now=Date.parse('2026-10-08T15:01:00Z');
const data={generated_at:'2026-10-08T15:00:00Z',market_session:'OPEN',session_open_at:'2026-10-08T13:30:00Z',session_close_at:'2026-10-08T20:00:00Z'};
test('missing signal evidence is unknown, not pass',()=>{
 const c=signalChecklist({bar_end:data.generated_at},data,.1,.3,now);
 assert.equal(c.find(x=>x.label==='Catalyst').state,'UNKNOWN');
 assert.equal(c.find(x=>x.label==='Contract filters').state,'UNKNOWN');
 assert.equal(c.find(x=>x.label==='Pattern · shadow').state,'UNKNOWN');
});
const rvolRow={bar_end:data.generated_at,relative_volume_research:{mode:'SHADOW',status:'READY',method:'LATEST_5M_VS_SAME_ET_SLOT_MEAN',ratio:2.5,baseline_count:3,baseline_sessions:['2026-10-07','2026-10-06','2026-10-05'],slot_et:'10:55',bar_end:data.generated_at,source:'test'}};
test('same-time RVOL is an observation, never a pass gate',()=>{
 const item=relativeVolumeEvidence(rvolRow,data,now);
 assert.equal(item.state,'OBSERVED');assert.match(item.detail,/2.50×/);assert.match(item.detail,/3 prior sessions/);
 const local=signalChecklist({...rvolRow,qualification_checks:{momentum_confirmed:false,acceleration_confirmed:false}},data,.1,.3,now).find(x=>x.label==='Volume confirmation');
 assert.equal(local.state,'FAIL');
});
test('RVOL cannot survive stale data, failed downloads or timestamp mismatch',()=>{
 assert.equal(relativeVolumeEvidence(rvolRow,data,now+10*60000).state,'UNKNOWN');
 assert.equal(relativeVolumeEvidence(rvolRow,{...data,generated_at:null},now).state,'UNKNOWN');
 assert.equal(relativeVolumeEvidence({...rvolRow,bar_end:'2026-10-08T14:55:00Z'},data,now).state,'UNKNOWN');
});
test('RVOL requires enough distinct sessions and a finite ratio',()=>{
 for(const change of [{ratio:null},{ratio:Infinity},{baseline_count:2},{baseline_sessions:['2026-10-07','2026-10-07','2026-10-06']},{status:'INSUFFICIENT_HISTORY'}]){
  assert.equal(relativeVolumeEvidence({...rvolRow,relative_volume_research:{...rvolRow.relative_volume_research,...change}},data,now).state,'UNKNOWN');
 }
});
test('fresh early watch disappears with stale data or failed download',()=>{
 const row={bar_end:data.generated_at,early_watch:true,pattern_research:{mode:'SHADOW'}};
 assert(earlyWatchVisible(row,data,now));
 assert(!earlyWatchVisible(row,data,now+10*60000));
 assert(!earlyWatchVisible(row,{...data,generated_at:null},now));
});
test('checklist respects selected prices and chain failure',()=>{
 const row={bar_end:data.generated_at,chain_attempted:true,chain_status:'SUCCESS',eligible_contracts:[{ask:.2,bid:.19,side:'call',delta:.4,delta_verified:true,quote_valid:true,delta_ok:true,tight_spread:true,option_timestamp:data.generated_at,minimum_delay_minutes:15}]};
 const state=(r,min,max)=>signalChecklist(r,data,min,max,now).find(x=>x.label==='Contract filters').state;
 assert.equal(state(row,.1,.3),'PASS');assert.equal(state(row,.25,.3),'FAIL');
 assert.equal(state({...row,chain_status:'SOURCE_FAILURE'},.1,.3),'UNKNOWN');
});
