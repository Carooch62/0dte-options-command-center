// Tab-scoped recovery only: never persist credentials, accounts or holdings.
import {candidateQuotes,providerBookEvidence} from './candidate-quotes.js';
import {quoteRequestTiming} from './quote-timing.js';
import {quoteDiagnostics} from './quote-evidence.js';
import {safeRequestAttempts} from './private-request.js';
import {millis} from './robinhood-review.js';
export const SESSION_KEY='private-quote-session-v1';
export const SESSION_MAX_AGE=24*60*60*1000;
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]]));
export function sessionPayload(scanner,observations,history,source,now=Date.now(),attempts=[]){
 const requests=safeRequestAttempts(attempts);
 if(!scanner)return requests.length?{format:'private-quote-session-v1',saved_at:now,scanner:null,observations:[],history:[],source:'No snapshot',requests}:null;
 const snapshot=pick(scanner,['generated_at','captured_at','scan_id','packet_id','market_session','included_contracts','total_contracts','omitted_contracts','qualifying_contracts','research_rejected_contracts','scanned_contracts']);
 snapshot.candidates=scanner.candidates.map(c=>({ticker:c.ticker,options:[...(c.options||[]),...Object.values(c.expiry_groups||{}).flatMap(g=>g?.options||[])].map(o=>pick(o,['contract_id','strike','side','expiry']))}));
 if(snapshot.candidates.reduce((n,c)=>n+c.options.length,0)>20)throw Error('Recovery supports bounded batches of at most 20 contracts. Export observations before leaving.');
 const withTiming=x=>{const timing=quoteRequestTiming(x.request_timing);return Object.keys(timing).length?{request_timing:timing}:{};};
 const mapped=observations.map(x=>({instrument:pick(x.instrument,['id','chain_symbol','strike_price','type','expiration_date','trade_value_multiplier','state','tradability','sellout_datetime']),quote:{...pick(x.quote,['instrument_id','bid_price','ask_price','updated_at']),...providerBookEvidence(x.quote)},received_at:x.received_at,...withTiming(x)}));
 const evidence=history.slice(-2000).map(q=>({...pick(q,['contract_id','observed_at','received_at','bid','ask','source','multiplier','quote_check']),...quoteDiagnostics(q),...withTiming(q)}));
 return {format:'private-quote-session-v1',saved_at:now,scanner:snapshot,observations:mapped,history:evidence,source:String(source).slice(0,200),requests};
}
export function restoreSession(raw,now=Date.now()){
 if(typeof raw!=='string'||raw.length>2000000)throw Error('Invalid saved quote session');
 const d=JSON.parse(raw);
 if(d?.format!=='private-quote-session-v1'||!Number.isFinite(d.saved_at)||d.saved_at>now||now-d.saved_at>SESSION_MAX_AGE||(d.scanner!==null&&!Array.isArray(d.scanner?.candidates))||!Array.isArray(d.observations)||d.observations.length>20||!Array.isArray(d.history)||d.history.length>2000)throw Error('Saved quote session is invalid or expired');
 const safe=sessionPayload(d.scanner,d.observations,d.history,d.source,d.saved_at,d.requests);
 if(!safe)throw Error('Empty saved session');
 if(safe.requests.some(r=>Date.parse(r.finished_at)>now))throw Error('Invalid saved request clock');
 if(safe.scanner)candidateQuotes(safe.scanner,safe.observations,now);
 for(const q of safe.history){
  const received=millis(q.received_at),observed=millis(q.observed_at);
  // A failed provider clock is retained diagnostic evidence, never a usable quote.
  // Require the explicit rejection marker; receipt clocks must still be valid.
  const rejectedClock=q.quote_check==='REQUIRES_RECHECK'&&q.multiplier===null&&q.quote_check_reasons?.includes('INVALID_QUOTE_CLOCK')&&typeof q.observed_at==='string'&&q.observed_at.length>0&&q.observed_at.length<=80;
  if(typeof q.contract_id!=='string'||!Number.isFinite(received)||received>now||(!Number.isFinite(observed)||observed>received)&&!rejectedClock)throw Error('Invalid saved observation clock');
 }
 return safe;
}

