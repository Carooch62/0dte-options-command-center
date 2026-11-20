import test from 'node:test';import assert from 'node:assert/strict';
import {validationSample,validationReport} from '../dashboard-quote-validation.js';
const at='2026-11-19T15:00:00Z',now=Date.parse(at),snapshot={market_session:'OPEN',generated_at:at,session_open_at:'2026-11-19T14:30:00Z',session_close_at:'2026-11-19T21:00:00Z'};
const sample=(time=now)=>validationSample({view:{status:'FRESH QUOTE · CHECKS PASSED',observed_at:new Date(time-1000).toISOString(),received_at:new Date(time).toISOString(),bid_price:'SECRET'},snapshot:{...snapshot,generated_at:new Date(time).toISOString()},duration_ms:250,error_code:'SECRET',access_token:'SECRET'},time);
test('private quote evidence excludes arbitrary credentials and prices; missing acceptance stays missing',()=>{const report=validationReport([sample()],now);assert.equal(report.passing_open_quotes,1);assert.equal(report.speed_sample_requirement_met,false);assert.equal(report.token_renewal_status,'NOT_VERIFIED');assert.ok(!JSON.stringify(report).includes('SECRET'));assert.ok(report.windows.every(x=>x.status==='MISSING'));});
test('only observed same-session windows pass; no interpolation or stale clock acceptance',()=>{
 const report=validationReport([sample(),sample(now+5*60000),sample(now+11*60000),sample(now+17*60000)],now+17*60000);assert.deepEqual(report.windows.map(w=>w.status),['OBSERVED','OBSERVED','MISSING']);
 const bad=validationSample({view:{status:'FRESH QUOTE · CHECKS PASSED',observed_at:'2026-11-19T14:00:00Z',received_at:at},snapshot,duration_ms:1},now);assert.equal(bad.status,'QUOTE_REQUIRES_REVIEW');
 assert.equal(validationSample({view:null,error_code:'SIGN_IN',snapshot,duration_ms:1},now).status,'SIGN_IN');
});
test('speed sample threshold needs multiple verified OPEN sessions; no after-hours samples count',()=>{
 const many=Array.from({length:20},(_,i)=>sample(now+i*60000));assert.equal(validationReport(many).speed_sample_requirement_met,false);
 const next=validationSample({view:{status:'FRESH QUOTE · CHECKS PASSED',observed_at:'2026-11-20T15:00:00Z',received_at:'2026-11-20T15:00:00Z'},snapshot:{market_session:'OPEN',generated_at:'2026-11-20T15:00:00Z',session_open_at:'2026-11-20T14:30:00Z',session_close_at:'2026-11-20T21:00:00Z'},duration_ms:500},Date.parse('2026-11-20T15:00:00Z'));
 assert.equal(validationReport([...many,next]).speed_sample_requirement_met,true);
 const after=validationSample({view:{status:'FRESH QUOTE · CHECKS PASSED',observed_at:'2026-11-19T22:00:00Z',received_at:'2026-11-19T22:00:00Z'},snapshot,duration_ms:1},Date.parse('2026-11-19T22:00:00Z'));assert.equal(after.open_session_verified,false);
});
