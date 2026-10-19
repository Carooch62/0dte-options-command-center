import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteGuidance,appendQuoteEvidence,quoteEvidenceInput,quoteDiagnostics} from '../quote-evidence.js';
import {sessionPayload,restoreSession} from '../quote-session.js';
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

test('known multiplier and wide spread remain distinct through export and session recovery',()=>{
 const wide={...observation,quote:{...observation.quote,bid_price:'.02',ask_price:'.03'}};
 const history=appendQuoteEvidence(snapshot,[wide],[],now);
 assert.equal(history[0].metadata_multiplier,100);
 assert.deepEqual(history[0].quote_check_reasons,['WIDE_SPREAD']);
 assert.equal(history[0].multiplier,null);
 assert.equal(quoteEvidenceInput(snapshot,history).entries.length,0);
 const saved=sessionPayload(snapshot,[wide],history,'test',now);
 const restored=restoreSession(JSON.stringify(saved),now);
 assert.deepEqual(restored.history,history);
 assert.equal(quoteEvidenceInput(restored.scanner,restored.history).entries.length,0);
});

test('missing and nonstandard metadata remain unverified with specific diagnostic reasons',()=>{
 for(const value of [undefined,10]){
  const bad={...observation,instrument:{...observation.instrument,trade_value_multiplier:value}};
  const history=appendQuoteEvidence(snapshot,[bad],[],now);
  assert.equal(history[0].metadata_multiplier,value??null);
  assert.deepEqual(history[0].quote_check_reasons,['NONSTANDARD_OR_UNKNOWN_MULTIPLIER']);
  assert.equal(history[0].multiplier,null);
  assert.equal(quoteEvidenceInput(snapshot,history).entries.length,0);
 }
});

test('legacy diagnostics stay unknown and unrecognized diagnostic content is not persisted',()=>{
 assert.deepEqual(quoteDiagnostics({multiplier:null,quote_check:'REQUIRES_RECHECK'}),{});
 assert.deepEqual(quoteDiagnostics({metadata_multiplier:NaN,quote_check_reasons:['WIDE_SPREAD','account:secret','WIDE_SPREAD',{}]}),{metadata_multiplier:null,quote_check_reasons:['WIDE_SPREAD']});
 const history=appendQuoteEvidence(snapshot,[observation],[],now);
 delete history[0].metadata_multiplier;delete history[0].quote_check_reasons;
 const restored=restoreSession(JSON.stringify(sessionPayload(snapshot,[observation],history,'test',now)),now);
 assert.equal(Object.hasOwn(restored.history[0],'metadata_multiplier'),false);
 assert.equal(Object.hasOwn(restored.history[0],'quote_check_reasons'),false);
});

