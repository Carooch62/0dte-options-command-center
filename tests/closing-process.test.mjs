import test from 'node:test';import assert from 'node:assert/strict';import {scannerComparison} from '../dashboard-broker-logic.js';
const trade={ticker:'F',side:'put',strike:11.5,expiry:'2026-11-20',time:'2026-11-17T15:00:00Z',entry_fill_at:'2026-11-17T15:00:00Z'};
const scan={scan_id:'prior',generated_at:'2026-11-17T14:59:00Z',candidate_state:[{ticker:'F',direction:'UP',setup_qualified:false}]};
test('execution-time comparisons flag direction and exclude future available snapshots',()=>{
 const later={...scan,scan_id:'future',generated_at:'2026-11-17T15:01:00Z'};
 assert.equal(scannerComparison(trade,[later,scan]).comparison_grade,'DIRECTION_MISMATCH');
 assert.equal(scannerComparison(trade,[{...scan,recovered_commit_at:'2026-11-17T15:01:00Z'}]).status,'NO_PRIOR_SNAPSHOT');
 assert.equal(scannerComparison({...trade,entry_fill_at:null},[scan]).comparison_grade,'PROVISIONAL_PROVIDER_TIME');
 assert.equal(scannerComparison({...trade,time:'2026-11-17T15:10:00Z'},[scan]).comparison_grade,'STALE_SCAN');
});
