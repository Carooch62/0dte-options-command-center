// Public research identities only. This is never a production eligibility batch.
import {contractRequest} from './private-candidates.js';
const num=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')?Number(v):NaN;
const none=['ranking_effect','eligibility_effect','scoring_effect','alert_effect'];
const policy='missing-delta-private-review-v1';
export function projectRecoveryBatch(snapshot,window){
 if(!['today','week'].includes(window)||!Array.isArray(snapshot?.candidates)||!Number.isFinite(Date.parse(snapshot.generated_at)))throw Error('Invalid recovery source');
 const selected=[],seen=new Map(),perTicker=new Map();let examined=0,total=0;
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(snapshot.generated_at));
 for(const c of snapshot.candidates){
  for(const o of (window==='today'?c.options:c.expiry_groups?.week?.options)||[]){
   examined++;
   let identity;try{identity=contractRequest({contracts:[{ticker:c.ticker,expiry:o.expiry,strike:o.strike,side:o.side}]})[0];}catch{continue;}
   const dte=(Date.parse(identity.expiry+'T00:00:00Z')-Date.parse(day+'T00:00:00Z'))/86400000;
   if(!Number.isInteger(dte)||(window==='today'?dte!==0:dte<1||dte>7)||o.dte!==dte)continue;
   // Only public fallback rows missing delta, with all other static screens intact.
   const bid=num(o.bid),ask=num(o.ask),stock=num(c.price),volume=num(o.volume),delta=num(o.delta),spread=ask-bid;
   const hasDelta=(o.delta_verified??o.greeks_verified)===true&&Number.isFinite(delta)&&((o.side==='call'&&delta>0&&delta<=1)||(o.side==='put'&&delta<0&&delta>=-1));
   if(o.source!=='Nasdaq public chain'||hasDelta||o.quote_valid!==true||o.tight_spread!==true||o.near_atm!==true||o.expiry_verified!==true||!Number.isFinite(stock)||!Number.isFinite(volume)||!(bid>0&&ask>=bid&&ask<=.30&&stock>0&&volume>=20)||spread>.05+1e-9||100*spread/((ask+bid)/2)>20+1e-9||Math.abs(identity.strike-stock)/stock>.03+1e-9||!((c.direction==='UP'&&o.side==='call')||(c.direction==='DOWN'&&o.side==='put')))continue;
   const key=JSON.stringify(identity),signature=JSON.stringify([bid,ask,volume,stock,c.direction,o.dte]);
   if(seen.has(key)){if(seen.get(key)!==signature)throw Error('Conflicting recovery identity');continue;}seen.set(key,signature);total++;
   if(selected.length>=20||(perTicker.get(c.ticker)||0)>=2)continue;
   perTicker.set(c.ticker,(perTicker.get(c.ticker)||0)+1);
   selected.push({ticker:identity.ticker,options:[{...identity,contract_id:`${identity.ticker}:${identity.expiry}:${identity.side}:${identity.strike}`,scanner_ask:ask}]});
  }
 }
 return {format:'private-recovery-identities-v1',selection_policy:policy,recovery_mode:'MISSING_DELTA_RESEARCH',expiration_window:window,max_per_ticker:2,generated_at:snapshot.generated_at,scan_id:snapshot.scan_id??null,market_session:snapshot.market_session??null,source:'main / market-dashboard.json public fallback identities',scanned_contracts:examined,research_seed_contracts:total,included_contracts:selected.length,omitted_contracts:total-selected.length,qualifying_contracts:0,...Object.fromEntries(none.map(k=>[k,'NONE'])),candidates:selected};
}
export function validateRecoveryBatch(s,window){
 if(!['today','week'].includes(window)||s?.format!=='private-recovery-identities-v1'||s.selection_policy!==policy||s.recovery_mode!=='MISSING_DELTA_RESEARCH'||s.expiration_window!==window||s.max_per_ticker!==2||none.some(k=>s[k]!=='NONE')||s.qualifying_contracts!==0||!Number.isFinite(Date.parse(s.generated_at))||!Array.isArray(s.candidates)||s.candidates.length>20)throw Error('Invalid recovery research batch');
 const counts=new Map(),identities=[];
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s.generated_at));
 for(const c of s.candidates){
  if(!Array.isArray(c.options)||c.options.length!==1||!(num(c.options[0].scanner_ask)>0&&num(c.options[0].scanner_ask)<=.30))throw Error('Invalid recovery research selection');
  const o=c.options[0];identities.push({...o,ticker:c.ticker});
  const dte=(Date.parse(o.expiry+'T00:00:00Z')-Date.parse(day+'T00:00:00Z'))/86400000;
  if(!Number.isInteger(dte)||(window==='today'?dte!==0:dte<1||dte>7))throw Error('Invalid recovery expiration');
  counts.set(c.ticker,(counts.get(c.ticker)||0)+1);if(counts.get(c.ticker)>2)throw Error('Invalid recovery ticker cap');
 }
 if(identities.length)contractRequest({contracts:identities});
 if(s.included_contracts!==identities.length||!Number.isInteger(s.research_seed_contracts)||s.research_seed_contracts<identities.length||s.omitted_contracts!==s.research_seed_contracts-identities.length)throw Error('Invalid recovery coverage');
 // Reconstruct the allowlist: never forward injected account/quote fields.
 return {...Object.fromEntries(['format','selection_policy','recovery_mode','expiration_window','max_per_ticker','generated_at','scan_id','market_session','source','scanned_contracts','research_seed_contracts','included_contracts','omitted_contracts','qualifying_contracts',...none].map(k=>[k,s[k]])),candidates:s.candidates.map(c=>({ticker:c.ticker,options:c.options.map(o=>({...contractRequest({contracts:[{...o,ticker:c.ticker}]})[0],contract_id:String(o.contract_id||'').slice(0,100),scanner_ask:num(o.scanner_ask)}))}))};
}
