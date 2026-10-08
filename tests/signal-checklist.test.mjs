import test from 'node:test';
import assert from 'node:assert/strict';
import {signalChecklist,earlyWatchVisible} from '../signal-checklist.js';
const now=Date.parse('2026-10-08T15:01:00Z');
const data={generated_at:'2026-10-08T15:00:00Z',market_session:'OPEN',session_open_at:'2026-10-08T13:30:00Z',session_close_at:'2026-10-08T20:00:00Z'};
test('missing signal evidence is unknown, not pass',()=>{
 const c=signalChecklist({bar_end:data.generated_at},data,.1,.3,now);
 assert.equal(c.find(x=>x.label==='Catalyst').state,'UNKNOWN');
 assert.equal(c.find(x=>x.label==='Contract filters').state,'UNKNOWN');
 assert.equal(c.find(x=>x.label==='Pattern · shadow').state,'UNKNOWN');
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
