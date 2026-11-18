// Server-collected quote evidence only. No account records, credentials or executions.
const allowed=['symbol','instrument_id','bid_price','ask_price','bid_size','ask_size','last_trade_price','mark_price','delta','gamma','theta','vega','rho','implied_volatility','open_interest','volume','updated_at','venue_bid_time','venue_ask_time','venue_last_trade_time'];
const stamp=s=>typeof s==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(s)&&Number.isFinite(Date.parse(s));
export function evidenceRecords(observations,{received_at,kind,scan_id=null,generated_at=null}={}){
 if(!stamp(received_at)||!['option','equity'].includes(kind)||!Array.isArray(observations)||observations.length>20)throw Error('Invalid evidence batch');
 if(scan_id!==null&&(typeof scan_id!=='string'||!/^[-A-Za-z0-9_:]{1,100}$/.test(scan_id)))throw Error('Invalid scan identity');
 if(generated_at!==null&&(!stamp(generated_at)||Date.parse(generated_at)>Date.parse(received_at)))throw Error('Invalid scan clock');
 return observations.map(o=>{
  const q=o.quote,identity=kind==='option'?q?.instrument_id:q?.symbol;
  if(typeof identity!=='string'||!identity||identity.length>100)throw Error('Missing quote identity');
  const quote=Object.fromEntries(allowed.filter(k=>['number','boolean','string'].includes(typeof q[k])&&(typeof q[k]!=='string'||q[k].length<=100)).map(k=>[k,q[k]]));
  const instrument=o.instrument?Object.fromEntries(['id','chain_symbol','expiration_date','type','strike_price','trade_value_multiplier','tradability','state'].filter(k=>['number','string'].includes(typeof o.instrument[k])).map(k=>[k,o.instrument[k]])):null;
  return {format:'private-quote-evidence-v1',kind,identity,quote,instrument,received_at,scan_id,generated_at,source:'Robinhood MCP',execution:false,latency_verified:false};
 });
}
export function mergeEvidence(previous,records){
 const rows=[...previous];
 for(const record of records){
  const key=r=>JSON.stringify([r.kind,r.identity,r.quote.updated_at??null,r.received_at,r.scan_id]);
  const existing=rows.find(r=>key(r)===key(record));
  if(existing){if(JSON.stringify(existing)!==JSON.stringify(record))throw Error('Conflicting duplicate quote evidence');continue;}
  rows.push(record);
 }
 return {records:rows.slice(-2000),omitted:(Math.max(0,rows.length-2000))};
}
