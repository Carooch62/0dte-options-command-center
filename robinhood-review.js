// Pure, private research transformations. No credentials, network calls or trading actions.
const num=v=>typeof v==='boolean'||v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
export const millis=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)?Date.parse(v.replace(/(\.\d{3})\d+(?=Z|[+-]\d\d:\d\d$)/,'$1')):NaN;
export function validateRobinhoodPack(p){
 if(p?.format==='robinhood-review-export-v1')p=p.source_pack;
 if(p?.format!=='robinhood-research-v1'||!Number.isFinite(millis(p.retrieved_at)))throw Error('Expected robinhood-research-v1 with collection time');
 for(const k of ['accounts','observations','bars'])if(!Array.isArray(p[k])||p[k].length>10000)throw Error('Invalid '+k);
 for(const a of p.accounts)if(!a.account_key||!Array.isArray(a.orders)||a.orders.length>10000)throw Error('Invalid order coverage');
 for(const o of p.observations)if(!o.instrument?.id||o.quote?.instrument_id!==o.instrument.id||!Number.isFinite(millis(o.received_at)))throw Error('Quote/contract identity or collection time missing');
 return p;
}
export function quoteReview(o,now=Date.now()){
 const q=o.quote,i=o.instrument,bid=num(q.bid_price),ask=num(q.ask_price),t=millis(q.updated_at),received=millis(o.received_at);
 const age=Number.isFinite(t)?(now-t)/1000:null,ageAtCollection=Number.isFinite(t)?(received-t)/1000:null;
 const valid=bid!==null&&ask!==null&&bid>0&&ask>0&&bid<=ask;
 const flags=[];
 if(!valid)flags.push('Missing, zero or crossed bid/ask');
 if(age===null||age<0||ageAtCollection<0)flags.push('Missing or inconsistent quote clock');
 else if(age>60)flags.push('Quote older than 60 seconds');
 if(o.session_status!=='open')flags.push('Open market session not verified');
 const delta=num(q.delta),theta=num(q.theta);
 if(delta===null)flags.push('Delta unavailable');if(theta===null)flags.push('Theta unavailable');
 const days=(Date.parse(i.expiration_date+'T00:00:00Z')-Date.parse(new Date(now).toLocaleDateString('en-CA',{timeZone:'America/New_York'})+'T00:00:00Z'))/86400000;
 return {contract:`${i.chain_symbol} ${i.strike_price} ${i.type} ${i.expiration_date}`,instrument_id:i.id,
  bid:valid?bid:null,ask:valid?ask:null,spread:valid?ask-bid:null,spread_pct:valid?(ask-bid)/ask*100:null,
  delta,theta,quote_updated_at:q.updated_at||null,received_at:o.received_at,age_seconds:age,age_at_collection_seconds:ageAtCollection,
  timestamp_basis:'quote refresh; separate bid/ask and Greek calculation times unavailable',
  delta_1_14_day_match:days>=1&&days<=14&&delta!==null?Math.abs(delta)>=.3&&Math.abs(delta)<=.5:null,
  swing_delta_match:delta===null?null:Math.abs(delta)>=.7&&Math.abs(delta)<=.8,
  sellout_datetime:i.sellout_datetime||null,selection:o.selection||'unspecified',flags,
  status:flags.length?'REQUIRES_RECHECK':'RECENT_SNAPSHOT',executable_fill_guaranteed:false};
}
export function mergeObservations(oldRows,newRows){
 const rows=new Map();for(const o of [...oldRows,...newRows]){
  // Keep separate collections even when quote clock is unchanged (Greeks may change).
  const key=[o.instrument.id,o.quote.updated_at,o.received_at].join('|');
  if(rows.has(key)&&JSON.stringify(rows.get(key))!==JSON.stringify(o))throw Error('Conflicting observation');
  rows.set(key,o);
 }return [...rows.values()].sort((a,b)=>millis(a.received_at)-millis(b.received_at));
}
export function orderReview(accounts){
 const fills=[],issues=[],seen=new Map();let unfilled=0;
 for(const a of accounts)for(const order of a.orders){
  if(!Array.isArray(order.legs)||order.legs.length!==1){issues.push('Multileg or missing-leg order requires review: '+order.id);continue;}
  const leg=order.legs[0],executions=leg.executions||[];
  if(!executions.length){if(num(order.processed_quantity)>0)issues.push('Reported filled quantity without executions: '+order.id);else unfilled++;continue;}
  if(executions.reduce((sum,e)=>sum+(num(e.quantity)??0),0)!==num(order.processed_quantity))issues.push('Execution quantity differs from reported processed quantity: '+order.id);
  for(const e of executions){
   const price=num(e.price),qty=num(e.quantity),multiplier=num(order.trade_value_multiplier),time=millis(e.timestamp);
   if(!e.id||!leg.option_id||price===null||price<0||!Number.isInteger(qty)||qty<=0||!multiplier||multiplier<=0||!Number.isFinite(time)||!['buy','sell'].includes(leg.side)||!['open','close'].includes(leg.position_effect)){issues.push('Invalid execution: '+order.id);continue;}
   const f={account_key:a.account_key,execution_id:e.id,order_id:order.id,instrument_id:leg.option_id,ticker:order.chain_symbol,
    expiry:leg.expiration_date,strike:leg.strike_price,side:leg.option_type,action:leg.side,position_effect:leg.position_effect,
    qty,price,multiplier,filled_at:e.timestamp,order_created_at:order.created_at,placed_agent:order.placed_agent,fees:null};
   const key=a.account_key+'|'+e.id;if(seen.has(key)){if(JSON.stringify(seen.get(key))!==JSON.stringify(f))throw Error('Conflicting execution ID');continue;}seen.set(key,f);fills.push(f);
  }
 }
 fills.sort((a,b)=>millis(a.filled_at)-millis(b.filled_at));
 const groups=new Map();for(const f of fills){const key=f.account_key+'|'+f.instrument_id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(f);}
 const round_trips=[],unmatched=[];
 // Deliberately match only sequential single-execution, equal-quantity long round trips.
 for(const group of groups.values()){
 let ambiguous=false;
 for(let n=0;n<group.length;n++){
  const b=group[n],s=group[n+1];
  if(!ambiguous&&b.action==='buy'&&b.position_effect==='open'&&s?.action==='sell'&&s.position_effect==='close'&&b.qty===s.qty&&b.multiplier===s.multiplier&&millis(s.filled_at)>millis(b.filled_at)){
   round_trips.push({...b,entry:b.price,exit:s.price,closed_at:s.filled_at,exit_source:s.placed_agent,gross:(s.price-b.price)*b.qty*b.multiplier,net:null,fees:null,source_ids:[b.execution_id,s.execution_id]});n++;
  }else {unmatched.push(b);ambiguous=true;}
 }
 }
 return {fills,round_trips,unmatched,issues,unfilled_orders:unfilled,fees_status:'Unavailable from this order response; net P/L unknown'};
}
export function barReview(series,receivedAt){
 if(series.interval!=='5minute'||series.bounds!=='regular')return {symbol:series.symbol,status:'Unsupported interval/session'};
 const bars=(series.bars||[]).filter(b=>b&&!b.interpolated&&Number.isFinite(millis(b.begins_at))&&millis(b.begins_at)+300000<=millis(receivedAt)&&num(b.volume)>0&&['open_price','high_price','low_price','close_price'].every(k=>num(b[k])>0)).sort((a,b)=>millis(a.begins_at)-millis(b.begins_at));
 const days=new Set(bars.map(b=>new Date(millis(b.begins_at)).toLocaleDateString('en-CA',{timeZone:'America/New_York'})));
 if(!bars.length||days.size!==1)return {symbol:series.symbol,status:'Single session bars required'};
 const first=bars[0],last=bars.at(-1),prior=bars.at(-2),base=bars.slice(-7,-1),volume=bars.reduce((s,b)=>s+Number(b.volume),0);
 return {symbol:series.symbol,status:'BAR_RESEARCH',bars:bars.length,first_bar:first.begins_at,last_bar:last.begins_at,
  signed_move_pct:(Number(last.close_price)/Number(first.open_price)-1)*100,
  approximate_bar_vwap:bars.reduce((s,b)=>s+(Number(b.high_price)+Number(b.low_price)+Number(b.close_price))/3*b.volume,0)/volume,
  volume_burst:base.length===6?last.volume/(base.reduce((s,b)=>s+Number(b.volume),0)/6):null,
  volume_acceleration:prior?last.volume/prior.volume:null,latest_bar_close:Number(last.close_price),
  note:'OHLCV-derived VWAP approximation; sampled window may be incomplete. Interpolated and unfinished bars excluded. Not official close or entry-time evidence.'};
}
export function robinhoodResearch(p,now=Date.now()){
 p=validateRobinhoodPack(p);
 return {format:'robinhood-review-export-v1',exported_at:new Date(now).toISOString(),source_pack:p,
  quotes:p.observations.map(o=>quoteReview(o,now)),orders:orderReview(p.accounts),underlyings:p.bars.map(b=>barReview(b,p.retrieved_at)),
  ml_ready:false,limitations:'Fees and entry-time Greeks unknown. Quotes collected after an entry cannot be used as pre-entry features. Chronological session validation remains required.'};
}
