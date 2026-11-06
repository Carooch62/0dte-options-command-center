// Verified alerts stay disconnected from the quote pilot until hosted access
// and an exact Robinhood contract link are confirmed. Discord is the only channel.
import {sendDiscordVerifiedOptionAlert} from './watch-discord.js';
import {configuredDiscordWebhook} from './watch-discord-config.js';

export async function deliverVerifiedOptionAlert(alert,env,{discord=sendDiscordVerifiedOptionAlert}={}) {
 if(env?.WATCH_VERIFIED_ALERTS_ENABLED!=='true'||env?.WATCH_QUOTE_PILOT_ENABLED!=='true')
  return {status:'disabled'};
 if(!env.PLAID_STORE||!alert||typeof alert.key!=='string'||
    !/^[A-Za-z0-9_-]{1,90}:[0-9a-f-]{36}$/i.test(alert.key)||
    !alert.link||typeof alert.text!=='string'||!alert.text.includes(alert.link))
  return {status:'not-ready'};
 if(!await configuredDiscordWebhook(env))return {status:'not-configured'};
 const marker='verified-option-alert-v1:discord:'+alert.key;
 if(await env.PLAID_STORE.get(marker))return {status:'already-sent'};
 try {
  const result=await discord(alert,env);
  if(result?.status!=='sent')return {status:result?.status||'failed'};
  await env.PLAID_STORE.put(marker,'sent',{expirationTtl:60*60*24*30});
  return {status:'sent'};
 } catch {
  // Never log the alert body, webhook URL or credentials; permit later retry.
  return {status:'failed'};
 }
}
