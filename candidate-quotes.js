// Private comparison only. No score, eligibility or execution mutations.
import {millis} from './robinhood-review.js';
const number=v=>typeof v==='number'||typeof v==='string'&&v.trim()!==''?Number(v):NaN;
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function candidateQuotes(snapshot,observations,now=Date.now()){
 if(!Array.isArray(snapshot?.candidates)||!Array.isArray(observations)||!Number.isFinite(now))throw Error('Scanner snapshot and Robinhood observations required');
 const rows=[];
 for(const c of snapshot.candidates){
 const contracts=[...(c.options||[]),...Object.values(c.expiry_groups||{}).flatMap(g=>g?.options||[])];
 for(const o of contracts){
 const matches=observations.filter(x=>x.instrument?.chain_symbol===c.ticker&&x.instrument?.type===o.side&&x.instrument?.expiration_date===o.expiry&&number(x.instrument?.strike_price)>0&&number(x.instrument?.strike_price)===number(o.strike));
 const ids=new Set(matches.map(x=>x.instrument.id));
 const row={contract:o.contract_id||`${c.ticker} ${o.strike} ${o.side} ${o.expiry}`,instrument_id:null,status:'UNVERIFIED',reasons:[],ranking_effect:'NONE',eligibility_effect:'NONE'};
 if(ids.size!==1){row.reasons.push(ids.size?'AMBIGUOUS_CONTRACT':'NO_CONTRACT_MATCH');rows.push(row);continue;}
 const x=[...matches].sort((a,b)=>millis(b.received_at)-millis(a.received_at))[0],i=x.instrument,q=x.quote||{};
 row.instrument_id=i.id;
 const latestCopies=matches.filter(value=>millis(value.received_at)===millis(x.received_at));
 const signature=value=>JSON.stringify([value.instrument?.id,value.instrument?.state,value.instrument?.tradability,number(value.instrument?.trade_value_multiplier),value.instrument?.sellout_datetime,value.quote?.instrument_id,value.quote?.updated_at,number(value.quote?.bid_price),number(value.quote?.ask_price)]);
 if(new Set(latestCopies.map(signature)).size>1){row.reasons.push('CONFLICTING_QUOTE_OBSERVATIONS');row.status='REQUIRES_RECHECK';rows.push(row);continue;}
 if(!uuid.test(i.id)||q.instrument_id!==i.id)row.reasons.push('QUOTE_ID_MISMATCH');
 if(number(i.trade_value_multiplier)!==100)row.reasons.push('NONSTANDARD_OR_UNKNOWN_MULTIPLIER');
 if(i.state!=='active'||i.tradability!=='tradable')row.reasons.push('CONTRACT_NOT_ACTIVE');
 const end=millis(i.sellout_datetime);
 if(!Number.isFinite(end)||end<=now)row.reasons.push('DEADLINE_UNKNOWN_OR_PASSED');
 const updated=millis(q.updated_at),received=millis(x.received_at);
 row.age_seconds=(now-updated)/1000;
 if(!Number.isFinite(updated)||!Number.isFinite(received)||updated>received||received>now||row.age_seconds<0)row.reasons.push('INVALID_QUOTE_CLOCK');
 else if(row.age_seconds>60)row.reasons.push('STALE_QUOTE');
 const bid=number(q.bid_price),ask=number(q.ask_price);
 if(!Number.isFinite(bid)||!Number.isFinite(ask)||bid<=0||ask<=0||bid>ask)row.reasons.push('INVALID_BOOK');
 else{row.bid=bid;row.ask=ask;row.spread=ask-bid;row.spread_pct=100*(ask-bid)/((ask+bid)/2);if(row.spread>.10+1e-9||row.spread_pct>30+1e-9)row.reasons.push('WIDE_SPREAD');}
 row.status=row.reasons.length?'REQUIRES_RECHECK':'QUOTE_CHECK_PASSED';
 rows.push(row);
 }}return rows;
}
