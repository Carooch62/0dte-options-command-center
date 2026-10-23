import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionPayload,restoreSession,SESSION_MAX_AGE} from '../quote-session.js';
import {quoteEvidenceInput,captureWindows} from '../quote-evidence.js';
const now=Date.parse('2026-10-16T17:21:00Z');
const snapshot={scan_id:'s',account_id:'secret',candidates:[{ticker:'T',options:[{contract_id:'T',strike:1,side:'call',expiry:'2099-01-01',account_id:'secret'}]}]};
test('storage contains only contract evidence, never tokens or account fields',()=>{
 const p=sessionPayload(snapshot,[{instrument:{id:'abc',access_token:'secret',chain_symbol:'T'},quote:{instrument_id:'abc',account_id:'secret'},received_at:null}],[],'test',now);
 assert.ok(!JSON.stringify(p).includes('secret'));assert.equal(restoreSession(JSON.stringify(p),now).scanner.scan_id,'s');
});
test('expired, future, oversized and malformed sessions are rejected',()=>{
 const p=sessionPayload(snapshot,[],[],'test',now);
 assert.throws(()=>restoreSession(JSON.stringify(p),now+SESSION_MAX_AGE+1));assert.throws(()=>restoreSession(JSON.stringify(p),now-1));
 assert.throws(()=>restoreSession('{'));assert.throws(()=>restoreSession('x'.repeat(2000001)));
 assert.throws(()=>restoreSession(JSON.stringify({...p,history:[{contract_id:'T',observed_at:'2099-01-01',received_at:'2099-01-01'}]}),now));
});
test('bounded recovery prevents unbounded scanner or history storage',()=>{
 assert.throws(()=>sessionPayload({...snapshot,candidates:Array(21).fill(snapshot.candidates[0])},[],[],'test',now));
 assert.equal(sessionPayload(snapshot,[],Array(2001).fill({contract_id:'T'}),'test',now).history.length,2000);
});
const good={contract_id:'T',observed_at:'2026-10-16T17:20:58.000000000Z',received_at:'2026-10-16T17:20:58.500Z',bid:.29,ask:.30,source:'Robinhood Quotes',multiplier:100,quote_check:'QUOTE_CHECK_PASSED',metadata_multiplier:100,quote_check_reasons:[]};
const rejected={...good,observed_at:'2026-10-16T17:20:59.160442632Z',received_at:'2026-10-16T17:20:59.000Z',multiplier:null,quote_check:'REQUIRES_RECHECK',quote_check_reasons:['INVALID_QUOTE_CLOCK'],bid_size:22,ask_size:118,mark_price:.295};
test('recovery preserves an explicitly rejected provider clock and the valid first-passing entry',()=>{
 const history=[good,rejected],requests=[{operation:'quotes',code:'SUCCESS',started_at:'2026-10-16T17:20:58.900Z',finished_at:'2026-10-16T17:20:59.050Z',browser_ms:150}];
 const payload=sessionPayload(snapshot,[],history,'test',now,requests);
 const restored=restoreSession(JSON.stringify(payload),now);
 assert.deepEqual(restored.history,history);assert.deepEqual(restored.requests,payload.requests);
 assert.deepEqual(quoteEvidenceInput(restored.scanner,restored.history).entries,quoteEvidenceInput(snapshot,history).entries);
 assert.equal(quoteEvidenceInput(restored.scanner,restored.history).entries[0].decision_at,good.received_at);
 assert.equal(restored.history[1].multiplier,null);
 assert.deepEqual(quoteEvidenceInput(snapshot,[restored.history[1]]).entries,[]);
 assert.deepEqual(captureWindows([restored.history[1]],now),[]);
});
test('invalid provider clocks without explicit rejection cannot recover as passing evidence',()=>{
 for(const change of [{multiplier:100},{quote_check:'QUOTE_CHECK_PASSED'},{quote_check_reasons:[]},{quote_check_reasons:['WIDE_SPREAD']}]){
  const payload=sessionPayload(snapshot,[],[{...rejected,...change}],'test',now);
  assert.throws(()=>restoreSession(JSON.stringify(payload),now),/observation clock/);
 }
});
test('rejected diagnostics never excuse an invalid or future receipt clock',()=>{
 for(const received_at of ['bad','2026-10-16T17:21:01Z']){
  const payload=sessionPayload(snapshot,[],[{...rejected,received_at}],'test',now);
  assert.throws(()=>restoreSession(JSON.stringify(payload),now),/observation clock/);
 }
});
test('an explicitly rejected unreadable provider timestamp stays diagnostic only',()=>{
 const history=[good,{...rejected,observed_at:'bad-provider-clock'}];
 const restored=restoreSession(JSON.stringify(sessionPayload(snapshot,[],history,'test',now)),now);
 assert.deepEqual(restored.history,history);
 assert.equal(quoteEvidenceInput(snapshot,restored.history).entries.length,1);
});
