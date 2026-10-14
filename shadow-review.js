const stamp=x=>typeof x==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x));
export function validateQueue(q){
 if(q?.format!=='shadow-review-queue-v1'||!/^[a-f0-9]{64}$/.test(q.packet_id)||!stamp(q.generated_at)||!stamp(q.captured_at)||Date.parse(q.generated_at)>Date.parse(q.captured_at)||!Array.isArray(q.candidates)||!q.coverage)throw Error('Invalid review queue');
 const seen=new Set();for(const c of q.candidates){if(typeof c.candidate_id!=='string'||!c.candidate_id||seen.has(c.candidate_id)||!Array.isArray(c.evidence_gaps)||!c.evidence_gaps.every(x=>typeof x==='string'))throw Error('Invalid or duplicate queue identity');seen.add(c.candidate_id);}return q;
}
export function packetQueue(p){
 if(p?.format!=='shadow-evidence-v1'||!Array.isArray(p.candidates))throw Error('Expected a shadow evidence packet');
 return validateQueue({...p,format:'shadow-review-queue-v1',candidates:p.candidates.map(c=>({candidate_id:c.candidate_id,ticker:c.ticker,ask:c.contract?.ask,review_status:'AWAITING_REVIEW',replay_status:'NOT_RUN',evidence_gaps:['Review the frozen packet with the offline intake tool']}))});
}
export function buildReviewRows(q,corpus,replay){
 validateQueue(q);if(corpus&&(!Array.isArray(corpus.records)||corpus.packet_id!==q.packet_id))throw Error('Reviewed corpus must be bound to this packet_id');
 const cutoff=corpus?.as_of||q.captured_at;
 if(!stamp(cutoff)||Date.parse(cutoff)<Date.parse(q.captured_at))throw Error('Decision cutoff must be at or after packet capture');
 if(replay&&(replay.packet_id!==q.packet_id||Date.parse(replay.as_of)!==Date.parse(cutoff)||!Array.isArray(replay.scored)||!Array.isArray(replay.withheld)))throw Error('Replay report does not match this packet and cutoff');
 return q.candidates.map(c=>{
  const r={...c,review_status:'AWAITING_REVIEW',replay_status:'NOT_RUN',reasons:[...c.evidence_gaps]};
  const records=corpus?.records.filter(x=>x.candidate_id===c.candidate_id)||[];
  if(Date.parse(cutoff)>Date.parse(q.captured_at))r.reasons.push('Later declared decision cutoff: '+cutoff);
  if(records.length){r.review_status='REVIEW_SUPPLIED_UNVALIDATED';for(const x of records){if(x.evidence_set_id!==q.packet_id||Date.parse(x.as_of)!==Date.parse(cutoff)){r.reasons.push('REVIEW_PACKET_OR_CUTOFF_MISMATCH');continue;}if(!stamp(x.reviewed_at)||Date.parse(x.reviewed_at)>Date.parse(cutoff))r.reasons.push('REVIEW_AFTER_CUTOFF');}}
  const withheld=replay?.withheld.find(x=>x.candidate_id===c.candidate_id),scored=replay?.scored.find(x=>x.candidate_id===c.candidate_id);
  if(withheld){r.replay_status='WITHHELD';r.reasons.push(...withheld.reasons);}else if(scored)r.replay_status='ADMITTED_OFFLINE';
  return r;
 });
}
export function outcomeSummary(report){
 if(report?.format!=='shadow-outcomes-v1'||!Array.isArray(report.results))throw Error('Expected a shadow outcome report');
 const windows=report.results.flatMap(r=>r.windows||[]),complete=windows.filter(w=>w.status==='QUOTE_ESTIMATE').length;
 return `${report.results.length} decision records · ${complete} quote-based windows · ${windows.filter(w=>w.status?.startsWith('WITHHELD')).length} withheld · ${windows.filter(w=>w.status==='PENDING').length} pending. Quotes are estimates, not fills; missing clocks and observations are withheld.`;
}
