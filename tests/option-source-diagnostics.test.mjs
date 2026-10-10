import test from 'node:test';
import assert from 'node:assert/strict';
import {contractExplanation} from '../dashboard-logic.js';
test('provider symbol rejection is explained without claiming delisting',()=>{
 const text=contractExplanation({options:[],chain_status:'SOURCE_FAILURE',option_source_diagnostics:[
  {provider:'fetch_cboe',reason:'ACCESS_DENIED'},
  {provider:'nasdaq_options',reason:'SYMBOL_NOT_RECOGNIZED'}]});
 assert.match(text,/Cboe denied access/);
 assert.match(text,/Nasdaq did not recognize/);
 assert.match(text,/does not prove/);
});
test('explicit Nasdaq unavailability is not presented as a source outage or verified absence',()=>{
 const text=contractExplanation({options:[],chain_status:'EMPTY_UNVERIFIED',option_availability:'NO_OPTIONS_REPORTED'});
 assert.match(text,/Nasdaq reports options unavailable/);
 assert.match(text,/not proof/);
 assert.match(text,/No contract is eligible/);
});
