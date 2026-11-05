import assert from 'node:assert/strict';
import test from 'node:test';
import {countQualifiedQuotes, runWatchQuotePilot, triggeredQuoteCandidates} from '../watch-quote-pilot.js';

const now=Date.parse('2026-11-05T15:31:00Z');
const expiry='2026-11-05';
const id='b6864f13-709c-42ba-a6f9-f3dc2bdcbe83';
const option={expiry,side:'call',strike:10,ask:.25,quote_valid:true,near_atm:true,delta_ok:true,usable_spread:true,volume:50,dte:0};
const row={ticker:'TEST',direction:'UP',execution_state:'TRIGGERED',options:[option,{...option,side:'put'}]};
const snapshot={scan_id:'pilot-fixture',generated_at:new Date(now-1000).toISOString(),market_session:'OPEN',candidates:[row,{...row,ticker:'WAIT',execution_state:'WATCH'}]};
const observed={
 instrument:{id,chain_symbol:'TEST',type:'call',expiration_date:expiry,strike_price:10,trade_value_multiplier:100,state:'active',tradability:'tradable',sellout_datetime:'2026-11-05T20:30:00Z'},
 quote:{instrument_id:id,updated_at:new Date(now-2000).toISOString(),bid_price:.24,ask_price:.26,delta:.40,volume:50},
 received_at:new Date(now-1000).toISOString()
};

test('pilot selects recent triggered research contracts with the matching direction',()=>{
 const candidates=triggeredQuoteCandidates(snapshot,now);
 assert.deepEqual(candidates.map(c=>[c.ticker,c.options[0].side]),[['TEST','call']]);
 assert.deepEqual(triggeredQuoteCandidates(snapshot,now+6*60000),[]);
 assert.deepEqual(triggeredQuoteCandidates({...snapshot,market_session:'CLOSED'},now),[]);
});

test('the exact current contract must pass spread, price, delta and freshness checks',()=>{
 const candidates=triggeredQuoteCandidates(snapshot,now);
 assert.equal(countQualifiedQuotes(candidates,[observed],now),1);
 const unacceptable=[
  {ask_price:.31,bid_price:.30},
  {bid_price:.19},
  {delta:.1},
  {volume:null},
  {updated_at:new Date(now-61_000).toISOString()},
  {instrument_id:'a6864f13-709c-42ba-a6f9-f3dc2bdcbe83'}
 ];
 for(const patch of unacceptable)assert.equal(countQualifiedQuotes(candidates,[{...observed,quote:{...observed.quote,...patch}}],now),0);
});

test('pilot is opt-in and leaves a failed authorization check available to retry',async()=>{
 let fetches=0,checkpoints=0;
 const env={PLAID_STORE:{get:async()=>null,put:async()=>{checkpoints++;}}};
 const args={now,fetcher:async()=>{fetches++;return Response.json(snapshot);},verify:async()=>({status:'reconnect-required'})};
 assert.deepEqual(await runWatchQuotePilot(env,args),{status:'disabled'});
 assert.equal(fetches,0);
 assert.deepEqual(await runWatchQuotePilot({...env,WATCH_QUOTE_PILOT_ENABLED:'true'},args),{status:'reconnect-required'});
 assert.equal(fetches,1);
 assert.equal(checkpoints,0);
});
