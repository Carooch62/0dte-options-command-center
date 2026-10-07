import test from 'node:test';
import assert from 'node:assert/strict';
import {scannerComparison} from '../dashboard-broker-logic.js';
test('scanner comparison accepts microsecond ISO timestamps on a millisecond-only parser',()=>{
 const original=Date.parse;
 Date.parse=v=>typeof v==='string'&&/\.\d{4,}/.test(v)?NaN:original(v);
 try{
  const c=scannerComparison({time:'2026-10-06T15:57:35Z',ticker:'ABC',side:'call'},[{generated_at:'2026-10-06T15:52:03.597083+00:00',recovered_commit_at:'2026-10-06T15:52:20Z',candidate_state:[{ticker:'ABC',direction:'UP'}]}]);
  assert.equal(c.status,'RESEARCH_COMPARISON');assert.equal(c.direction_aligned,true);
 }finally{Date.parse=original;}
});
