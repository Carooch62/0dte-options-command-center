const stamp=v=>Date.parse(v);
export function validateExecutionPack(pack){
 if(pack?.format!=='execution-review-v1'||!Array.isArray(pack.records)||pack.records.length>10000)throw Error('Expected execution-review-v1 records.');
 const seen=new Set();
 for(const r of pack.records){
  const key=`${r.transaction_id}|${r.action}`;
  if(!r.transaction_id||!r.symbol||!['buy','sell'].includes(r.action)||!['minute','second'].includes(r.precision)||!r.source_ref||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d)$/.test(r.filled_at)||!Number.isFinite(stamp(r.filled_at))||!Number.isInteger(r.qty)||r.qty<=0||!Number.isFinite(r.price)||r.price<0||seen.has(key))throw Error('Invalid or duplicate execution evidence record.');
  if(r.precision==='minute'&&!/:00(?:Z|[+-]\d\d:\d\d)$/.test(r.filled_at))throw Error('Minute evidence must use the beginning of the displayed minute.');
  seen.add(key);
 }
 return pack;
}
export function applyExecutionEvidence(trades,evidence){
 const records=validateExecutionPack({format:'execution-review-v1',records:evidence}).records,used=new Set(),issues=[];
 const rows=trades.map(t=>{
  const match=(action,index,price)=>{
   const r=records.find(r=>r.transaction_id===t.source_ids[index]&&r.action===action);
   if(!r)return null;
   if(r.symbol!==t.symbol||r.qty!==t.qty||Math.abs(r.price-price)>.000001){issues.push({symbol:t.symbol,reason:'Execution evidence contract, quantity or price conflicts with provider record'});return null;}
   used.add(r);return r;
  };
  const entry=match('buy',0,t.entry),exit=match('sell',1,t.exit);
  if(entry&&exit&&stamp(exit.filled_at)<stamp(entry.filled_at)){issues.push({symbol:t.symbol,reason:'Execution evidence closes before entry'});return t;}
  return {...t,entry_fill_at:entry?.filled_at||null,exit_fill_at:exit?.filled_at||null,execution_time_verified:!!(entry&&exit&&entry.precision==='second'&&exit.precision==='second'),execution_evidence:{entry,exit},execution_evidence_status:entry||exit?'USER_SUPPLIED_FILL_EVIDENCE':'UNVERIFIED',comparison_at:entry?.filled_at||t.time,comparison_time_basis:entry?`user-supplied fill evidence (${entry.precision} precision)`:'provider transaction timestamp, not verified fill'};
 });
 for(const r of records)if(!used.has(r))issues.push({symbol:r.symbol,reason:'Execution evidence not matched to a reconciled provider transaction'});
 return {rows,issues};
}
