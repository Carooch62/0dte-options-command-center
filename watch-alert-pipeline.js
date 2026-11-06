// Bind scanner evidence, exact provider option quotes and an independently
// verified Robinhood contract URL before handing a message to Discord.
import {prepareVerifiedOptionAlert} from './watch-alert.js';
import {countQualifiedQuotes} from './watch-quote-qualification.js';
import {deliverVerifiedOptionAlert} from './watch-alert-delivery.js';

export async function processVerifiedOptionAlerts(env,snapshot,candidates,observations,{
 now=Date.now(),resolveLink=null,deliver=deliverVerifiedOptionAlert
}={}){
 if(env.WATCH_QUOTE_PILOT_ENABLED!=='true'||env.WATCH_VERIFIED_ALERTS_ENABLED!=='true')return {status:'disabled'};
 if(typeof resolveLink!=='function')return {status:'link-resolver-unavailable',qualified:countQualifiedQuotes(candidates,observations,now)};
 let sent=0,unlinked=0,failed=0;
 for(const candidate of candidates){
  const option=candidate.options?.[0];
  const matches=observations.filter(x=>x.instrument?.chain_symbol===candidate.ticker&&
   x.instrument?.type===option?.side&&x.instrument?.expiration_date===option?.expiry&&
   Number(x.instrument?.strike_price)===Number(option?.strike));
  if(matches.length!==1||countQualifiedQuotes([candidate],matches,now)!==1)continue;
  const observation=matches[0];
  const link=await resolveLink(observation.instrument,candidate);
  const alert=prepareVerifiedOptionAlert(candidate,observation,link,{
   scan_id:snapshot.scan_id,generated_at:snapshot.generated_at,
   market_session:snapshot.market_session,execution_state:candidate.execution_state
  },now);
  if(!alert){unlinked++;continue;}
  const result=await deliver(alert,env);
  if(result.status==='sent')sent++;
  else if(result.status!=='already-sent')failed++;
 }
 return {status:failed?'delivery-retry':'checked',sent,unlinked,failed};
}
