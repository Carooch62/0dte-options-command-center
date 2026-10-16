import test from 'node:test';
import assert from 'node:assert/strict';
import {scannerFromEvidencePacket,validationTiming,quoteEvidenceInput,VALIDATION_MINUTES} from '../quote-evidence.js';
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

