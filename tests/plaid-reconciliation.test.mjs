import test from 'node:test';
import assert from 'node:assert/strict';
import {plaidReviewPack,researchDataset} from '../dashboard-broker-logic.js';
const symbol='ABC261009C00010000';
const base={retrieved_at:'2026-10-07T16:00:00Z',securities:[{security_id:'s',ticker_symbol:symbol}],holdings:[],coverage:{complete:true,total_transactions:2}};
const rows=[{investment_transaction_id:'b',account_id:'a',security_id:'s',type:'buy',name:'buy 1 call to open',quantity:100,price:.2,amount:20,fees:null,date:'2026-10-07'},{investment_transaction_id:'s',account_id:'a',security_id:'s',type:'sell',name:'sell 1 call to close',quantity:-100,price:.3,amount:-30,fees:null,date:'2026-10-07'}];
test('date-only records cannot become matched fills or scanner evidence',()=>{const p=plaidReviewPack({...base,transactions:rows});assert.equal(p.transactions[0].transaction_datetime,null);const d=researchDataset(p,[]);assert.equal(d.rows.length,0);assert.equal(d.issues.length,1);assert.equal(d.provider_records.length,2);});
test('validated units and timestamps reconcile but missing fees remain unknown',()=>{const d=researchDataset(plaidReviewPack({...base,transactions:rows.map((r,i)=>({...r,transaction_datetime:`2026-10-07T1${4+i}:00:00Z`}))}),[]);assert.equal(d.rows.length,1);assert.equal(d.rows[0].qty,1);assert.equal(d.rows[0].net,null);assert.equal(d.ml_ready,false);});
test('unresolved closed contract is flagged rather than silently ignored',()=>{const d=researchDataset(plaidReviewPack({...base,securities:[],transactions:[{...rows[0],name:'buy 1 call with strike of $10 to open'}]}),[]);assert.equal(d.issues.length,1);assert.equal(d.rows.length,0);});
