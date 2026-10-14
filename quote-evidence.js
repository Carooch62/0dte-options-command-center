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
  scanner_context:{scan_id:snapshot?.scan_id??null,generated_at:snapshot?.generated_at??null},
  limitations:['Private browser-local observations, exported only on request. No account or holdings data.',
   'Decision cutoff is first passing quote receipt, not the earlier scanner timestamp.',
   'Quotes are not executions; observations are collected only when you request refresh.',
   'At most 2000 observations retained in this page session; reload clears them.']};
}
