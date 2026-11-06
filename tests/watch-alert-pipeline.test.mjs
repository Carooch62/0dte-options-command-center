import assert from 'node:assert/strict';
import test from 'node:test';
import {processVerifiedOptionAlerts} from '../watch-alert-pipeline.js';
import {runWatchQuotePilot,triggeredQuoteCandidates} from '../watch-quote-pilot.js';

const now=Date.parse('2026-11-05T15:31:00Z');
const id='b6864f13-709c-42ba-a6f9-f3dc2bdcbe83';
const snapshot={scan_id:'pipeline-fixture',generated_at:new Date(now-1000).toISOString(),market_session:'OPEN',candidates:[{
 ticker:'TEST',direction:'UP',execution_state:'TRIGGERED',options:[{
  expiry:'2026-11-05',side:'call',strike:10,ask:.25,quote_valid:true,near_atm:true,delta_ok:true,usable_spread:true,volume:50,dte:0
 }]
}]};
const observed={instrument:{id,chain_symbol:'TEST',type:'call',expiration_date:'2026-11-05',strike_price:10,
 trade_value_multiplier:100,state:'active',tradability:'tradable',sellout_datetime:'2026-11-05T20:30:00Z'},
 quote:{instrument_id:id,updated_at:new Date(now-2000).toISOString(),bid_price:.24,ask_price:.26,delta:.40,volume:50},
 received_at:new Date(now-1000).toISOString()};
const enabled={WATCH_QUOTE_PILOT_ENABLED:'true',WATCH_VERIFIED_ALERTS_ENABLED:'true'};
const link={verified:true,instrument_id:id,source:'robinhood-provider',href:'https://robinhood.com/options/example'};

test('no provider-backed link resolver means no delivery',async()=>{
 let deliveries=0;const candidates=triggeredQuoteCandidates(snapshot,now);
 assert.equal(candidates[0].execution_state,'TRIGGERED');
 assert.deepEqual(await processVerifiedOptionAlerts(enabled,snapshot,candidates,[observed],{
  now,deliver:async()=>{deliveries++;return {status:'sent'}}
 }),{status:'link-resolver-unavailable',qualified:1});
 assert.equal(deliveries,0);
});

test('missing and wrong-contract links block alerts; exact verified link permits one',async()=>{
 const candidates=triggeredQuoteCandidates(snapshot,now);
 let deliveries=0;const deliver=async alert=>{
  deliveries++;assert.equal(alert.instrument_id,id);assert.match(alert.text,/TEST \$10 CALL/);
  return {status:'sent'};
 };
 for(const value of [null,{...link,instrument_id:'unrelated'},{...link,verified:false}]){
  const result=await processVerifiedOptionAlerts(enabled,snapshot,candidates,[observed],{now,resolveLink:async()=>value,deliver});
  assert.deepEqual(result,{status:'checked',sent:0,unlinked:1,failed:0});
 }
 assert.equal(deliveries,0);
 assert.deepEqual(await processVerifiedOptionAlerts(enabled,snapshot,candidates,[observed],{
  now,resolveLink:async()=>link,deliver
 }),{status:'checked',sent:1,unlinked:0,failed:0});
 assert.equal(deliveries,1);
});

test('failed delivery does not advance the scan checkpoint',async()=>{
 const values=new Map(),env={...enabled,PLAID_STORE:{get:async key=>values.get(key)||null,put:async(key,value)=>values.set(key,value)}};
 const args={now,clock:()=>now,fetcher:async()=>Response.json(snapshot),
  verify:async()=>({status:'checked',observations:[observed]}),resolveLink:async()=>link,
  deliver:async()=>({status:'failed'})};
 const result=await runWatchQuotePilot(env,args);
 assert.equal(result.status,'delivery-retry');assert.equal(values.size,0);
 const retried=await runWatchQuotePilot(env,{...args,deliver:async()=>({status:'sent'})});
 assert.equal(retried.alerts.sent,1);
 assert.equal(values.get('watch-quote-pilot:last-checked-scan'),snapshot.scan_id);
});

test('an expired or mismatched quote never calls the link resolver',async()=>{
 let calls=0;
 const candidates=triggeredQuoteCandidates(snapshot,now);
 const result=await processVerifiedOptionAlerts(enabled,snapshot,candidates,[{
  ...observed,quote:{...observed.quote,ask_price:.31}
 }],{now,resolveLink:async()=>{calls++;return link},deliver:async()=>{throw Error('unexpected delivery')}});
 assert.deepEqual(result,{status:'checked',sent:0,unlinked:0,failed:0});
 assert.equal(calls,0);
});
