export function finite(v) {return v===null||v===''||v===undefined?null:Number.isFinite(Number(v))?Number(v):null;}
export function minutes(ts,now=Date.now()) {const t=Date.parse(ts);return Number.isFinite(t)?(now-t)/60000:null;}
export function snapshotUsable(data,now=Date.now()) {
  const age=minutes(data?.generated_at,now),op=Date.parse(data?.session_open_at),cl=Date.parse(data?.session_close_at);
  return age!==null&&age>=-.5&&age<=8&&data?.market_session==='OPEN'&&now>=op&&now<cl;
}
export function dataStatus(row,data,now=Date.now()) {
  const barAge=minutes(row?.bar_end,now),snapshotAge=minutes(data?.generated_at,now);
  if(barAge===null||snapshotAge===null||barAge<-.5||snapshotAge<-.5)return {state:'DATA UNAVAILABLE',detail:'Missing or invalid timestamp, or the latest download failed.'};
  if(barAge>8)return {state:'STALE PRICE DATA',detail:`Price bar is ${barAge.toFixed(1)} min old; freshness limit is 8 min.`};
  if(snapshotAge>8)return {state:'STALE SCAN',detail:`Published scan is ${snapshotAge.toFixed(1)} min old; waiting for a newer scan.`};
  if(!snapshotUsable(data,now))return {state:'MARKET CLOSED',detail:'Outside the regular session; showing the last research snapshot.'};
  return null;
}
export function displayState(row,data,now=Date.now()) {
  const status=dataStatus(row,data,now);
  if(status)return status.state;
  if(row.execution_state==='CONFIRMED') {
    const valid=row.preferred_contracts?.some(o=>{const a=minutes(o.option_timestamp,now);return a!==null&&a>=-.5&&a+(o.minimum_delay_minutes||0)<=20;});
    return valid?'CONFIRMED DELAYED':'WATCH';
  }
  return row.execution_state||'WATCH';
}
export function selectableContracts(row,min=.1,max=.3) {
  if(!Number.isFinite(min)||!Number.isFinite(max)||min<0||max<min)return [];
  return (row.eligible_contracts||[]).filter(o=>o.quote_valid&&o.delta_ok&&o.tight_spread&&o.ask>=min&&o.ask<=max);
}
export function requestPublished(data,id) {return Boolean(id&&data?.scan_id===id);}
export function tradePL(trade) {return (trade.exit-trade.entry)*trade.qty*100-(trade.fees||0);}
export function validTrade(t) {return Boolean(t.ticker&&t.contract&&Number.isInteger(t.qty)&&t.qty>0&&finite(t.entry)!==null&&t.entry>0&&(t.exit===null||(finite(t.exit)!==null&&t.exit>=0))&&finite(t.fees)!==null&&t.fees>=0&&Number.isFinite(Date.parse(t.time)));}
export function riskSummary(settings,trades,ask,qty,now=new Date()) {
  const date=now.toLocaleDateString('en-CA',{timeZone:'America/New_York'});
  const dayTrades=trades.filter(t=>t.exit!==null&&new Date(t.closedAt||t.time).toLocaleDateString('en-CA',{timeZone:'America/New_York'})===date);
  const dayPL=dayTrades.reduce((n,t)=>n+tradePL(t),0);
  const exposure=trades.filter(t=>t.exit===null).reduce((n,t)=>n+t.entry*t.qty*100+(t.fees||0),0);
  const cost=ask>0&&Number.isInteger(qty)&&qty>0?ask*qty*100:null;
  const alerts=[];
  if(settings.perTrade>0&&cost>settings.perTrade)alerts.push('Proposed premium exceeds your per-trade budget.');
  if(settings.dailyLoss>0&&-dayPL>=settings.dailyLoss)alerts.push('Your recorded daily loss limit has been reached.');
  if(settings.maxExposure>0&&cost!==null&&exposure+cost>settings.maxExposure)alerts.push('Recorded open premiums plus this trade exceed your exposure budget.');
  const et=now.toLocaleTimeString('en-GB',{timeZone:'America/New_York',hour12:false}).slice(0,5);
  if(settings.cutoff&&et>=settings.cutoff)alerts.push('Your broker close-out reminder time has passed.');
  if(settings.timeStop>0&&trades.some(t=>t.exit===null&&(now-Date.parse(t.time))/60000>=settings.timeStop))alerts.push('A recorded open trade has reached your time-stop reminder.');
  return {cost,dayPL,exposure,alerts};
}
