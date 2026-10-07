import test from 'node:test';
import assert from 'node:assert/strict';
import {expirationView,selectableContracts,contractShortlist,contractExplanation} from '../dashboard-logic.js';
test('expiration selection preserves all other contract filters and source row',()=>{
 const option={contract_id:'future',expiry:'2026-10-13',dte:7,side:'call',strike:100,ask:.21,bid:.19,volume:100,delta:.75,delta_verified:true,quote_valid:true,delta_ok:true,tight_spread:true,near_atm:true,expiry_verified:true};
 const row={direction:'UP',execution_state:'TRIGGERED',bar_end:'2026-10-06T15:00:00Z',options:[],eligible_contracts:[],expiry_groups:{week:{options:[option],eligible_contracts:[option],chain_status:'SUCCESS'}}};
 assert.equal(expirationView(row),row);
 const selected=expirationView(row,'week');
 assert.equal(selectableContracts(selected,.1,.3).length,1);
 assert.equal(selectableContracts(selected,.1,.2).length,0);
 assert.equal(row.options.length,0);
 const data={generated_at:'2026-10-06T15:01:00Z',market_session:'OPEN',session_open_at:'2026-10-06T13:30:00Z',session_close_at:'2026-10-06T20:00:00Z'};
 assert.equal(contractShortlist(selected,data,.1,.3,Date.parse('2026-10-06T15:02:00Z'))[0].label,'LATER-EXPIRY RESEARCH');
 assert.equal(expirationView(row,'month').chain_status,'NOT_SCANNED');
 assert.match(contractExplanation(expirationView(row,'month')),/not scanned/);
});
