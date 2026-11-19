import test from 'node:test';
import assert from 'node:assert/strict';
import {exitBenchmarks,benchmarkHtml,savedExitContract} from '../exit-benchmarks.js';
const stamp='2026-11-18T15:00:00Z';
function fixture(){
 const contract={ticker:'TEST',contract_id:'TEST261120C00100000',expiry:'2026-11-20',side:'call',strike:100};
 return {contract,entry:1,enteredAt:stamp,now:Date.parse(stamp),snapshot:{generated_at:stamp,market_session:'OPEN',session_close_at:'2026-11-18T21:00:00Z'},candidate:{ticker:'TEST',price:100,bar_end:stamp,invalidation_price:99,key_levels:{target_1:101,target_2:102},options:[{...contract,option_timestamp:stamp,delta:.4,delta_verified:true,gamma:.01,theta:-.24,theta_available:true,bid:.99,ask:1}],catalyst_level:'DIRECT',news_status:'SUCCESS',news_items:[{title:'A & B <event>',published_at:stamp}]}};
}
test('six conditional scenario prices use paid premium, directional levels and calendar theta',()=>{
 const f=fixture(),before=JSON.stringify(f),p=exitBenchmarks(f);
 assert.equal(p.mode,'PROVISIONAL_SCENARIOS');assert.equal(p.rows.length,3);
 assert.equal(p.rows[1].profit,1.39);assert.equal(p.rows[1].loss,.72);assert.equal(p.primary,1.39);
 assert.ok(Math.abs(p.rows[1].theta_cost-.005)<1e-12);assert.equal(p.context.days_to_expiry,2);
 assert.equal(JSON.stringify(f),before);
 f.entry=2;assert.equal(exitBenchmarks(f).primary,2.39);
});
test('put scenarios use signed delta with upside invalidation and downside targets',()=>{
 const f=fixture();f.contract.side='put';f.candidate.options[0].side='put';f.candidate.options[0].delta=-.4;
 f.candidate.invalidation_price=101;f.candidate.key_levels={target_1:99,target_2:98};
 const p=exitBenchmarks(f);assert.equal(p.mode,'PROVISIONAL_SCENARIOS');assert.equal(p.primary,1.39);assert.equal(p.rows[1].loss,.72);
});
test('missing clocks, stale or delayed research, expiration and unknown Greeks withhold all model rows',()=>{
 for(const change of [f=>f.enteredAt='',f=>f.enteredAt='2026-11-18T16:00:00Z',f=>f.snapshot.market_session='CLOSED',f=>f.snapshot.generated_at='2026-11-18T14:00:00Z',f=>f.candidate.bar_end=null,f=>f.candidate.options[0].option_timestamp=null,f=>f.candidate.options[0].minimum_delay_minutes=15,f=>f.candidate.options[0].gamma=null,f=>f.candidate.options[0].theta_available=false,f=>f.contract.expiry='2026-11-17',f=>f.contract.expiry='2026-02-31',f=>f.contract.contract_id='OTHER',f=>f.candidate.options[0].bid=null,f=>f.candidate.key_levels.target_1=99,f=>f.candidate.key_levels.target_2=110]){
  const f=fixture();change(f);const p=exitBenchmarks(f);assert.equal(p.mode,'REFERENCE_ONLY');assert.ok(p.gaps.length);assert.ok(p.rows.every(r=>r.mode==='REFERENCE_ONLY'));assert.equal(p.primary,1.5);
 }
});
test('elapsed or near-close horizons never mix reference tiers with scenario rows',()=>{
 for(const change of [f=>f.now+=16*60000,f=>f.snapshot.session_close_at='2026-11-18T15:45:00Z']){
 const f=fixture();change(f);const p=exitBenchmarks(f);assert.equal(p.mode,'REFERENCE_ONLY');assert.ok(p.gaps.some(g=>g.includes('scenario window')));assert.ok(p.rows.every(r=>r.stock_profit===null));}
});
test('unknown price stays unknown and rounding cannot turn a loss into a profit',()=>{
 const f=fixture();f.entry='';const p=exitBenchmarks(f);assert.ok(p.rows.every(r=>r.loss===null&&r.profit===null&&r.loss_return===null));
 f.entry=.01;f.enteredAt='';const tiny=exitBenchmarks(f);assert.equal(tiny.rows[0].loss,null);assert.equal(tiny.rows[0].loss_return,null);
});
test('catalysts provide escaped evidence and thesis context without invented price uplift',()=>{
 const f=fixture(),original=exitBenchmarks(f);f.candidate.catalyst_level='NONE';assert.deepEqual(exitBenchmarks(f).rows,original.rows);
 const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');
 const html=benchmarkHtml(original,escape);assert.ok(html.includes('A &amp; B &lt;event>'));assert.ok(html.includes('15 / 30 / 60'));assert.ok(html.includes('calculation time is unverified'));
 f.enteredAt='';const fallback=benchmarkHtml(exitBenchmarks(f),escape);assert.ok(fallback.includes('REFERENCE_ONLY'));assert.ok(!fallback.includes('1 · 15 min'));assert.equal((fallback.match(/<tr>/g)||[]).length,4);
});
test('saved positions bind exact contract and expiration, never an arbitrary ticker option',()=>{
 const f=fixture(),trade={ticker:'TEST',contract:f.contract.contract_id,expiry:f.contract.expiry};
 assert.deepEqual(savedExitContract(trade,f.candidate),f.contract);
 assert.equal(savedExitContract({...trade,contract:'OTHER'},f.candidate).side,undefined);
 assert.equal(savedExitContract({...trade,expiry:'2026-11-27'},f.candidate).side,undefined);
});
