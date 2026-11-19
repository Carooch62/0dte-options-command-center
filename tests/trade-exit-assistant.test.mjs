import test from 'node:test';
import assert from 'node:assert/strict';
import {exitReview,purchaseRecordAction,exitPlanDraft,purchasePremium} from '../trade-exit-assistant.js';

const trade = {ticker:'TEST',contract:'TEST261120C00005000',entry:.33,qty:1,time:'2026-11-18T15:00:00Z',exit:null,expiry:'2026-11-20',lossReview:null,target:null};

test('purchase actions bind exact selected identity or leave unknown contract fields empty',()=>{
  const candidate={ticker:'TEST'},option={contract_id:'TEST261120C00005000',expiry:'2026-11-20',side:'call',strike:5};
  assert.deepEqual(purchaseRecordAction(candidate,option),{label:'I bought this contract · record fill',contract:{ticker:'TEST',...option}});
  assert.deepEqual(purchaseRecordAction(candidate,null),{label:'Record an option purchase',contract:{ticker:'TEST'}});
  assert.deepEqual(purchaseRecordAction(candidate,{...option,contract_id:null}),purchaseRecordAction(candidate,null));
  assert.equal(candidate.setup_qualified,undefined);
});

test('open position gets conditional checkpoints without assuming a quote or fill', () => {
  const notes = exitReview(trade, null, null).join(' ');
  assert.match(notes, /Set your own loss-review/);
  assert.match(notes, /Expiration 2026-11-20/);
  assert.doesNotMatch(notes, /Shadow review/);
});

test('later unqualified ticker observation produces a shadow-only review', () => {
  const candidate = {ticker:'TEST',setup_qualified:false,last_status:{observed_at:'2026-11-18T16:00:00Z'}};
  const notes = exitReview(trade,candidate,{generated_at:'2026-11-18T16:01:00Z'}).join(' ');
  assert.match(notes,/later delayed scanner observation/);
  assert.match(notes,/not an automatic exit signal/);
  assert.doesNotMatch(exitReview(trade,candidate,{generated_at:null}).join(' '),/Shadow review/);
  assert.doesNotMatch(exitReview(trade,{...candidate,last_status:{observed_at:'2026-11-18T14:00:00Z'}},{generated_at:'2026-11-18T16:01:00Z'}).join(' '),/Shadow review/);
  assert.equal(exitReview({...trade,exit:.4},candidate,{generated_at:'2026-11-18T16:01:00Z'}),null);
});


test('outside-budget personal fills are labelled without changing scanner qualification',()=>{
 const candidate={setup_qualified:true};
 assert.match(exitReview({...trade,entry:.50},candidate,null).join(' '),/exceeds the scanner/);
 assert.equal(candidate.setup_qualified,true);
});

test('exit draft uses exact contract research reference without manufacturing a fill',()=>{
 const c={contract_id:'TEST',expiry:'2026-11-20',side:'call',strike:5};
 const row={options:[{...c,ask:.20}],invalidation_price:4.9};
 const p=exitPlanDraft(c,row,{generated_at:'2026-11-18T15:00:00Z'},null,2);
 assert.equal(p.source,'OBSERVED_RESEARCH_ASK');assert.equal(p.loss,.14);assert.equal(p.target,.30);assert.equal(p.premium_at_risk,40);
 assert.equal(exitPlanDraft({...c,contract_id:'OTHER'},row,null,null).basis,null);
 const actual=exitPlanDraft(c,row,null,.24,1);assert.equal(actual.source,'ACTUAL_FILL');assert.equal(actual.loss,.17);assert.equal(actual.target,.36);
});

test('purchase premium requires an explicit positive decimal rather than a guessed quote',()=>{
 for(const value of ['0.20','.20','$0.20'])assert.equal(purchasePremium(value),.20);
 for(const value of [null,'','0','-1','NaN','1e2','20 dollars'])assert.throws(()=>purchasePremium(value));
});
