// Research-only transition detection; live option quotes are validated separately.
export function watchKey(w) { return [w.ticker,w.direction,w.contract_id].map(v=>String(v||'').trim().toUpperCase()).join('|'); }
export function watchTransitions(watches,oldScan,newScan,now=Date.now()) {
 if(!Array.isArray(watches)||!oldScan||!newScan)return [];
 const oldTime=Date.parse(oldScan.generated_at||''),newTime=Date.parse(newScan.generated_at||'');
 if(!Number.isFinite(oldTime)||!Number.isFinite(newTime)||newTime<=oldTime||newTime>now||now-newTime>10*60_000||!newScan.scan_id||oldScan.scan_id===newScan.scan_id)return [];
 const prior=new Map((oldScan.candidates||[]).map(x=>[x.ticker,x]));
 const current=new Map((newScan.candidates||[]).map(x=>[x.ticker,x]));
 return watches.flatMap(w=>{
  if(!w?.ticker||!w?.direction||!w?.contract_id||!w?.expiry||w.expiry<newScan.generated_at.slice(0,10))return [];
  const a=prior.get(w.ticker),b=current.get(w.ticker);
  if(!a||!b||a.direction!==w.direction||b.direction!==w.direction||a.execution_state!=='WATCH'||b.execution_state!=='TRIGGERED')return [];
  return [{key:`${newScan.scan_id}|${watchKey(w)}`,watch:w,generated_at:newScan.generated_at,status:'TRIGGERED_RECHECK_REQUIRED'}];
 });
}
