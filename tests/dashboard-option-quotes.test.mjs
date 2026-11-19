import test from 'node:test';import assert from 'node:assert/strict';
import {optionIdentity,privateQuoteUrl,quoteSignInUrl,fetchOptionQuote,optionQuoteView,matchingQuoteFills} from '../dashboard-option-quotes.js';
const c={ticker:'TEST',contract_id:'TEST261120C00100000',side:'call',expiry:'2026-11-20',strike:100};
const id='22222222-2222-4222-8222-222222222222',at='2026-11-19T18:00:00Z',now=Date.parse(at);
const i={id,chain_symbol:'TEST',type:'call',expiration_date:c.expiry,strike_price:'100',state:'active',tradability:'tradable',trade_value_multiplier:100,sellout_datetime:'2026-11-20T20:45:00Z'};
function reader(overrides={}){const calls=[];return {calls,read:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return url.endsWith('/resolve')?overrides.resolve??{results:[{status:'EXACT_METADATA_MATCH',contract:c,instrument:i}]}:overrides.quotes??{received_at:at,observations:[{quote:{instrument_id:id,bid_price:'.19',ask_price:'.20',updated_at:at}}]};}};}
test('handoff has only bounded exact identity on the fixed private dashboard',()=>{
 assert.deepEqual(optionIdentity(c),c);const u=new URL(privateQuoteUrl({...c,access_token:'NEVER'}));assert.equal(u.hostname,'0dte-options-command-center.h69htk56cq.workers.dev');assert.ok(!u.href.includes('NEVER'));
 for(const bad of [{...c,strike:null},{...c,expiry:'2026-99-99'},{...c,side:'stock'},{...c,ticker:'<script>'},{...c,contract_id:''}])assert.throws(()=>optionIdentity(bad));
});
test('exact metadata resolves before fetching only that instrument; no source mutation',async()=>{
 const r=reader(),before=JSON.stringify(c),p=await fetchOptionQuote(c,r.read);assert.equal(r.calls.length,2);assert.deepEqual(r.calls[1].body,{kind:'option',instrument_ids:[id]});assert.equal(JSON.stringify(c),before);
 const v=optionQuoteView(p,now);assert.equal(v.status,'FRESH QUOTE · CHECKS PASSED');assert.equal(v.bid,.19);assert.equal(v.ask,.20);assert.ok(Math.abs(v.midpoint-.195)<1e-9);
 assert.equal(optionQuoteView(p,now+61000).status,'STALE QUOTE');
});
test('wrong or ambiguous metadata blocks quote requests',async()=>{
 for(const result of [{status:'AMBIGUOUS_MATCH',contract:c,instrument:i},{status:'EXACT_METADATA_MATCH',contract:{...c,side:'put'},instrument:i},{status:'EXACT_METADATA_MATCH',contract:c,instrument:{...i,strike_price:101}}]){const r=reader({resolve:{results:[result]}});await assert.rejects(()=>fetchOptionQuote(c,r.read));assert.equal(r.calls.length,1);}
});
test('missing and mismatched quote identity cannot become a price',async()=>{
 for(const observations of [[],[{quote:{instrument_id:'WRONG'}}],[{quote:{instrument_id:id}},{quote:{instrument_id:id}}]]){const r=reader({quotes:{received_at:at,observations}});await assert.rejects(()=>fetchOptionQuote(c,r.read));}
});
test('unknown/future source clocks and invalid books never pass freshness checks',async()=>{
 for(const quote of [{instrument_id:id,bid_price:'.19',ask_price:'.20'},{instrument_id:id,bid_price:'.19',ask_price:'.20',updated_at:'2026-11-19T18:01:00Z'},{instrument_id:id,bid_price:'.21',ask_price:'.20',updated_at:at}]){
 const r=reader({quotes:{received_at:at,observations:[{quote}]}});const v=optionQuoteView(await fetchOptionQuote(c,r.read),now);assert.notEqual(v.status,'FRESH QUOTE · CHECKS PASSED');if(quote.bid_price==='.21')assert.equal(v.midpoint,null);
 }
});

test('fill comparison uses only exact open local positions without modifying them',()=>{
 const t={ticker:c.ticker,contract:c.contract_id,expiry:c.expiry,entry:.2,exit:null},trades=[t,{...t,contract:'OTHER'},{...t,expiry:'2026-12-01'},{...t,exit:.3},{...t,entry:null}],before=JSON.stringify(trades);
 assert.deepEqual(matchingQuoteFills(c,trades),[t]);assert.equal(JSON.stringify(trades),before);
});

test('private sign-in link preserves only selected option identity and returns to dashboard',()=>{
 const u=new URL(quoteSignInUrl({...c,access_token:'NEVER'}),'https://example.test');
 assert.equal(u.pathname,'/private/plaid/robinhood/sign-in');const back=new URL(u.searchParams.get('return_to'),u.origin);
 assert.equal(back.pathname,'/dashboard_liquid.html');assert.deepEqual(JSON.parse(decodeURIComponent(back.hash.slice(10))),c);assert.ok(!u.href.includes('NEVER'));
});
