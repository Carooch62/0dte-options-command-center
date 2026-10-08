import {finite,dataStatus,selectableContracts,minutes} from './dashboard-logic.js?v=20261007-readiness';
const verdict=v=>v===true?'PASS':v===false?'FAIL':'UNKNOWN';
export function relativeVolumeEvidence(row,data,now=Date.now()) {
 const r=row.relative_volume_research||{},ratio=finite(r.ratio),count=finite(r.baseline_count);
 const age=minutes(r.bar_end,now);
 const known=r.mode==='SHADOW'&&r.status==='READY'&&r.method==='LATEST_5M_VS_SAME_ET_SLOT_MEAN'
  &&ratio!==null&&ratio>=0&&count!==null&&count>=3&&Array.isArray(r.baseline_sessions)
  &&new Set(r.baseline_sessions).size===count&&r.bar_end===row.bar_end
  &&age!==null&&age>=0&&age<=8&&dataStatus(row,data,now)===null;
 return {label:'Same-time RVOL · shadow',state:known?'OBSERVED':'UNKNOWN',
  detail:known?`${ratio.toFixed(2)}× at ${r.slot_et} ET vs ${count} prior sessions (${r.baseline_sessions.join(', ')}). Latest five-minute bar only; limited baseline, no validated pass threshold. Source: ${r.source||'unknown'}.`
   :`Unavailable (${r.status||'not collected'}); needs fresh matching bars from at least 3 prior sessions. Research only—not an entry gate.`};
}
export function signalChecklist(row,data,min=.1,max=.3,now=Date.now()) {
 const q=row.qualification_checks||{},p=row.pattern_research||{},status=dataStatus(row,data,now);
 const picks=selectableContracts(row,min,max),attempted=row.chain_attempted===true&&row.chain_status==='SUCCESS';
 const trend=row.trend_context;
 const trendKnown=trend?.status==='READY'&&['ALIGNED','AGAINST_TREND','MIXED'].includes(trend?.alignment);
 const patternKeys=['range_compression','volume_dry_up','directional_structure','near_trigger'];
 const patternKnown=p.status==='READY'&&patternKeys.every(k=>typeof p[k]==='boolean');
 const quoteTimes=picks.map(o=>{const age=minutes(o.option_timestamp,now),delay=finite(o.minimum_delay_minutes);return age===null||delay===null?null:age>=-.5&&age+delay<=20;});
 const quoteTime=quoteTimes.includes(true)?true:quoteTimes.includes(null)||!quoteTimes.length?null:false;
 const items=[
  ['Freshness',status?.state==='DATA UNAVAILABLE'?null:status===null,status?.detail||'Recent session bars; options remain delayed research.'],
  ['Catalyst',q.catalyst_confirmed,row.catalyst_type||'Company-specific event evidence unavailable.'],
  ['Trend alignment',trendKnown?trend.alignment==='ALIGNED':null,trendKnown?trend.alignment:'Daily trend context unavailable or incomplete.'],
  ['Pattern · shadow',patternKnown?patternKeys.every(k=>p[k]===true):null,patternKnown?`${patternKeys.map(k=>k.replaceAll('_',' ')+': '+verdict(p[k])).join('; ')}. Range ratio ${p.range_ratio}; volume ratio ${p.volume_ratio}; distance ${p.distance_pct}%`:'Needs 12 valid completed five-minute bars and a direction.'],
  ['Volume confirmation',typeof q.momentum_confirmed==='boolean'&&typeof q.acceleration_confirmed==='boolean'?q.momentum_confirmed||q.acceleration_confirmed:null,`Local burst ${finite(row.volume_ratio)??'unknown'}×; acceleration ${finite(row.volume_acceleration)??'unknown'}×. Not historical same-time RVOL.`],
  ['Contract filters',attempted?picks.length>0:null,attempted?`${picks.length} contracts pass selected price/quality filters. Not entry confirmation.`:'Chain unavailable, not scanned, or source failed.'],
  ['Option quote time',quoteTime,'Source timing check only—not live execution verification.']
 ];
 const checklist=items.map(([label,v,detail])=>({label,state:verdict(v),detail}));
 checklist.splice(5,0,relativeVolumeEvidence(row,data,now));
 return checklist;
}
export function earlyWatchVisible(row,data,now=Date.now()) {
 return row.early_watch===true&&row.pattern_research?.mode==='SHADOW'&&dataStatus(row,data,now)===null;
}
