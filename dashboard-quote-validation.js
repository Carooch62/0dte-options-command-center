// Explicit private download only. Never persist prices, instruments or credentials here.
import {quoteSessionOpen} from './quote-poller.js';
const clock=value=>typeof value==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value))?value:null;
const codes=new Set(['SIGN_IN','ACCESS_DENIED','AUTHORIZATION','SETUP','EXPIRED','BUSY']);
export function validationSample({view,snapshot,duration_ms,error_code},now=Date.now()){
 const provider_at=clock(view?.observed_at),received_at=clock(view?.received_at),observed=provider_at&&received_at&&Date.parse(provider_at)<=Date.parse(received_at)&&Date.parse(received_at)<=now&&now-Date.parse(provider_at)<=60000;
 const fresh=view?.status==='FRESH QUOTE · CHECKS PASSED'&&!!observed;
 return {checked_at:new Date(now).toISOString(),provider_at,received_at,
  duration_ms:typeof duration_ms==='number'&&Number.isFinite(duration_ms)&&duration_ms>=0?Math.round(duration_ms):null,
  status:fresh?'FRESH_CHECK_PASSED':view?'QUOTE_REQUIRES_REVIEW':codes.has(error_code)?error_code:'REQUEST_FAILED',
  open_session_verified:quoteSessionOpen(snapshot,now),snapshot_generated_at:clock(snapshot?.generated_at),
  session_open_at:clock(snapshot?.session_open_at),session_close_at:clock(snapshot?.session_close_at)};
}
export function validationReport(samples,now=Date.now()){
 const rows=samples.slice(-500),passing=rows.filter(r=>r.status==='FRESH_CHECK_PASSED'&&r.open_session_verified),durations=passing.map(r=>r.duration_ms).filter(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0).sort((a,b)=>a-b);
 const sessions=[...new Set(passing.map(r=>r.session_open_at))];
 const base=passing[0],windows=[5,10,15].map(minutes=>{
  const found=base&&passing.find(r=>Date.parse(r.received_at)>=Date.parse(base.received_at)+minutes*60000&&Date.parse(r.received_at)<=Date.parse(base.received_at)+minutes*60000+60000&&r.session_open_at===base.session_open_at);
  return {minutes,status:found?'OBSERVED':'MISSING',received_at:found?.received_at||null};
 });
 return {format:'private-dashboard-quote-validation-v1',exported_at:new Date(now).toISOString(),samples:rows,
  measured_requests:rows.length,passing_open_quotes:passing.length,open_sessions:sessions.length,
  request_p50_ms:durations.length?durations[Math.ceil(durations.length*.5)-1]:null,
  request_p95_ms:durations.length?durations[Math.ceil(durations.length*.95)-1]:null,
  speed_sample_requirement_met:durations.length>=20&&sessions.length>=2,windows,
  token_renewal_status:'NOT_VERIFIED',discord_delivery_status:'NOT_VERIFIED',
  limitations:['Private clock and request-duration evidence only. No prices, credentials or broker fills included.',
   'Synthetic tests and fresh quotes do not prove token renewal, exchange latency, streaming or Discord receipt.',
   'Missing 5/10/15-minute windows require another capture; no interpolation. Speed samples require 20 passing OPEN quotes across two sessions.']};
}
