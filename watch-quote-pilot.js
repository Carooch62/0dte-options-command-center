import {candidateQuotes} from './candidate-quotes.js';
import {projectCandidates} from './private-candidates.js';
import {quoteWatchContracts} from './robinhood-live.js';

const snapshotUrl='https://raw.githubusercontent.com/Carooch62/0dte-options-command-center/main/data/market-dashboard.json';
const checkpointKey='watch-quote-pilot:last-checked-scan';

export function triggeredQuoteCandidates(snapshot, now) {
 const generatedAt=Date.parse(snapshot?.generated_at);
 if(snapshot?.market_session!=='OPEN'||!snapshot.scan_id||!Array.isArray(snapshot.candidates)||
    !Number.isFinite(generatedAt)||generatedAt>now||now-generatedAt>5*60_000)return [];
 const candidates=snapshot.candidates.filter(c=>['TRIGGERED','CONFIRMED'].includes(c.execution_state)).map(c=>{
  const side=c.direction==='UP'?'call':c.direction==='DOWN'?'put':null;
  const options=[...(c.options||[]),...Object.values(c.expiry_groups||{}).flatMap(group=>group?.options||[])];
  return {...c,options:side?options.filter(option=>option.side===side):[],expiry_groups:{}};
 });
 return projectCandidates({...snapshot,candidates}).candidates.slice(0,3);
}

export function countQualifiedQuotes(candidates, observations, now) {
 const rows=candidateQuotes({candidates},observations,now);
 const observationsById=new Map(observations.map(value=>[value.quote?.instrument_id,value]));
 return rows.filter(row=>{
  if(row.status!=='QUOTE_CHECK_PASSED'||row.premium_status!=='WITHIN_LIMIT'||row.spread>.05+1e-9||row.spread_pct>20+1e-9)return false;
  const observation=observationsById.get(row.instrument_id);
  const delta=Number(observation?.quote?.delta);
  const volume=Number(observation?.quote?.volume);
  const signedDelta=observation?.instrument?.type==='put'?-delta:delta;
  return signedDelta>=.30&&signedDelta<=.50&&Number.isFinite(volume)&&volume>=20;
 }).length;
}

// Run on the existing slower watch tick. Report counts only, with no trade messages or stored quotes.
export async function runWatchQuotePilot(env,{now=Date.now(),fetcher=fetch,verify=quoteWatchContracts}={}) {
 if(env.APP_ENV==='preview'||env.WATCH_QUOTE_PILOT_ENABLED!=='true'||!env.PLAID_STORE)return {status:'disabled'};
 const response=await fetcher(snapshotUrl+'?v='+now,{cf:{cacheTtl:0},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Alert pilot scan unavailable');
 const snapshot=await response.json();
 const candidates=triggeredQuoteCandidates(snapshot,now);
 if(!candidates.length)return {status:'no-recent-triggered-contracts'};
 if(await env.PLAID_STORE.get(checkpointKey)===snapshot.scan_id)return {status:'unchanged'};
 const {status,observations}=await verify(env,candidates.map(candidate=>candidate.options[0]));
 if(status!=='checked')return {status};
 const qualified=countQualifiedQuotes(candidates,observations,Date.now());
 await env.PLAID_STORE.put(checkpointKey,snapshot.scan_id,{expirationTtl:3600});
 return {status:'checked',candidates:candidates.length,qualified};
}
