import {candidateQuotes} from './candidate-quotes.js';
import {quoteRequestTiming} from './quote-timing.js';
import {safeRequestAttempts} from './private-request.js';
export const VALIDATION_MINUTES=Object.freeze([5,10,15]);
const messages={
 CONFLICTING_QUOTE_OBSERVATIONS:'Conflicting quotes share the latest collection time. Refresh matched quotes; neither copy is accepted as evidence.',
 NO_CONTRACT_MATCH:'Contract metadata has not been matched. Use Match contracts and fetch live quotes.',
 AMBIGUOUS_CONTRACT:'More than one contract identity matches. Reload the current batch and match again; keep this contract unverified.',
 QUOTE_ID_MISMATCH:'Quote identity does not match the contract. Match again before using this price.',
 NONSTANDARD_OR_UNKNOWN_MULTIPLIER:'The standard 100 price multiplier is unverified. Check contract metadata; refreshing the price cannot resolve this.',
 CONTRACT_NOT_ACTIVE:'The contract is inactive or not tradable. Load a current scanner batch.',
 DEADLINE_UNKNOWN_OR_PASSED:'The trading deadline is missing or has passed. Check the expiration and load a current batch.',
 INVALID_QUOTE_CLOCK:'The quote time is missing or inconsistent. Refresh; keep the price unverified if its clock remains unknown.',
 STALE_QUOTE:'The quote is over 60 seconds old. Refresh matched option quotes.',
 INVALID_BOOK:'The bid or ask is missing, zero, or crossed. Refresh and wait for a valid two-sided quote.',
 WIDE_SPREAD:'The spread exceeds the quote-check limit. Refresh to recheck; the current book fails this screen.'
};
export function quoteDiagnostics(record){
 const result={};
 if(Object.hasOwn(record,'metadata_multiplier'))result.metadata_multiplier=typeof record.metadata_multiplier==='number'&&Number.isFinite(record.metadata_multiplier)&&record.metadata_multiplier>0?record.metadata_multiplier:null;
 if(Array.isArray(record.quote_check_reasons))result.quote_check_reasons=[...new Set(record.quote_check_reasons.filter(r=>typeof r==='string'&&Object.hasOwn(messages,r)))].slice(0,10);
 return result;
}
export function quoteGuidance(row){
 if(row.reasons.length)return row.reasons.map(reason=>messages[reason]||reason).join(' ');
 return row.premium_status==='ABOVE_LIMIT'?'Live ask is above $0.30. This contract is outside the price limit; reload the batch or recheck later.':'Quote check passed and live ask is within $0.30. Setup and market-session checks remain separate.';
}
export function appendQuoteEvidence(snapshot,observations,history,now=Date.now()){
 const rows=candidateQuotes(snapshot,observations,now),next=[...history];
 for(const row of rows){
  if(!row.instrument_id)continue;
  if(!row.observed_at||!row.received_at)continue;
  const record={contract_id:row.contract,observed_at:row.observed_at,received_at:row.received_at,
   bid:row.bid??null,ask:row.ask??null,source:'Robinhood Quotes',
   multiplier:row.status==='QUOTE_CHECK_PASSED'?100:null,quote_check:row.status,
   ...quoteDiagnostics({metadata_multiplier:row.metadata_multiplier??null,quote_check_reasons:row.reasons})};
  const timing=quoteRequestTiming(row.request_timing);if(Object.keys(timing).length)record.request_timing=timing;
  if(!next.some(p=>p.contract_id===record.contract_id&&p.observed_at===record.observed_at&&p.received_at===record.received_at))next.push(record);
 }
 if(next.length<=2000)return next;
 // Keep the first passing receipt immutable even when recent diagnostics roll off.
 const keep=new Set(),contracts=new Set();
 for(let index=0;index<next.length;index++){
  const quote=next[index];
  if(quote.multiplier===100&&!contracts.has(quote.contract_id)){contracts.add(quote.contract_id);keep.add(index);}
 }
 for(let index=next.length-1;index>=0&&keep.size<2000;index--)keep.add(index);
 return next.filter((_,index)=>keep.has(index));
}
export function quoteEvidenceInput(snapshot,history,now=new Date().toISOString(),attempts=[]){
 const entries=[],seen=new Set();
 for(const quote of history){if(quote.multiplier!==100||seen.has(quote.contract_id))continue;seen.add(quote.contract_id);entries.push({candidate_id:quote.contract_id,decision_at:quote.received_at,quote});}
 return {format:'shadow-outcome-input-v1',as_of:now,entries,observations:history,requests:safeRequestAttempts(attempts),
  scanner_context:{scan_id:snapshot?.scan_id??null,generated_at:snapshot?.generated_at??null,packet_id:snapshot?.packet_id??null,captured_at:snapshot?.captured_at??null},
  limitations:['Private browser-local observations, exported only on request. No account or holdings data.',
   'Decision cutoff is first passing quote receipt, not the earlier scanner timestamp.',
   'Quotes are not executions; observations are collected only when you request refresh.',
   'multiplier is set only for passing quote checks; metadata_multiplier and quote_check_reasons are diagnostic evidence, not eligibility.',
   'At most 2000 observations retained; tab recovery expires after 24 hours. Export for durable retention.'],
  validation_policy:{horizons_minutes:VALIDATION_MINUTES,window_tolerance_seconds:60,entry:'ask',exit:'bid'}};
}
export function scannerFromEvidencePacket(packet){
 const validClock=value=>typeof value==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
 if(packet?.format!=='shadow-evidence-v1'||!/^[a-f0-9]{64}$/.test(packet.packet_id)||!validClock(packet.generated_at)||!validClock(packet.captured_at)||Date.parse(packet.generated_at)>Date.parse(packet.captured_at)||!Array.isArray(packet.candidates)||packet.candidates.length>20)throw Error('Expected a bounded staging evidence packet with original timestamps');
 const seen=new Set(),tickers=new Map();
 const candidates=packet.candidates.map(c=>{
  const o=c.contract;
  if(typeof c.ticker!=='string'||!c.ticker||typeof c.candidate_id!=='string'||!c.candidate_id||o?.contract_id!==c.candidate_id||seen.has(c.candidate_id)||!['call','put'].includes(o.side)||!Number.isFinite(o.strike)||o.strike<=0||!/^\d{4}-\d{2}-\d{2}$/.test(o.expiry))throw Error('Invalid or duplicate evidence contract');
  seen.add(c.candidate_id);tickers.set(c.ticker,(tickers.get(c.ticker)||0)+1);if(tickers.get(c.ticker)>2)throw Error('Evidence batch exceeds two contracts per ticker');
  return {ticker:c.ticker,options:[{contract_id:o.contract_id,strike:o.strike,side:o.side,expiry:o.expiry}]};
 });
 return {generated_at:packet.generated_at,captured_at:packet.captured_at,scan_id:packet.scan_id,packet_id:packet.packet_id,market_session:packet.market_session,candidates,included_contracts:candidates.length,total_contracts:packet.coverage?.qualifying??candidates.length,omitted_contracts:packet.coverage?.omitted??0};
}
export function captureWindows(history,now=Date.now()){
 return quoteEvidenceInput(null,history).entries.flatMap(entry=>VALIDATION_MINUTES.map(minutes=>{
  const target=Date.parse(entry.decision_at)+minutes*60000,closes=target+60000;
  const samples=history.filter(q=>q.contract_id===entry.candidate_id&&Date.parse(q.observed_at)>=target&&Date.parse(q.observed_at)<=closes&&Date.parse(q.received_at)<=now);
  const captured=samples.some(q=>q.multiplier===100&&(!q.quote_check||q.quote_check==='QUOTE_CHECK_PASSED'));
  const state=captured?'CAPTURED':now>closes?'MISSING':now>=target?'OPEN':'UPCOMING';
  const received=history.filter(q=>q.contract_id===entry.candidate_id&&Date.parse(q.received_at)>=target&&Date.parse(q.received_at)<=Math.min(closes,now));
  const reasons=[...new Set(samples.flatMap(q=>quoteDiagnostics(q).quote_check_reasons||[]))];
  let explanation;
  if(captured)explanation='Passing quote captured.';
  else if(state==='UPCOMING')explanation='Waiting for this window to open.';
  else if(samples.length){
   explanation=reasons.includes('WIDE_SPREAD')?'Spread check failed.':reasons.includes('STALE_QUOTE')?'Quote freshness check failed.':'Quote checks failed.';
  }else if(!received.length)explanation='No contract quote received during this window.';
  else if(received.every(q=>Date.parse(q.observed_at)<target))explanation='Provider timestamp is before the capture target.';
  else if(received.every(q=>Date.parse(q.observed_at)>closes))explanation='Provider timestamp is after the capture window.';
  else explanation='No usable provider timestamp inside this window.';
  return {contract:entry.candidate_id,minutes,target,closes,state,seconds:Math.max(0,Math.ceil(((now<target?target:closes)-now)/1000)),failed_checks:samples.length>0&&!captured,explanation};
 }));
}
export function validationTiming(history,now=Date.now()){
 const entries=quoteEvidenceInput(null,history).entries;
 if(!entries.length)return 'Validation clock starts after the first passing fetched quote. No automatic quote polling.';
 const details=captureWindows(history,now),clock=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
 const windows=VALIDATION_MINUTES.map(minutes=>{
  const rows=details.filter(w=>w.minutes===minutes),complete=rows.filter(w=>w.state==='CAPTURED').length,due=rows.filter(w=>w.state==='OPEN'),missed=rows.filter(w=>w.state==='MISSING').length,upcoming=rows.filter(w=>w.state==='UPCOMING');
  return `${minutes}-min: ${complete}/${entries.length} captured${due.length?' · refresh now · closes in '+clock(Math.min(...due.map(w=>w.seconds))):upcoming.length?' · next in '+clock(Math.min(...upcoming.map(w=>w.seconds))):''}${missed?' · '+missed+' missing windows':''}`;
 });
 return windows.join(' | ')+' · Refresh manually; export before leaving. Backgrounded phones may pause page updates.';
}
export function captureAction(windows){
 if(!windows.length)return 'Match contracts and fetch the first passing quote to start capture windows.';
 const open=windows.filter(w=>w.state==='OPEN').sort((a,b)=>a.closes-b.closes)[0];
 const next=open||windows.filter(w=>w.state==='UPCOMING').sort((a,b)=>a.target-b.target)[0];
 const missed=windows.filter(w=>w.state==='MISSING').length;
 if(!next)return `Capture windows finished: ${windows.filter(w=>w.state==='CAPTURED').length}/${windows.length} captured. Export this session. Missing windows stay missing.`;
 const time=value=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit',second:'2-digit'}).format(new Date(value));
 const remaining=Math.floor(next.seconds/60)+':'+String(next.seconds%60).padStart(2,'0');
 const horizon=windows.filter(w=>w.minutes===next.minutes),complete=horizon.filter(w=>w.state==='CAPTURED').length;
 return `${open?'Refresh now':'Next capture'} · ${next.minutes}-minute window ${time(next.target)}–${time(next.closes)} ET. ${open?'Closes':'Opens'} in ${remaining}. ${complete}/${horizon.length} captured for this horizon.${missed?' '+missed+' earlier contract windows missed.':''}`;
}



