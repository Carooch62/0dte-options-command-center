// Delivery is deliberately disconnected from the pilot until Robinhood hosted access
// and an exact contract deep link are verified. Separate markers permit channel retries.
import {sendDiscordVerifiedOptionAlert} from './watch-discord.js';

export async function deliverVerifiedOptionAlert(alert,env,{discord=sendDiscordVerifiedOptionAlert,phone=null}={}) {
 if(env?.WATCH_VERIFIED_ALERTS_ENABLED!=='true'||env?.WATCH_QUOTE_PILOT_ENABLED!=='true')
   return {status:'disabled'};
 if(!env.PLAID_STORE||!alert||typeof alert.key!=='string'||
    !/^[A-Za-z0-9_-]{1,90}:[0-9a-f-]{36}$/i.test(alert.key)||
    !alert.link||typeof alert.text!=='string'||!alert.text.includes(alert.link))
   return {status:'not-ready'};
 const report={status:'checked',discord:'not-configured',phone:'not-configured'};
 for(const [channel,configured,send] of [
  ['discord',!!env.DISCORD_WATCH_WEBHOOK_URL,()=>discord(alert,env)],
  ['phone',env.WATCH_PHONE_PUSH_ENABLED==='true'&&typeof phone==='function',()=>phone(alert,env)]
 ]){
  if(!configured)continue;
  const marker='verified-option-alert-v1:'+channel+':'+alert.key;
  if(await env.PLAID_STORE.get(marker)){report[channel]='already-sent';continue;}
  try {
   const result=await send();
   if(result?.status!=='sent'){report[channel]=result?.status||'failed';continue;}
   await env.PLAID_STORE.put(marker,'sent',{expirationTtl:60*60*24*30});
   report[channel]='sent';
  } catch {
   // Never log an alert body, webhook URL or authorization. Keep this channel retryable.
   report[channel]='failed';
  }
 }
 return report;
}
