import {verifyAccess} from './plaid-sync.js';
import {watchKey} from './contract-watch.js';
import {pendingWatchEvents} from './watch-monitor.js';
import {sendDiscordWatchEvent,sendDiscordTestMessage} from './watch-discord.js';

const LEGACY_KEY='contract-watch-monitor-v1';
const WATCHES_KEY='contract-watch-list-v2';
const CHECKPOINT_KEY='contract-watch-checkpoint-v2';
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const cleanWatch=w=>{
 if(!w||typeof w!=='object')return null;
 const {ticker,direction,contract_id,expiry,side,strike}=w;
 if(typeof ticker!=='string'||!/^[A-Z.]{1,12}$/.test(ticker)||!['UP','DOWN'].includes(direction)||typeof contract_id!=='string'||!/^[A-Za-z0-9|._-]{1,120}$/.test(contract_id)||typeof expiry!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(expiry)||!Number.isFinite(Date.parse(expiry))||side!==(direction==='UP'?'call':'put')||!Number.isFinite(Number(strike))||Number(strike)<=0)return null;
 return {ticker,direction,contract_id,expiry,side,strike:Number(strike)};
};
const json=async(env,key)=>JSON.parse(await env.PLAID_STORE.get(key)||'null');
async function read(env){
 const list=await json(env,WATCHES_KEY),checkpoint=await json(env,CHECKPOINT_KEY);
 if(list)return {list,checkpoint:checkpoint||{}};
 const legacy=await json(env,LEGACY_KEY)||{};
 return {list:{watches:legacy.watches||[],revision:'legacy'},checkpoint:checkpoint||{...legacy,revision:'legacy'}};
}
const enabled=env=>env.WATCH_ALERTS_ENABLED==='true'&&!!env.DISCORD_WATCH_WEBHOOK_URL;
const sameOrigin=(request,url)=>request.headers.get('Origin')===url.origin&&request.headers.get('X-Requested-With')==='ContractWatch';

export function verifiedAlertReadiness(env) {
 const requirements={
  scan_scheduler:env.FAST_SCAN_ENABLED==='true'&&!!env.SCAN_COORDINATOR,
  discord_webhook:!!env.DISCORD_WATCH_WEBHOOK_URL,
  private_robinhood_connection:env.ROBINHOOD_CONNECTION_ENABLED==='true',
  hosted_quote_permission:false,
  exact_contract_link:false
 };
 return {ok:true,live:false,quote_pilot_enabled:env.WATCH_QUOTE_PILOT_ENABLED==='true',
  verified_alerts_enabled:env.WATCH_VERIFIED_ALERTS_ENABLED==='true',
  requirements,missing:Object.entries(requirements).filter(([,ready])=>!ready).map(([name])=>name)};
}

export async function handleWatchService(request,env){
 if(!env.PLAID_STORE||!env.CF_ACCESS_AUD||!env.CF_ACCESS_EMAIL||!env.CF_ACCESS_TEAM_DOMAIN)return reply({ok:false,error:'Private watch service not configured'},503);
 if(!await verifyAccess(request,env))return reply({ok:false,error:'Access sign in required'},401);
 const url=new URL(request.url);
 if(url.pathname==='/private/watch/readiness') {
  if(request.method!=='GET')return reply({ok:false,error:'GET required'},405);
  return reply(verifiedAlertReadiness(env));
 }
 if(url.pathname!=='/private/watch')return reply({ok:false,error:'Not found'},404);
 if(request.method==='GET'){
  const {list,checkpoint}=await read(env);return reply({ok:true,watches:list.watches,revision:list.revision,enabled:enabled(env),test_available:!!env.DISCORD_WATCH_WEBHOOK_URL,last_scan_at:checkpoint.revision===list.revision?checkpoint.previous?.generated_at||null:null});
 }
 if(!['PUT','POST'].includes(request.method))return reply({ok:false,error:'PUT or POST required'},405);
 if(!sameOrigin(request,url))return reply({ok:false,error:'Invalid request origin'},403);
 if(Number(request.headers.get('Content-Length'))>16000)return reply({ok:false,error:'Watch list too large'},413);
 const body=await request.json().catch(()=>null),watches=body?.watches;
 if(request.method==='POST'){
  if(body?.action!=='test')return reply({ok:false,error:'Invalid test request'},400);
  if(!env.DISCORD_WATCH_WEBHOOK_URL)return reply({ok:false,error:'Discord webhook not configured'},503);
  await sendDiscordTestMessage(env);
  return reply({ok:true,test_sent:true});
 }
 if(!Array.isArray(watches)||watches.length>20||watches.some(w=>!cleanWatch(w)))return reply({ok:false,error:'Invalid watch list'},400);
 const unique=[...new Map(watches.map(w=>{const clean=cleanWatch(w);return [watchKey(clean),clean]})).values()];
 const {list}=await read(env);
 const changed=JSON.stringify(list.watches.map(watchKey).sort())!==JSON.stringify(unique.map(watchKey).sort());
 const revision=changed||list.revision==='legacy'?crypto.randomUUID():list.revision;
 if(changed||list.revision==='legacy')await env.PLAID_STORE.put(WATCHES_KEY,JSON.stringify({watches:unique,revision}));
 return reply({ok:true,count:unique.length,revision,enabled:enabled(env)});
}

export async function scheduledWatchCheck(env,now=Date.now(),fetcher=fetch){
 if(env.APP_ENV==='preview'||env.WATCH_ALERTS_ENABLED!=='true'||!env.PLAID_STORE||!env.DISCORD_WATCH_WEBHOOK_URL)return 'disabled';
 const {list,checkpoint}=await read(env);
 if(list.revision==='legacy')return 'needs-private-sync';
 if(!list.watches.length)return 'no-watches';
 const url='https://raw.githubusercontent.com/Carooch62/0dte-options-command-center/main/data/market-dashboard.json?v='+now;
 const response=await fetcher(url,{signal:AbortSignal.timeout(15000),cf:{cacheTtl:0}});
 if(!response.ok)throw Error(`Scan fetch HTTP ${response.status}`);
 const scan=await response.json();
 if(!scan?.scan_id||!Number.isFinite(Date.parse(scan.generated_at)))throw Error('Invalid published scan');
 const state=checkpoint.revision===list.revision?checkpoint:{revision:list.revision,previous:null};
 if(state.previous?.scan_id===scan.scan_id)return 'unchanged';
 const old=state.previous;
 const events=pendingWatchEvents(list.watches,old,scan,[],now);
 for(const event of events){
  // Each event has its own marker; a later failure cannot cause an earlier success to resend.
  const marker='contract-watch-delivered-v2:'+encodeURIComponent(event.key);
  if(await env.PLAID_STORE.get(marker))continue;
  const latest=await read(env);
  if(latest.list.revision!==list.revision)return 'watch-list-changed';
  await sendDiscordWatchEvent(event,env,fetcher);
  await env.PLAID_STORE.put(marker,'sent',{expirationTtl:60*60*24*30});
 }
 if((await read(env)).list.revision!==list.revision)return 'watch-list-changed';
 await env.PLAID_STORE.put(CHECKPOINT_KEY,JSON.stringify({revision:list.revision,previous:scan}));
 return events.length?'sent':'checkpointed';
}
