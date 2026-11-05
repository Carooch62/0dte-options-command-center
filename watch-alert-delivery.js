// Delivery is deliberately disconnected from the pilot until Robinhood hosted access
// and an exact contract deep link are verified. Separate markers permit channel retries.
import {sendDiscordVerifiedOptionAlert} from './watch-discord.js';
import {sendTwilioOptionSms} from './watch-sms.js';

export async function deliverVerifiedOptionAlert(alert,env,{discord=sendDiscordVerifiedOptionAlert,sms=sendTwilioOptionSms}={}) {
 if(env?.WATCH_VERIFIED_ALERTS_ENABLED!=='true'||env?.WATCH_QUOTE_PILOT_ENABLED!=='true')
   return {status:'disabled'};
 if(!env.PLAID_STORE||!alert||typeof alert.key!=='string'||
    !/^[A-Za-z0-9_-]{1,90}:[0-9a-f-]{36}$/i.test(alert.key)||
    !alert.link||typeof alert.text!=='string'||!alert.text.includes(alert.link))
   return {status:'not-ready'};
 const report={status:'checked',discord:'not-configured',sms:'not-configured'};
 for(const [channel,configured,send] of [
  ['discord',!!env.DISCORD_WATCH_WEBHOOK_URL,()=>discord(alert,env)],
  ['sms',env.WATCH_SMS_ENABLED==='true'&&!!env.TWILIO_ACCOUNT_SID&&!!env.TWILIO_API_KEY_SID&&!!env.TWILIO_API_KEY_SECRET&&!!env.TWILIO_FROM_NUMBER&&!!env.WATCH_SMS_TO_NUMBER&&typeof sms==='function',()=>sms(alert,env)]
 ]){
  if(!configured)continue;
  const marker='verified-option-alert-v1:'+channel+':'+alert.key;
  const previous=await env.PLAID_STORE.get(marker);
  if(previous){report[channel]=previous==='sent'?'already-sent':'submission-uncertain';continue;}
  try {
   const result=await send();
   if(result?.status!=='sent'){report[channel]=result?.status||'failed';continue;}
   await env.PLAID_STORE.put(marker,'sent',{expirationTtl:60*60*24*30});
   report[channel]='sent';
  } catch(error) {
   // A timed-out SMS POST may have been accepted. Hold this key for manual review.
   if(channel==='sms'&&error?.message==='SMS submission uncertain'){
    await env.PLAID_STORE.put(marker,'uncertain',{expirationTtl:60*60*24*30});
    report[channel]='submission-uncertain';
   }else report[channel]='failed';
  }
 }
 return report;
}
