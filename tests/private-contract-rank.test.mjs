import test from 'node:test';
import assert from 'node:assert/strict';
import {bestVerifiedContract} from '../private-contract-rank.js';

const now=Date.parse('2026-11-24T15:00:00Z');
const context={scan_id:'scan',bar_end:'2026-11-24T14:58:00Z',execution_state:'TRIGGERED',setup_qualified:true,direction:'UP',side:'call',near_atm:true,volume:30};
const batch={scan_id:'scan',generated_at:'2026-11-24T14:59:00Z',market_session:'OPEN',candidates:[{ticker:'ABC',options:[{contract_id:'a',setup_context:context},{contract_id:'b',setup_context:context}]}]};
const quote=(contract,delta,other={})=>({contract,status:'QUOTE_CHECK_PASSED',premium_status:'WITHIN_LIMIT',delta_check:'PREFERRED_RANGE',age_seconds:10,ask:.20,delta,spread_pct:12,...other});
test('ranks current verified candidates by delta fit then spread',()=>{
 assert.equal(bestVerifiedContract(batch,[quote('a',.32),quote('b',.41)],now)?.contract,'b');
 assert.equal(bestVerifiedContract(batch,[quote('a',.4,{spread_pct:10}),quote('b',.4)],now)?.contract,'a');
});
test('never promotes stale, unmatched, wrong-direction or unverified candidates',()=>{
 assert.equal(bestVerifiedContract(batch,[quote('a',.4,{age_seconds:65})],now),null);
 assert.equal(bestVerifiedContract(batch,[quote('a',.4,{delta_check:'UNAVAILABLE'})],now),null);
 assert.equal(bestVerifiedContract(batch,[quote('a',.4,{ask:.31})],now),null);
 assert.equal(bestVerifiedContract(batch,[quote('other',.4)],now),null);
 assert.equal(bestVerifiedContract(batch,[quote('a',.4)],now+9*60000),null);
 assert.equal(bestVerifiedContract({...batch,candidates:[{ticker:'ABC',options:[{contract_id:'a',setup_context:{...context,direction:'DOWN'}}]}]},[quote('a',.4)],now),null);
});
