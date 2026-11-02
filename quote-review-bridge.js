// Convert only user-fetched, browser-local scanner quote evidence into a
// quote-only brokerage review import. No account data, credentials or trades.
import {validateRobinhoodPack} from './robinhood-review.js';

const keys=(o,names)=>Object.fromEntries(names.filter(k=>o?.[k]!==undefined).map(k=>[k,o[k]]));
const validTime=x=>typeof x==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x));
const identity=i=>[i?.chain_symbol,i?.type,i?.expiration_date,Number(i?.strike_price)].join('|');
const contractKey=(ticker,c)=>[ticker,c?.side,c?.expiry,Number(c?.strike)].join('|');
const instrumentFields=['id','chain_id','chain_symbol','expiration_date','strike_price','type','state','tradability','trade_value_multiplier','sellout_datetime'];
const quoteFields=['bid_size','ask_size','mark_price','delta','gamma','theta','vega','rho','implied_volatility','open_interest','volume'];
export function quoteOnlyResearchPack(scanner,latest,history,exportedAt){
 if(!Array.isArray(scanner?.candidates)||!Array.isArray(latest)||!Array.isArray(history)||!validTime(exportedAt))throw Error('Scanner and timestamped quotes required');
 const contractIndex=new Map();
 for(const c of scanner.candidates)for(const o of [...(c.options||[]),...Object.values(c.expiry_groups||{}).flatMap(g=>g?.options||[])]){
  const key=contractKey(c.ticker,o);if(!contractIndex.has(key))contractIndex.set(key,new Set());contractIndex.get(key).add(o.contract_id);
 }
 const matched=new Map();
 for(const x of latest){
  const i=x.instrument,k=identity(i),allowed=contractIndex.get(k);
  if(typeof i?.id!=='string'||!allowed?.size)continue;
  for(const contract of allowed){if(!matched.has(contract))matched.set(contract,new Map());matched.get(contract).set(i.id,i);}
 }
 const observations=[];let omitted=0;
 for(const record of history){
  const matches=matched.get(record.contract_id);
  if(!matches||matches.size!==1||!validTime(record.received_at)){omitted++;continue;}
  const i=[...matches.values()][0],quote={
   instrument_id:i.id,bid_price:record.bid??null,ask_price:record.ask??null,
   updated_at:record.observed_at??null,
   ...keys(record,quoteFields)
  };
  observations.push({instrument:keys(i,instrumentFields),quote,received_at:record.received_at,
    session_status:'unverified',selection:'SCANNER_BATCH_RESEARCH',
    ...(scanner.scan_id?{scan_id:scanner.scan_id}:{})});
 }
 if(!observations.length)throw Error('No timestamped quote evidence matched exact contract metadata. Match and fetch quotes first.');
 const pack={format:'robinhood-research-v1',coverage_mode:'observations_only',
  retrieved_at:exportedAt,accounts:[],bars:[],observations,
  research_notes:{included:observations.length,omitted,market_session:'unverified',
   caveat:'Observed quotes, not fills. Separate bid/ask and Greek event clocks unavailable. Do not use post-entry observations as entry features; do not treat scanner selection as an executed trade.'}};
 return validateRobinhoodPack(pack);
}
