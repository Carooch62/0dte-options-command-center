// Private brokerage records are processed locally. No network calls in this module.
const num=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const iso=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
export function parseOption(symbol){
 const m=String(symbol||'').match(/^([A-Z]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
 if(!m)return null;
 const expiry=`20${m[2]}-${m[3]}-${m[4]}`;
 if(!Number.isFinite(Date.parse(expiry))||new Date(expiry).toISOString().slice(0,10)!==expiry)return null;
 return {ticker:m[1],expiry,side:m[5]==='C'?'call':'put',strike:Number(m[6])/1000};
}
export function validatePack(p){
 if(p?.format!=='broker-review-v1'||!Array.isArray(p.transactions)||!Array.isArray(p.holdings)||p.transactions.length>10000||p.holdings.length>10000)throw Error('Expected a brokerage review import with transactions and holdings.');
 if(!iso(p.retrieved_at))throw Error('Missing retrieval timestamp.');
 return p;
}
export function reconcile(p){
 validatePack(p);
 const groups=new Map(),seen=new Map(),issues=[],ignored=[];
 for(const r of p.transactions){
  const id=r.investment_transaction_id,key=`${r.account_key||r.account_id||''}|${r.ticker_symbol||''}`;
  if(!id||!(r.account_key||r.account_id)){issues.push({reason:'Missing account or transaction ID',symbol:r.ticker_symbol});continue;}
  const uid=`${r.account_key||r.account_id}|${id}`;
  if(seen.has(uid)){
   if(JSON.stringify(seen.get(uid))!==JSON.stringify(r)){issues.push({reason:'Conflicting duplicate transaction',symbol:r.ticker_symbol});const g=groups.get(key);if(g)g.invalid=true;}
   continue;
  }
  seen.set(uid,r);
  const option=parseOption(r.ticker_symbol);
  if(!option){if(/\b(call|put)\b.*\bstrike\b/i.test(r.name||''))issues.push({symbol:r.ticker_symbol||r.security_name||r.security_id||'Unknown option',source_id:id,reason:'Option description present but a standard contract symbol is missing; expiry and contract identity require review'});else ignored.push(r);continue;}
  if(!groups.has(key))groups.set(key,{option,symbol:r.ticker_symbol,rows:[],invalid:false});
  groups.get(key).rows.push(r);
 }
 const trades=[];
 for(const [key,g] of groups){
  const rows=g.rows.sort((a,b)=>Date.parse(a.transaction_datetime)-Date.parse(b.transaction_datetime));
  // Only an unambiguous one-open/one-close round trip is automatically reconciled.
  // Multiple lots, partial fills, cancellations and corporate actions need review.
  const buys=rows.filter(r=>r.type==='buy'&&/to open/i.test(r.name||''));
  const sells=rows.filter(r=>r.type==='sell'&&/to close/i.test(r.name||''));
  const b=buys[0],s=sells[0];
  if(g.invalid||rows.length!==2||buys.length!==1||sells.length!==1){issues.push({symbol:g.symbol,reason:'Unmatched or multiple lots / lifecycle events; review required'});continue;}
  const quantity=r=>{const m=String(r.name).match(/^(?:buy|sell)\s+(\d+(?:\.\d+)?)\s/i);return m?Number(m[1]):null;};
  const q=quantity(b),sq=quantity(s),bp=num(b.price),sp=num(s.price),bf=num(b.fees),sf=num(s.fees);
  const consistent=r=>(!r.iso_currency_code||r.iso_currency_code==='USD')&&!r.cancel_transaction_id&&(r.type==='buy'?r.quantity>0&&r.amount>0:r.quantity<0&&r.amount<=0)&&num(r.quantity)!==null&&Math.abs(r.quantity)===q*100&&num(r.amount)!==null&&Math.abs(Math.abs(r.amount)-q*100*r.price)<.011;
  if(!Number.isInteger(q)||q<=0||sq!==q||bp===null||bp<=0||sp===null||sp<0||!consistent(b)||!consistent(s)||!iso(b.transaction_datetime)||!iso(s.transaction_datetime)||Date.parse(s.transaction_datetime)<Date.parse(b.transaction_datetime)){
   issues.push({symbol:g.symbol,reason:'Quantity, price, amount or timestamp needs review'});continue;
  }
  const fees=bf!==null&&sf!==null&&bf>=0&&sf>=0?bf+sf:null,gross=(sp-bp)*q*100;
  trades.push({id:`${key}|${b.investment_transaction_id}|${s.investment_transaction_id}`,symbol:g.symbol,...g.option,qty:q,entry:bp,exit:sp,fees,gross,net:fees===null?null:gross-fees,time:b.transaction_datetime,closedAt:s.transaction_datetime,timestamp_basis:'provider transaction time; may be order initiation, not fill',source_ids:[b.investment_transaction_id,s.investment_transaction_id]});
 }
 return {trades,issues,ignored_count:ignored.length};
}
export function scannerComparison(trade,history){
 const t=Date.parse(trade.time),day=new Date(t).toLocaleDateString('en-CA',{timeZone:'America/New_York'});
 const snapshots=history.filter(s=>{const published=Date.parse(s.dashboard_generated_at||s.generated_at);return published<=t&&new Date(published).toLocaleDateString('en-CA',{timeZone:'America/New_York'})===day;}).sort((a,b)=>Date.parse(b.dashboard_generated_at||b.generated_at)-Date.parse(a.dashboard_generated_at||a.generated_at));
 const scan=snapshots[0];if(!scan)return {status:'NO_PRIOR_SNAPSHOT'};
 const row=(scan.candidate_state||[]).find(x=>x.ticker===trade.ticker),age=(t-Date.parse(scan.dashboard_generated_at||scan.generated_at))/60000;
 if(!row)return {status:'NOT_IN_PRIOR_SNAPSHOT',scan_id:scan.scan_id,age_minutes:age};
 return {status:'RESEARCH_COMPARISON',scan_id:scan.scan_id,published_at:scan.dashboard_generated_at||scan.generated_at,age_minutes:age,rank:row.rank,direction_aligned:row.direction===(trade.side==='call'?'UP':'DOWN'),setup_qualified:row.setup_qualified??null,chase_risk:row.chase_risk??'UNKNOWN',vwap:row.vwap,price:row.price,trigger_price:row.trigger_price,volume_ratio:row.volume_ratio,volume_acceleration:row.volume_acceleration,trend_context:row.trend_context??null,contract_delta_at_entry:null,contract_theta_at_entry:null,limitation:'Provider transaction time may precede fill. Snapshot publication is approximate; quote Greeks at entry are unavailable.'};
}
export function researchDataset(pack,history){
 const r=reconcile(pack),rows=r.trades.map(t=>({...t,scanner:scannerComparison(t,history)}));
 return {version:1,source:pack.source,coverage:pack.coverage||null,retrieved_at:pack.retrieved_at,rows,issues:r.issues,provider_records:pack.transactions,ignored_count:r.ignored_count,ml_ready:false,ml_note:'Reconciled transactions are research evidence. Missing exact execution/quote timing and an audited chronological split prevent model-readiness claims.'};
}


// Keep provider fields intact. A calendar date is never promoted to an execution timestamp.
export function plaidReviewPack(snapshot){
 const securities=new Map((snapshot.securities||[]).map(s=>[s.security_id,s]));
 const transactions=(snapshot.transactions||[]).map(r=>({...r,ticker_symbol:securities.get(r.security_id)?.ticker_symbol||null,security_name:securities.get(r.security_id)?.name||null,transaction_datetime:r.transaction_datetime||null}));
 const holdings=(snapshot.holdings||[]).map(r=>({...securities.get(r.security_id),...r}));
 return validatePack({format:'broker-review-v1',source:'Plaid Investments (synced)',retrieved_at:snapshot.retrieved_at,transactions,holdings,coverage:{...snapshot.coverage,note:`${transactions.length} / ${snapshot.coverage?.total_transactions??'unknown'} provider records; ${snapshot.coverage?.complete?'complete':'incomplete'} for requested range ${snapshot.range?.start??'?'} through ${snapshot.range?.end??'?'}. Completeness does not establish fill timing.`,freshness:'Provider data may be delayed; collection time is not quote time.'}});
}
