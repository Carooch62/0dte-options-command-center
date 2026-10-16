import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionPayload,restoreSession,SESSION_MAX_AGE} from '../quote-session.js';
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
