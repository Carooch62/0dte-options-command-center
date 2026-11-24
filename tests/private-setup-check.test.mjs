import test from 'node:test';
import assert from 'node:assert/strict';
import {privateSetupCheck} from '../private-setup-check.js';
const now=Date.parse('2026-11-24T18:00:00Z');
const batch={scan_id:'s',generated_at:'2026-11-24T17:58:00Z',market_session:'OPEN'};
const context={scan_id:'s',bar_end:'2026-11-24T17:57:00Z',execution_state:'TRIGGERED',setup_qualified:true,direction:'UP',side:'call',near_atm:true,volume:80};
const quote={status:'QUOTE_CHECK_PASSED',premium_status:'WITHIN_LIMIT',delta_check:'PREFERRED_RANGE',age_seconds:2};
test('same scan core status requires all fresh and verified evidence',()=>{
 assert.match(privateSetupCheck(batch,context,quote,now).label,/Core setup/);
 assert.match(privateSetupCheck(batch,{...context,execution_state:'SECOND-WAVE'},quote,now).label,/Qualified watch/);
 for(const changed of [{scan_id:'other'},{setup_qualified:false},{volume:1},{side:'put'}])assert.doesNotMatch(privateSetupCheck(batch,{...context,...changed},quote,now).label,/Core setup/);
 assert.doesNotMatch(privateSetupCheck(batch,context,{...quote,delta_check:'OUTSIDE_PREFERRED_RANGE'},now).label,/Core setup/);
 assert.doesNotMatch(privateSetupCheck(batch,context,quote,now+9*60000).label,/Core setup/);
});
