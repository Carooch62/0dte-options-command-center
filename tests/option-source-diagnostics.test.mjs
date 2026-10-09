import test from 'node:test';
import assert from 'node:assert/strict';
import {contractExplanation} from '../dashboard-logic.js';
test('explicit Nasdaq unavailability is not presented as a source outage or verified absence',()=>{
 const text=contractExplanation({options:[],chain_status:'EMPTY_UNVERIFIED',option_availability:'NO_OPTIONS_REPORTED'});
 assert.match(text,/Nasdaq reports options unavailable/);
 assert.match(text,/not proof/);
 assert.match(text,/No contract is eligible/);
});
