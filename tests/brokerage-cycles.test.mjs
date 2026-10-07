import test from 'node:test';import assert from 'node:assert/strict';
import {reconcile,scannerComparison} from '../dashboard-broker-logic.js';
const row=(i,type,q=1)=>({account_id:'a',investment_transaction_id:String(i),ticker_symbol:'ABC261009C00010000',type,name:`${type} ${q} call to ${type==='buy'?'open':'close'}`,quantity:(type==='buy'?1:-1)*100*q,price:.2,amount:(type==='buy'?1:-1)*20*q,fees:.04,transaction_datetime:`2026-10-07T14:0${i}:00Z`});
const pack=transactions=>({format:'broker-review-v1',retrieved_at:'2026-10-07T16:00:00Z',holdings:[],transactions});
test('sequential cycles match separately',()=>{const r=reconcile(pack([row(4,'sell'),row(1,'buy'),row(2,'sell'),row(3,'buy')]));assert.equal(r.trades.length,2);assert.equal(r.trades[0].entry_fill_at,null);assert.equal(r.trades[0].execution_time_verified,false);});
test('overlapping lots remain unresolved',()=>assert.equal(reconcile(pack([row(1,'buy'),row(2,'buy'),row(3,'sell'),row(4,'sell')])).trades.length,0));
test('quantity mismatch never counts as closed cycle',()=>assert.equal(reconcile(pack([row(1,'buy',2),row(2,'sell')])).trades.length,0));
test('tied times are ambiguous',()=>assert.equal(reconcile(pack([row(1,'buy'),{...row(2,'sell'),transaction_datetime:row(1,'buy').transaction_datetime}])).trades.length,0));
test('recovered commit after trade cannot be used',()=>assert.equal(scannerComparison({time:'2026-10-07T14:02:00Z'},[{generated_at:'2026-10-07T14:00:00Z',recovered_commit_at:'2026-10-07T14:03:00Z'}]).status,'NO_PRIOR_SNAPSHOT'));

test('a residual position blocks later pairs',()=>assert.equal(reconcile(pack([row(1,'buy',2),row(2,'sell'),row(3,'buy'),row(4,'sell')])).trades.length,0));
