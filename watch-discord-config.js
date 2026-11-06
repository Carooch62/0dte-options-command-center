// The owner can install a Discord webhook through a protected Worker route.
// The URL is encrypted in private KV and is never included in status responses.
const storageKey='private-discord-webhook-v1';
const encoder=new TextEncoder();
const decoder=new TextDecoder();
const associatedData=encoder.encode('watch-discord-webhook-v1');
const toBase64=bytes=>btoa(String.fromCharCode(...bytes));
const fromBase64=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));

export function validDiscordWebhook(value){
 if(typeof value!=='string'||value.length>300)return false;
 let url;try{url=new URL(value);}catch{return false;}
 return url.protocol==='https:'&&url.hostname==='discord.com'&&!url.username&&!url.password&&
  !url.search&&!url.hash&&/^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url.pathname);
}

async function cipherKey(env){
 const raw=fromBase64(env.PLAID_ENCRYPTION_KEY||'');
 if(raw.length!==32)throw Error('Discord storage encryption unavailable');
 return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
}
export async function storeDiscordWebhook(env,value){
 if(!env.PLAID_STORE||!validDiscordWebhook(value))throw Error('Invalid Discord webhook');
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:associatedData},await cipherKey(env),encoder.encode(value));
 await env.PLAID_STORE.put(storageKey,JSON.stringify({iv:toBase64(iv),ciphertext:toBase64(new Uint8Array(encrypted))}));
}
export async function configuredDiscordWebhook(env){
 if(env?.DISCORD_WATCH_WEBHOOK_URL){
  if(!validDiscordWebhook(env.DISCORD_WATCH_WEBHOOK_URL))throw Error('Invalid Discord webhook configuration');
  return env.DISCORD_WATCH_WEBHOOK_URL;
 }
 if(!env?.PLAID_STORE||!env.PLAID_ENCRYPTION_KEY)return null;
 const raw=await env.PLAID_STORE.get(storageKey);
 if(!raw)return null;
 try {
  const value=JSON.parse(raw);
  const clear=decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(value.iv),additionalData:associatedData},await cipherKey(env),fromBase64(value.ciphertext)));
  return validDiscordWebhook(clear)?clear:null;
 }catch{return null;}
}
export async function discordWebhookStatus(env){
 if(env?.DISCORD_WATCH_WEBHOOK_URL)return {configured:validDiscordWebhook(env.DISCORD_WATCH_WEBHOOK_URL),managed_in:'cloudflare'};
 return {configured:!!await configuredDiscordWebhook(env),managed_in:'private-setup'};
}
export async function removeDiscordWebhook(env){
 if(env?.DISCORD_WATCH_WEBHOOK_URL)throw Error('Discord webhook managed in Cloudflare');
 await env.PLAID_STORE.delete(storageKey);
}
