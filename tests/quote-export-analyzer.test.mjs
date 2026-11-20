import test from 'node:test';import assert from 'node:assert/strict';
import {analyzeExports} from '../scripts/analyze-quote-exports.mjs';
const c={ticker:'TEST',contract_id:'TEST261120C00100000',expiry:'2026-11-20',side:'call',strike:100};
const row={checked_at:'2026-11-19T15:00:00Z',provider_at:'2026-11-19T14:59:59Z',received_at:'2026-11-19T15:00:00Z',duration_ms:100,status:'FRESH_CHECK_PASSED',open_session_verified:true,snapshot_generated_at:'2026-11-19T15:00:00Z',session_open_at:'2026-11-19T14:30:00Z',session_close_at:'2026-11-19T21:00:00Z'};
const pack={format:'private-dashboard-quote-validation-v1',contract:c,samples:[row]};
test('overlapping exports deduplicate, sanitize and keep missing evidence unverified',()=>{const r=analyzeExports([pack,{...pack,access_token:'SECRET'}]);assert.equal(r.duplicate_samples_removed,1);assert.equal(r.contracts[0].passing_open_quotes,1);assert.equal(r.contracts[0].token_renewal_status,'NOT_VERIFIED');assert.ok(!JSON.stringify(r).includes('SECRET'));});
test('conflicting duplicates fail and contracts do not pool',()=>{assert.throws(()=>analyzeExports([pack,{...pack,samples:[{...row,duration_ms:300}]}]),/Conflicting/);assert.equal(analyzeExports([pack,{...pack,contract:{...c,strike:101}}]).contracts.length,2);});
test('claims with future provider clocks are rechecked',()=>{const r=analyzeExports([{...pack,samples:[{...row,provider_at:'2026-11-19T16:00:00Z'}]}]);assert.equal(r.contracts[0].passing_open_quotes,0);});
