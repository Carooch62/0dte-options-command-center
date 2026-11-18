import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewAccount,projectFillLookup} from '../private-fill-lookup.js';

const option='11111111-1111-4111-8111-111111111111';
const instrument={id:option,chain_symbol:'TEST',expiration_date:'2026-11-20',strike_price:'7',type:'call',trade_value_multiplier:'100'};
const leg={option_id:option,expiration_date:'2026-11-20',strike_price:'7',option_type:'call',side:'buy',position_effect:'open',executions:[{id:'22222222-2222-4222-8222-222222222222',price:'.33',quantity:'1',timestamp:'2026-11-18T15:22:00Z'}]};
test('account selector requires an exact configured individual account',()=>{
  assert.equal(reviewAccount([{account_number:'private-a',brokerage_account_type:'individual'},{account_number:'private-b',brokerage_account_type:'individual'}],'private-a'),'private-a');
  assert.throws(()=>reviewAccount([{account_number:'private-b',brokerage_account_type:'individual'}],'private-a'));
  assert.throws(()=>reviewAccount([{account_number:'private-a',brokerage_account_type:'ira_roth'}],'private-a'));
});
test('only exact confirmed opening executions are projected; fees remain unknown',()=>{
  const orders=[{state:'partially_filled',processed_quantity:'1',legs:[leg]},{state:'filled',processed_quantity:'1',legs:[{...leg,side:'sell'}]},{state:'cancelled',processed_quantity:'0',legs:[{...leg,executions:null}]}];
  const result=projectFillLookup({orders,position:{quantity:'1'},instrument,complete:true});
  assert.equal(result.fills.length,1);
  assert.equal(result.fills[0].price,.33);
  assert.equal(result.fills[0].fees,null);
  assert.equal(result.open_quantity,1);
  assert.equal(JSON.stringify(result).includes('account_number'),false);
  assert.throws(()=>projectFillLookup({orders,position:null,instrument,complete:false}));
  assert.throws(()=>projectFillLookup({orders:[{...orders[0],legs:[{...leg,expiration_date:'2026-11-21'}]}],position:null,instrument,complete:true}),/Contract mismatch/);
});
