// Owner-only SMS transport. Secrets and recipient must be Worker secrets.
// A 201 response means provider accepted the message, not handset delivery.
const e164=/^\+1[2-9]\d{9}$/;
const sid=(prefix,value)=>new RegExp('^'+prefix+'[a-fA-F0-9]{32}$').test(value||'');
export function smsOptionText(alert){
 const {ticker,side,strike,expiry,bid,ask,observed_at,link}=alert||{};
 if(!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker||'')||!['call','put'].includes(side)||
    !Number.isFinite(strike)||strike<=0||!/^\d{4}-\d{2}-\d{2}$/.test(expiry||'')||
    !(bid>0&&ask>0&&bid<=ask&&ask<=.30)||!Number.isFinite(Date.parse(observed_at))||
    typeof link!=='string'||!/^https:\/\/(?:www\.)?robinhood\.com\//.test(link))throw Error('Invalid SMS alert');
 const body=`0DTE REVIEW ${ticker} $${strike} ${side.toUpperCase()} ${expiry} bid $${bid.toFixed(2)} ask $${ask.toFixed(2)}. Quote ${observed_at}. Check before buying: ${link}`;
 // Avoid invisible multipart costs from Unicode and oversized links.
 if(body.length>300||/[^\x20-\x7e]/.test(body))throw Error('SMS message exceeds cost limit');
 return body;
}
export async function sendTwilioOptionSms(alert,env,fetcher=fetch){
 if(!sid('AC',env?.TWILIO_ACCOUNT_SID)||!sid('SK',env?.TWILIO_API_KEY_SID)||
    typeof env.TWILIO_API_KEY_SECRET!=='string'||!env.TWILIO_API_KEY_SECRET||
    !e164.test(env.TWILIO_FROM_NUMBER||'')||!e164.test(env.WATCH_SMS_TO_NUMBER||''))
   return {status:'not-configured'};
 const body=smsOptionText(alert);
 const url=`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
 const form=new URLSearchParams({From:env.TWILIO_FROM_NUMBER,To:env.WATCH_SMS_TO_NUMBER,Body:body});
 let response;
 try{response=await fetcher(url,{method:'POST',headers:{Authorization:'Basic '+btoa(env.TWILIO_API_KEY_SID+':'+env.TWILIO_API_KEY_SECRET),'Content-Type':'application/x-www-form-urlencoded'},body:form,signal:AbortSignal.timeout(10000)});}
 catch{throw Error('SMS submission uncertain');}
 if(response.status!==201)throw Error('SMS provider rejected message');
 return {status:'sent'};
}
