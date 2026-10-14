import {candidateQuotes} from './candidate-quotes.js';
const messages={
 NO_CONTRACT_MATCH:'Contract metadata has not been matched. Use Match contracts and fetch live quotes.',
 AMBIGUOUS_CONTRACT:'More than one contract identity matches. Reload the current batch and match again; keep this contract unverified.',
 QUOTE_ID_MISMATCH:'Quote identity does not match the contract. Match again before using this price.',
 NONSTANDARD_OR_UNKNOWN_MULTIPLIER:'The standard 100-share multiplier is unverified. Check contract metadata; refreshing the price cannot resolve this.',
 CONTRACT_NOT_ACTIVE:'The contract is inactive or not tradable. Load a current scanner batch.',
 DEADLINE_UNKNOWN_OR_PASSED:'The trading deadline is missing or has passed. Check the expiration and load a current batch.',
 INVALID_QUOTE_CLOCK:'The quote time is missing or inconsistent. Refresh; keep the price unverified if its clock remains unknown.',
 STALE_QUOTE:'The quote is over 60 seconds old. Refresh matched option quotes.',
 INVALID_BOOK:'The bid or ask is missing, zero, or crossed. Refresh and wait for a valid two-sided quote.',
 WIDE_SPREAD:'The spread exceeds the quote-check limit. Refresh to recheck; the current book fails this screen.'
};
export function quoteGuidance(row){
 if(row.reasons.length)return row.reasons.map(reason=>messages[reason]||reason).join(' ');
 return row.premium_status==='ABOVE_LIMIT'?'Live ask is above $0.30. This contract is outside the price limit; reload the batch or recheck later.':'Quote check passed and live ask is within $0.30. Setup and market-session checks remain separate.';
}
export function appendQuoteEvidence(snapshot,observations,history,now=Date.now()){
 const rows=candidateQuotes(snapshot,observations,now),next=[...history];
 for(const row of rows){
  if(!row.instrument_id)continue;
  const x=observations.find(x=>x.instrument.id===row.instrument_id),q=x?.quote;
  if(!q?.updated_at||!x.received_at)continue;
  const record={contract_id:row.contract,observed_at:q.updated_at,received_at:x.received_at,
   bid:row.bid??null,ask:row.ask??null,source:'Robinhood Quotes',
   multiplier:row.status==='QUOTE_CHECK_PASSED'?100:null,quote_check:row.status};
  if(!next.some(p=>p.contract_id===record.contract_id&&p.observed_at===record.observed_at&&p.received_at===record.received_at))next.push(record);
 }
 return next.slice(-2000);
}
export function quoteEvidenceInput(snapshot,history,now=new Date().toISOString()){
 const entries=[],seen=new Set();
 for(const quote of history){if(quote.multiplier!==100||seen.has(quote.contract_id))continue;seen.add(quote.contract_id);entries.push({candidate_id:quote.contract_id,decision_at:quote.received_at,quote});}
 return {format:'shadow-outcome-input-v1',as_of:now,entries,observations:history,
  scanner_context:{scan_id:snapshot?.scan_id??null,generated_at:snapshot?.generated_at??null,packet_id:snapshot?.packet_id??null,captured_at:snapshot?.captured_at??null},
  limitations:['Private browser-local observations, exported only on request. No account or holdings data.',
   'Decision cutoff is first passing quote receipt, not the earlier scanner timestamp.',
   'Quotes are not executions; observations are collected only when you request refresh.',
   'At most 2000 observations retained in this page session; reload clears them.']};
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
export function validationTiming(history,now=Date.now()){
 const entries=quoteEvidenceInput(null,history).entries;
 if(!entries.length)return 'Validation clock starts after the first passing fetched quote. No automatic quote polling.';
 const windows=[5,15,30].map(minutes=>{
  let complete=0,due=0,missed=0;const targets=[];
  for(const entry of entries){
   const target=Date.parse(entry.decision_at)+minutes*60000;targets.push(target);
   const captured=history.some(q=>q.contract_id===entry.candidate_id&&q.multiplier===100&&Date.parse(q.observed_at)>=target&&Date.parse(q.observed_at)<=target+60000&&Date.parse(q.received_at)<=now);
   if(captured)complete++;else if(now>target+60000)missed++;else if(now>=target)due++;
  }
  const wait=Math.max(0,Math.ceil((Math.min(...targets)-now)/1000));
  return `${minutes}-min: ${complete}/${entries.length} captured${due?' · refresh now':wait?' · next in '+Math.floor(wait/60)+':'+String(wait%60).padStart(2,'0'):''}${missed?' · '+missed+' missing windows':''}`;
 });
 return windows.join(' | ')+' · Refresh manually; export before leaving. Backgrounded phones may pause page updates.';
}

