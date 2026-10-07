import test from 'node:test';
import assert from 'node:assert/strict';
import {thetaDecayPct,passesTheta,selectableContracts,expirationView} from '../dashboard-logic.js';
test('theta decay uses premium percentage and never treats missing as zero',()=>{
 assert.equal(thetaDecayPct({theta:-.02,ask:.2,theta_available:true}),10);
 assert.equal(thetaDecayPct({theta:-.01,ask:.05,theta_available:true}),20);
 for(const o of [{theta:0,ask:.2},{theta:null,ask:.2,theta_available:true},{theta:0,ask:.2,theta_available:false},{theta:.1,ask:.2,theta_available:true},{theta:-.1,ask:0,theta_available:true}]) assert.equal(thetaDecayPct(o),null);
 assert.equal(thetaDecayPct({theta:0,ask:.2,theta_available:true}),0);
 assert.equal(passesTheta({},null),true);
 assert.equal(passesTheta({},10),false);
});
test('theta caps apply in every expiry window without bypassing quality gates',()=>{
 const good={side:'call',delta:.4,delta_verified:true,ask:.2,theta:-.02,theta_available:true,quote_valid:true,delta_ok:true,tight_spread:true};
 const opts=[good,{...good,theta:-.04},{...good,theta_available:false},{...good,delta_ok:false},{...good,tight_spread:false}];
 const row={eligible_contracts:opts,expiry_groups:Object.fromEntries(['week','two_weeks','month'].map(k=>[k,{eligible_contracts:opts.map(o=>({...o,delta:.75}))}]))};
 for(const window of ['today','week','two_weeks','month']) {
  assert.deepEqual(selectableContracts({...expirationView(row,window),theta_limit_pct:10}),[{...good,delta:window==='today'?.4:.75}]);
  assert.equal(selectableContracts({...expirationView(row,window),theta_limit_pct:null}).length,3);
 }
});
