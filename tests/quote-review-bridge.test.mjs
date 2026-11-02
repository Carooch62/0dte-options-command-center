import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteOnlyResearchPack} from '../quote-review-bridge.js';
import {mergeResearchPack,robinhoodResearch,validateRobinhoodPack} from '../robinhood-review.js';
import {appendQuoteEvidence} from '../quote-evidence.js';
import {sessionPayload,restoreSession} from '../quote-session.js';
const stamp='2026-11-02T15:31:00Z',id='a22ed0de-dcc3-40e3-84af-7632143fa80a';
const snapshot={scan_id:'synthetic-scan',market_session:'OPEN',candidates:[{ticker:'XLF',options:[{contract_id:'XLF261102C00057500',side:'call',expiry:'2026-11-02',strike:57.5}]}]};
const instrument={id,chain_symbol:'XLF',type:'call',expiration_date:'2026-11-02',strike_price:'57.5',state:'active',tradability:'tradable',trade_value_multiplier:'100',sellout_datetime:'2026-11-02T20:45:00Z',account_number:'never export'};
const observation={instrument,quote:{instrument_id:id,bid_price:'0.10',ask_price:'0.11',updated_at:stamp,delta:'0.44',theta:'-0.27',mark_price:'0.105',bid_size:20,ask_size:30,account_number:'secret'},received_at:'2026-11-02T15:31:01Z'};
const original=()=>({format:'robinhood-research-v1',retrieved_at:'2026-11-02T18:15:00Z',accounts:[{account_key:'private',orders:[]}],observations:[],bars:[{symbol:'XLF',interval:'5minute',bounds:'regular',bars:[]}],private_research_extensions:{keep:'private'}});
test('manual quote captures preserve their own bid/ask, clocks and Greeks through tab recovery',()=>{
 const evidence=appendQuoteEvidence(snapshot,[observation],[],Date.parse('2026-11-02T15:31:02Z'));
 assert.equal(evidence.length,1);assert.equal(evidence[0].theta,-0.27);assert.equal(evidence[0].delta,0.44);
 const recovered=restoreSession(JSON.stringify(sessionPayload(snapshot,[observation],evidence,'test',Date.parse('2026-11-02T15:32:00Z'))),Date.parse('2026-11-02T15:32:00Z'));
 assert.equal(recovered.history[0].theta,-0.27);
 const pack=quoteOnlyResearchPack(recovered.scanner,recovered.observations,recovered.history,'2026-11-02T15:32:01Z');
 assert.equal(pack.observations[0].quote.updated_at,stamp);
 assert.equal(pack.observations[0].quote.delta,0.44);
 assert.equal(pack.observations[0].quote.theta,-0.27);
 assert.equal(pack.observations[0].session_status,'unverified');
 assert.equal(pack.observations[0].selection,'SCANNER_BATCH_RESEARCH');
 assert.equal(pack.coverage_mode,'observations_only');
 assert.deepEqual(pack.accounts,[]);assert.deepEqual(pack.bars,[]);
 assert.ok(!JSON.stringify(pack).includes('secret'));assert.ok(!JSON.stringify(pack).includes('account_number'));
 assert.equal(validateRobinhoodPack(pack),pack);
});
test('importing quotes after fills preserves accounts, underlying, and original account extensions',()=>{
 const hist=appendQuoteEvidence(snapshot,[observation],[],Date.parse('2026-11-02T15:31:02Z'));
 const newPack=quoteOnlyResearchPack(snapshot,[observation],hist,'2026-11-02T15:32:01Z');
 const combined=mergeResearchPack(original(),newPack);
 assert.equal(combined.accounts.length,1);assert.equal(combined.bars.length,1);
 assert.equal(combined.private_research_extensions.keep,'private');
 assert.equal(combined.observations.length,1);
 assert.equal(mergeResearchPack(combined,newPack).observations.length,1);
 assert.equal(robinhoodResearch(combined,Date.parse('2026-11-02T15:32:01Z')).ml_ready,false);
 const replacement=mergeResearchPack(combined,original());
 assert.equal(replacement.accounts.length,1);assert.equal(replacement.observations.length,1);
});
test('reject fake quote-only modes carrying accounts or bars',()=>{
 assert.throws(()=>mergeResearchPack(original(),{...original(),coverage_mode:'observations_only'}),/cannot contain accounts or bars/);
});
test('ambiguous or absent metadata cannot create fabricated observations',()=>{
 const hist=appendQuoteEvidence(snapshot,[observation],[],Date.parse('2026-11-02T15:31:02Z'));
 assert.throws(()=>quoteOnlyResearchPack(snapshot,[],hist,'2026-11-02T15:32:01Z'),/No timestamped quote evidence/);
 const another={...observation,instrument:{...instrument,id:'11111111-1111-1111-1111-111111111111'}};
 assert.throws(()=>quoteOnlyResearchPack(snapshot,[observation,another],hist,'2026-11-02T15:32:01Z'),/No timestamped quote evidence/);
});
