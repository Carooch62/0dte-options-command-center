import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteGuidance,appendQuoteEvidence,quoteEvidenceInput} from '../quote-evidence.js';
const now=Date.parse('2026-10-14T15:00:00Z'),id='bbdbf613-f3e0-4f68-9cc7-fc090ca84e24';
const snapshot={scan_id:'test',generated_at:'2026-10-14T14:59:00Z',account_id:'private',candidates:[{ticker:'TEST',options:[{contract_id:'TEST261016C00100000',strike:100,side:'call',expiry:'2026-10-16'}]}]};
const observation={instrument:{id,chain_symbol:'TEST',strike_price:100,type:'call',expiration_date:'2026-10-16',trade_value_multiplier:100,state:'active',tradability:'tradable',sellout_datetime:'2026-10-16T20:00:00Z',account_id:'private'},quote:{instrument_id:id,bid_price:'.29',ask_price:'.30',updated_at:'2026-10-14T15:00:00Z'},received_at:'2026-10-14T15:00:00Z'};
test('guidance distinguishes metadata, price limit and refresh problems',()=>{
 assert.match(quoteGuidance({reasons:['NONSTANDARD_OR_UNKNOWN_MULTIPLIER']}),/refreshing the price cannot/);
 assert.match(quoteGuidance({reasons:['STALE_QUOTE']}),/Refresh matched/);
 assert.match(quoteGuidance({reasons:[],premium_status:'ABOVE_LIMIT'}),/above \$0.30/);
});
test('export preserves quote clocks, excludes account metadata and uses quote receipt as decision',()=>{
 const history=appendQuoteEvidence(snapshot,[observation],[],now),exported=quoteEvidenceInput(snapshot,history,'2026-10-14T15:01:00Z');
 assert.equal(exported.entries[0].decision_at,observation.received_at);assert.equal(exported.entries[0].quote.multiplier,100);
 assert.equal(exported.observations[0].observed_at,observation.quote.updated_at);assert.ok(!JSON.stringify(exported).includes('account_id'));
 assert.equal(appendQuoteEvidence(snapshot,[observation],history,now).length,1);
});
test('failed quote checks cannot supply an entry estimate',()=>{
 const bad={...observation,quote:{...observation.quote,bid_price:'.10'}};
 const history=appendQuoteEvidence(snapshot,[bad],[],now);
 assert.equal(history[0].multiplier,null);assert.equal(quoteEvidenceInput(snapshot,history).entries.length,0);
});
