import {countQualifiedQuotes} from './watch-quote-qualification.js';
import {projectCandidates} from './private-candidates.js';
import {quoteWatchContracts,persistQuoteEvidence} from './robinhood-live.js';
import {processVerifiedOptionAlerts} from './watch-alert-pipeline.js';
export {countQualifiedQuotes} from './watch-quote-qualification.js';

const snapshotUrl='https://raw.githubusercontent.com/Carooch62/0dte-options-command-center/main/data/watch-quote-batch.json';
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
 const states=new Map(candidates.map(candidate=>[candidate.ticker,candidate.execution_state]));
 return projectCandidates({...snapshot,candidates}).candidates.slice(0,3).map(candidate=>({...candidate,execution_state:states.get(candidate.ticker)}));
}

// Generated with the scanner; carries only the evidence used by pilot selection.
export function makeWatchQuoteSnapshot(snapshot){
 const candidates=triggeredQuoteCandidates(snapshot,Date.parse(snapshot.generated_at)).map(selected=>{
  const option=selected.options[0];
  const sources=snapshot.candidates.filter(c=>c.ticker===selected.ticker&&c.execution_state===selected.execution_state);
  const original=sources.flatMap(source=>[...(source.options||[]),...Object.values(source.expiry_groups||{}).flatMap(g=>g?.options||[])]).find(o=>o.side===option.side&&o.expiry===option.expiry&&Number(o.strike)===Number(option.strike));
  const keys=['contract_id','expiry','side','strike','ask','quote_valid','near_atm','delta_ok','usable_spread','volume','dte','contract_score'];
  return {ticker:selected.ticker,direction:option.side==='call'?'UP':'DOWN',execution_state:selected.execution_state,options:[Object.fromEntries(keys.filter(k=>k in original).map(k=>[k,original[k]]))]};
 });
 return {format:'watch-pilot-v1',scan_id:snapshot.scan_id,generated_at:snapshot.generated_at,market_session:snapshot.market_session,candidates};
}
export async function readPilotSnapshot(response){
 const limit=65536;
 if(!response.ok||Number(response.headers.get('Content-Length'))>limit)throw Error('Pilot batch unavailable or oversized');
 const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,raw='';
 try{
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw Error('Pilot batch oversized');raw+=decoder.decode(value,{stream:true});}
  raw+=decoder.decode();const snapshot=JSON.parse(raw);
  if(snapshot.format!=='watch-pilot-v1'||!Array.isArray(snapshot.candidates)||snapshot.candidates.length>3)throw Error('Invalid pilot batch');
  return snapshot;
 }finally{await reader.cancel().catch(()=>{});}
}

// Run on the existing slower watch tick. Report counts only, with no trade messages or stored quotes.
export async function runWatchQuotePilot(env,{now=Date.now(),clock=Date.now,fetcher=fetch,verify=quoteWatchContracts,resolveLink=null,deliver}={}) {
 if(env.APP_ENV==='preview'||env.WATCH_QUOTE_PILOT_ENABLED!=='true'||!env.PLAID_STORE)return {status:'disabled'};
 const response=await fetcher(snapshotUrl+'?v='+now,{cf:{cacheTtl:0},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Alert pilot scan unavailable');
 const snapshot=await readPilotSnapshot(response);
 const candidates=triggeredQuoteCandidates(snapshot,now);
 if(!candidates.length)return {status:'no-recent-triggered-contracts'};
 if(await env.PLAID_STORE.get(checkpointKey)===snapshot.scan_id)return {status:'unchanged'};
 const {status,observations}=await verify(env,candidates.map(candidate=>candidate.options[0]));
 if(status!=='checked')return {status};
 const verifiedAt=clock();
 if(env.ROBINHOOD_COORDINATOR&&observations.length)await persistQuoteEvidence(env,observations,{kind:'option',received_at:new Date(verifiedAt).toISOString(),scan_id:snapshot.scan_id,generated_at:snapshot.generated_at});
 const qualified=countQualifiedQuotes(candidates,observations,verifiedAt);
 const alerts=await processVerifiedOptionAlerts(env,snapshot,candidates,observations,
  {now:verifiedAt,resolveLink,...(deliver?{deliver}:{})});
 if(alerts.status==='delivery-retry')return {status:'delivery-retry',candidates:candidates.length,qualified,alerts};
 await env.PLAID_STORE.put(checkpointKey,snapshot.scan_id,{expirationTtl:3600});
 return {status:'checked',candidates:candidates.length,qualified,alerts};
}


