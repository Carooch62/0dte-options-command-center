import test from 'node:test';
import assert from 'node:assert/strict';
import {scannerFromEvidencePacket,validationTiming,quoteEvidenceInput,VALIDATION_MINUTES,captureWindows} from '../quote-evidence.js';
const packet=()=>({format:'shadow-evidence-v1',packet_id:'a'.repeat(64),scan_id:'test',generated_at:'2026-10-15T13:36:00Z',captured_at:'2026-10-15T13:37:00Z',market_session:'OPEN',candidates:[{candidate_id:'TEST',ticker:'TEST',contract:{contract_id:'TEST',strike:100,side:'call',expiry:'2026-10-16'}}]});
test('validation loader preserves packet identity and exact contract cohort',()=>{
 const p=packet(),s=scannerFromEvidencePacket(p);assert.equal(s.candidates[0].options[0].contract_id,'TEST');assert.equal(s.packet_id,p.packet_id);assert.equal(quoteEvidenceInput(s,[]).scanner_context.packet_id,p.packet_id);
 assert.throws(()=>scannerFromEvidencePacket({...p,candidates:[...p.candidates,...p.candidates]}));
});
test('countdown uses receipt cutoff and distinguishes missing from captured windows',()=>{
 const q={contract_id:'TEST',observed_at:'2026-10-15T13:40:00Z',received_at:'2026-10-15T13:40:02Z',multiplier:100};
 assert.match(validationTiming([q],Date.parse('2026-10-15T13:45:02Z')),/5-min: 0\/1 captured · refresh now/);
 assert.match(validationTiming([q],Date.parse('2026-10-15T13:46:03Z')),/1 missing windows/);
 const later={...q,observed_at:'2026-10-15T13:45:02Z',received_at:'2026-10-15T13:45:05Z'};
 assert.match(validationTiming([q,later],Date.parse(later.received_at)),/5-min: 1\/1 captured/);
 assert.match(validationTiming([]),/first passing fetched quote/);
});
test('export and page use the same 5/10/15 policy; early market clocks do not satisfy a window',()=>{
 assert.deepEqual(VALIDATION_MINUTES,[5,10,15]);assert.deepEqual(quoteEvidenceInput(null,[]).validation_policy.horizons_minutes,[5,10,15]);
 const q={contract_id:'T',observed_at:'2026-10-16T17:00:00Z',received_at:'2026-10-16T17:00:02Z',multiplier:100};
 const early={...q,observed_at:'2026-10-16T17:05:01Z',received_at:'2026-10-16T17:05:04Z'};
 assert.match(validationTiming([q,early],Date.parse(early.received_at)),/5-min: 0\/1 captured/);
 const valid={...early,observed_at:'2026-10-16T17:05:02Z'};
 assert.match(validationTiming([q,valid],Date.parse(valid.received_at)),/5-min: 1\/1 captured/);
});
test('closing countdown, failed captures and staggered contracts keep immutable per-contract clocks',()=>{
 const q={contract_id:'T',observed_at:'2026-10-20T14:00:00Z',received_at:'2026-10-20T14:00:02Z',multiplier:100,quote_check:'QUOTE_CHECK_PASSED'};
 const failed={...q,observed_at:'2026-10-20T14:05:20Z',received_at:'2026-10-20T14:05:21Z',multiplier:null,quote_check:'REQUIRES_RECHECK'};
 const late={...q,contract_id:'U',received_at:'2026-10-20T14:02:02Z'};
 const now=Date.parse('2026-10-20T14:05:32Z'),rows=captureWindows([q,failed,late],now);
 assert.deepEqual(rows.filter(r=>r.minutes===5).map(r=>[r.state,r.seconds,r.failed_checks]),[['OPEN',30,true],['UPCOMING',90,false]]);
 assert.match(validationTiming([q,failed,late],now),/closes in 0:30/);
 assert.equal(captureWindows([q,failed],Date.parse('2026-10-20T14:06:03Z'))[0].state,'MISSING');
 const valid={...failed,multiplier:100,quote_check:'QUOTE_CHECK_PASSED'};
 assert.equal(captureWindows([q,valid],now)[0].state,'CAPTURED');
 assert.equal(quoteEvidenceInput(null,[q,valid]).entries[0].decision_at,q.received_at);
});

