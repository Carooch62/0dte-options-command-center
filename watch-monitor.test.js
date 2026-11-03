import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingWatchEvents,nextWatchCheckpoint} from './watch-monitor.js';
const w={ticker:'TEST',direction:'UP',contract_id:'TEST261106C00011000',expiry:'2026-11-06'};
const a={scan_id:'old',generated_at:'2026-11-02T14:45:00Z',candidates:[{ticker:'TEST',direction:'UP',execution_state:'WATCH'}]};
const b={scan_id:'new',generated_at:'2026-11-02T14:50:00Z',candidates:[{ticker:'TEST',direction:'UP',execution_state:'TRIGGERED'}]};
const now=Date.parse('2026-11-02T14:51:00Z');
test('only unseen, fresh scan transitions are pending',()=>{const events=pendingWatchEvents([w],a,b,[],now);assert.equal(events.length,1);assert.equal(pendingWatchEvents([w],a,b,[events[0].key],now).length,0);assert.equal(pendingWatchEvents([w],a,b,[],now+11*60_000).length,0);});
test('do not checkpoint a failed delivery; advance after success',()=>{const e=pendingWatchEvents([w],a,b,[],now);assert.equal(nextWatchCheckpoint(a,b,e).previous,a);assert.equal(nextWatchCheckpoint(a,b,[],[e[0].key]).previous,b);});
