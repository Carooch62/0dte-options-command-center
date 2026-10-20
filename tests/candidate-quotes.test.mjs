import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateQuotes} from '../candidate-quotes.js';
const now=Date.parse('2026-10-12T15:00:00Z');
const id='bbdbf613-f3e0-4f68-9cc7-fc090ca84e24';
const scanner=()=>({candidates:[{ticker:'SPY',score:72,options:[{contract_id:'SPY261012C00778000',strike:778,side:'call',expiry:'2026-10-12'}]}]});
const observation=()=>({instrument:{id,chain_symbol:'SPY',strike_price:'778.0000',type:'call',expiration_date:'2026-10-12',state:'active',tradability:'tradable',trade_value_multiplier:'100',sellout_datetime:'2026-10-12T19:45:00Z'},quote:{instrument_id:id,bid_price:'.80',ask_price:'.81',updated_at:'2026-10-12T14:59:59Z'},received_at:'2026-10-12T14:59:59.500Z'});
test('exact contract passes without changing scanner or source observation',()=>{
 const s=scanner(),o=observation(),before=JSON.stringify([s,o]);const r=candidateQuotes(s,[o],now)[0];assert.equal(r.status,'QUOTE_CHECK_PASSED');assert.equal(r.age_seconds,1);assert.equal(r.ranking_effect,'NONE');assert.equal(JSON.stringify([s,o]),before);
});
test('each identity field must match and duplicate mappings are ambiguous',()=>{
 for(const [field,value] of [['chain_symbol','QQQ'],['strike_price','779'],['type','put'],['expiration_date','2026-10-13']]){const o=observation();o.instrument[field]=value;assert.deepEqual(candidateQuotes(scanner(),[o],now)[0].reasons,['NO_CONTRACT_MATCH']);}
 const a=observation(),b=observation();b.instrument.id='11111111-1111-1111-1111-111111111111';assert.deepEqual(candidateQuotes(scanner(),[a,b],now)[0].reasons,['AMBIGUOUS_CONTRACT']);
});
test('stale, missing and future timestamps fail closed as time advances',()=>{
 assert.ok(candidateQuotes(scanner(),[observation()],now+61000)[0].reasons.includes('STALE_QUOTE'));
 for(const t of [null,'bad','2026-10-12T15:00:01Z']){const o=observation();o.quote.updated_at=t;assert.ok(candidateQuotes(scanner(),[o],now)[0].reasons.includes('INVALID_QUOTE_CLOCK'));}
});
test('missing, crossed, nonfinite and wide books cannot pass',()=>{
 for(const [bid,ask,reason] of [[null,'.81','INVALID_BOOK'],['.9','.8','INVALID_BOOK'],['Infinity','Infinity','INVALID_BOOK'],['.1','.2','WIDE_SPREAD'],['1','1.11','WIDE_SPREAD']]){const o=observation();Object.assign(o.quote,{bid_price:bid,ask_price:ask});assert.ok(candidateQuotes(scanner(),[o],now)[0].reasons.includes(reason));}
});
test('UUID mismatch, adjusted contracts and expired deadlines fail',()=>{
 const o=observation();o.quote.instrument_id='wrong';o.instrument.trade_value_multiplier='10';o.instrument.sellout_datetime='2026-10-12T14:00:00Z';
 const reasons=candidateQuotes(scanner(),[o],now)[0].reasons;for(const code of ['QUOTE_ID_MISMATCH','NONSTANDARD_OR_UNKNOWN_MULTIPLIER','DEADLINE_UNKNOWN_OR_PASSED'])assert.ok(reasons.includes(code));
});
test('latest collection supersedes older successful quote even when newest is invalid',()=>{
 const a=observation(),b=observation();b.received_at='2026-10-12T15:00:00Z';b.quote.bid_price=null;assert.ok(candidateQuotes(scanner(),[a,b],now)[0].reasons.includes('INVALID_BOOK'));
});

test('conflicting copies at the newest receipt stay unverified in either order',()=>{
 const a=observation(),b=observation();b.quote.bid_price='.79';
 for(const rows of [[a,b],[b,a]]){const result=candidateQuotes(scanner(),rows,now)[0];assert.equal(result.status,'REQUIRES_RECHECK');assert.deepEqual(result.reasons,['CONFLICTING_QUOTE_OBSERVATIONS']);assert.equal(result.bid,undefined);}
 assert.equal(candidateQuotes(scanner(),[a,structuredClone(a)],now)[0].status,'QUOTE_CHECK_PASSED');
});
