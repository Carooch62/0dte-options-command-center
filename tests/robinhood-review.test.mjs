import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteReview,orderReview,barReview,mergeObservations,validateRobinhoodPack} from '../robinhood-review.js';
const now=Date.parse('2026-10-07T18:00:00Z');
const observation=()=>({instrument:{id:'opt',chain_symbol:'SPY',strike_price:'780',type:'put',expiration_date:'2026-10-09',sellout_datetime:'2026-10-09T19:45:00Z'},quote:{instrument_id:'opt',bid_price:'.20',ask_price:'.22',delta:'-.4',theta:'0',updated_at:'2026-10-07T17:59:40Z'},received_at:'2026-10-07T17:59:45Z',session_status:'open'});
test('quote age uses provider clock, signed put delta and missing Greek stay explicit',()=>{
 const o=observation(),q=quoteReview(o,now);assert.equal(q.age_seconds,20);assert.equal(q.age_at_collection_seconds,5);assert.equal(q.delta_1_14_day_match,true);assert.equal(q.theta,0);assert.equal(q.status,'RECENT_SNAPSHOT');
 o.quote.theta=null;assert.equal(quoteReview(o,now).status,'REQUIRES_RECHECK');
 o.quote.bid_price='.30';assert.equal(quoteReview(o,now).bid,null);
 o.quote.updated_at='2026-10-07T19:00:00Z';assert.match(quoteReview(o,now).flags.join(),/clock/);
});
test('closed session and stale quotes never become recent',()=>{const o=observation();o.session_status='closed';assert.equal(quoteReview(o,now).status,'REQUIRES_RECHECK');o.session_status='open';assert.equal(quoteReview(o,now+120000).status,'REQUIRES_RECHECK');});
test('tracking deduplicates collection but keeps changed Greeks under same quote clock',()=>{const a=observation(),b=structuredClone(a);b.received_at='2026-10-07T17:59:50Z';b.quote.theta='-.01';assert.equal(mergeObservations([a],[a,b]).length,2);b.received_at=a.received_at;assert.throws(()=>mergeObservations([a],[b]),/Conflicting/);});
const order=(id,side,effect,time,price)=>({id,chain_symbol:'SPY',created_at:time,trade_value_multiplier:'100',placed_agent:side==='sell'?'expiring_option':'user',processed_quantity:'1',legs:[{option_id:'opt',expiration_date:'2026-10-07',strike_price:'780',option_type:'put',side,position_effect:effect,executions:[{id:'fill'+id,quantity:'1',price,timestamp:time}]}]});
test('execution timestamps and forced exit source preserved; missing fees never zero',()=>{const b=order('a','buy','open','2026-10-07T17:00:00.123Z','.20'),s=order('b','sell','close','2026-10-07T17:30:00.456Z','.30');const r=orderReview([{account_key:'private1',orders:[b,s,b]}]);assert.equal(r.fills.length,2);assert.ok(Math.abs(r.round_trips[0].gross-10)<1e-9);assert.equal(r.round_trips[0].net,null);assert.equal(r.round_trips[0].filled_at,'2026-10-07T17:00:00.123Z');assert.equal(r.round_trips[0].exit_source,'expiring_option');});
test('cancelled unfilled orders and unmatched closes do not create profitable trades',()=>{const b=order('a','buy','open','2026-10-07T17:00:00Z','.20');b.legs[0].executions=[];b.processed_quantity='0';const s=order('b','sell','close','2026-10-07T17:30:00Z','.30');const r=orderReview([{account_key:'private1',orders:[b,s]}]);assert.equal(r.unfilled_orders,1);assert.equal(r.round_trips.length,0);assert.equal(r.unmatched.length,1);});
test('different accounts never reconcile and conflicting IDs reject',()=>{const b=order('a','buy','open','2026-10-07T17:00:00Z','.20'),s=order('b','sell','close','2026-10-07T17:30:00Z','.30');assert.equal(orderReview([{account_key:'a',orders:[b]},{account_key:'b',orders:[s]}]).round_trips.length,0);const conflict=structuredClone(b);conflict.legs[0].executions[0].price='.40';assert.throws(()=>orderReview([{account_key:'a',orders:[b,conflict]}]),/Conflicting/);});
test('underlying comparison excludes interpolated and unfinished bars',()=>{const bar=(time,interpolated=false)=>({begins_at:time,open_price:'10',high_price:'12',low_price:'9',close_price:'11',volume:100,interpolated});const r=barReview({symbol:'X',interval:'5minute',bounds:'regular',bars:[bar('2026-10-07T17:45:00Z'),bar('2026-10-07T17:50:00Z',true),bar('2026-10-07T17:59:00Z')]},'2026-10-07T18:00:00Z');assert.equal(r.bars,1);assert.ok(Math.abs(r.signed_move_pct-10)<1e-9);assert.equal(r.volume_acceleration,null);});
test('import rejects mismatched quote identity',()=>{const o=observation();o.quote.instrument_id='other';assert.throws(()=>validateRobinhoodPack({format:'robinhood-research-v1',retrieved_at:'2026-10-07T18:00:00Z',accounts:[],bars:[],observations:[o]}));});

test('overlapping opening fills never generate a guessed round trip',()=>{
 const orders=[order('a','buy','open','2026-10-07T17:00:00Z','.20'),order('b','buy','open','2026-10-07T17:01:00Z','.21'),order('c','sell','close','2026-10-07T17:30:00Z','.30')];
 const r=orderReview([{account_key:'a',orders}]);assert.equal(r.round_trips.length,0);assert.equal(r.unmatched.length,3);
});
test('export source pack can be reimported',()=>{
 const p={format:'robinhood-research-v1',retrieved_at:'2026-10-07T18:00:00Z',accounts:[],observations:[],bars:[]};
 assert.equal(validateRobinhoodPack({format:'robinhood-review-export-v1',source_pack:p}),p);
});
