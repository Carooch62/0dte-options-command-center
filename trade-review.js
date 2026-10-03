import {finite,dataStatus} from './dashboard-logic.js?v=20261002-trend-filters';
export function entryReadiness(row,data,now=Date.now()) {
 if(dataStatus(row,data,now))return 'HISTORICAL · WAIT FOR FRESH SCAN';
 if(['TRIGGERED','CONFIRMED'].includes(row.execution_state)&&row.setup_qualified===false)return 'PRICE TRIGGER · SETUP NOT QUALIFIED';
 if(['TRIGGERED','CONFIRMED'].includes(row.execution_state))return 'STOCK TRIGGER RECORDED · VERIFY ENTRY';
 return row.execution_state==='WATCH'?'WATCH · WAITING FOR CONFIRMATION':'WAIT · NO QUALIFYING STOCK SETUP';
}
export function quoteKey(ticker,o){return `${ticker}|${o.expiry}|${o.side}|${o.strike}`;}
export function observePremiums(previous,rows,observedAt){
 const result={...previous};
 for(const r of rows)for(const o of r.eligible_contracts||[]){
  if(!(finite(o.ask)>0)||!o.expiry||!o.side||finite(o.strike)===null)continue;
  const key=quoteKey(r.ticker,o),old=result[key];
  if(old&&Date.parse(observedAt)<=Date.parse(old.lastSeen))continue;
  result[key]={firstAsk:old?.firstAsk??o.ask,firstSeen:old?.firstSeen??observedAt,lastAsk:o.ask,lastSeen:observedAt,sourceTime:o.option_timestamp||null,delay:o.minimum_delay_minutes??null};
 }
 // Keep a bounded set of recent contract observations, with each expiry its own key.
 return Object.fromEntries(Object.entries(result).sort((a,b)=>Date.parse(b[1].lastSeen)-Date.parse(a[1].lastSeen)).slice(0,2000));
}
export function premiumChange(o){return o?.firstAsk>0?(o.lastAsk/o.firstAsk-1)*100:null;}
export function trendSummary(row){
 const context=row.trend_context||{},periods=context.periods||{};
 const alignment=['ALIGNED','AGAINST_TREND','MIXED','UNKNOWN'].includes(context.alignment)?context.alignment:'UNKNOWN';
 return {status:context.status||'UNAVAILABLE',asOf:context.as_of||null,
  alignment:context.status==='READY'?alignment:'UNKNOWN',
  periods:[['week','1 week',5],['two_weeks','2 weeks',10],['month','1 month',21]].map(([key,label,sessions])=>{
   const p=periods[key]||{};return {label,sessions,change:finite(p.change_pct),
    direction:['UP','DOWN','MIXED'].includes(p.direction)?p.direction:'UNKNOWN',
    highs:['RISING','FALLING','FLAT'].includes(p.highs)?p.highs:'UNKNOWN',
    lows:['RISING','FALLING','FLAT'].includes(p.lows)?p.lows:'UNKNOWN'};
  })};
}
// These filters describe completed daily context, never live entry readiness.
export function matchesTrend(row,period='overall',direction='ALL',alignment='ALL',data=null,now=Date.now()){
 const summary=trendSummary(row);
 let trend='UNKNOWN';
 if(['intraday','five_minutes','fifteen_minutes'].includes(period)){
  if(data&&!dataStatus(row,data,now)){
   if(period==='intraday')trend=['UP','DOWN','NEUTRAL'].includes(row.direction)?(row.direction==='NEUTRAL'?'FLAT':row.direction):'UNKNOWN';
   else{const change=finite(period==='five_minutes'?row.move_5m:row.recent_move);trend=change===null?'UNKNOWN':change>0?'UP':change<0?'DOWN':'FLAT';}
  }
 }else if(summary.status==='READY'){
  if(period==='overall'){
   const directions=summary.periods.map(p=>p.direction);
   trend=directions.includes('UNKNOWN')?'UNKNOWN':directions.every(d=>d===directions[0])?directions[0]:'MIXED';
  }else{
   const index={week:0,two_weeks:1,month:2}[period];
   trend=summary.periods[index]?.direction||'UNKNOWN';
  }
 }
 return (direction==='ALL'||trend===direction)&&(alignment==='ALL'||summary.alignment===alignment);
}
export function positionEstimate(t,kind){const q=finite(t[kind]);return q===null?null:(q-t.entry)*t.qty*100-(t.fees||0);}
export function reentryProblem(t,trades){
 const prior=trades.filter(p=>p.exit!==null&&p.ticker===t.ticker&&p.contract.trim().toUpperCase()===t.contract.trim().toUpperCase()&&Date.parse(p.closedAt||p.time)<=Date.parse(t.time)).sort((a,b)=>Date.parse(b.closedAt||b.time)-Date.parse(a.closedAt||a.time))[0];
 if(!prior)return null;
 if(!t.confirmationAt||Date.parse(t.confirmationAt)<=Date.parse(prior.closedAt||prior.time)||Date.parse(t.confirmationAt)>Date.parse(t.time)||!t.entryReason?.trim())return 'Re-entry needs a new confirmation time after the prior exit and a written setup reason. Use the same contract description to link repeated trades.';
 return null;
}
export function positionAlerts(t,now=Date.now()){
 const a=[];if(t.exit!==null)return a;
 if(t.expiry){const day=new Date(now).toLocaleDateString('en-CA',{timeZone:'America/New_York'});if(t.expiry<=day)a.push(t.expiry<day?'Expiration has passed; reconcile the actual outcome.':'Expires today.');}
 if(finite(t.bid)!==null&&finite(t.lossReview)!==null&&t.bid<=t.lossReview)a.push('Entered bid is at or below your loss-review level.');
 if(finite(t.bid)!==null&&finite(t.target)!==null&&t.bid>=t.target)a.push('Entered bid is at or above your profit-review level.');
 return a;
}
export function validPlan(t){
 for(const k of ['lossReview','target','maxEntry','bid','mark'])if(t[k]!=null&&(finite(t[k])===null||t[k]<0))return false;
 for(const k of ['quoteAt','confirmationAt'])if(t[k]&&!Number.isFinite(Date.parse(t[k])))return false;
 if(t.expiry&&(!/^\d{4}-\d{2}-\d{2}$/.test(t.expiry)||new Date(t.expiry+'T00:00:00Z').toISOString().slice(0,10)!==t.expiry))return false;
 return !['entryReason','exitConditions'].some(k=>t[k]!=null&&typeof t[k]!=='string');
}
