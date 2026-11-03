import {verifyAccess} from './plaid-sync.js';
import {watchKey} from './contract-watch.js';
import {pendingWatchEvents} from './watch-monitor.js';
import {sendDiscordWatchEvent} from './watch-discord.js';

const KEY='contract-watch-monitor-v1';
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const cleanWatch=w=>{
 if(!w||typeof w!=='object')return null;
 const {ticker,direction,contract_id,expiry,side,strike}=w;
 if(typeof ticker!=='string'||!/^[A-Z.]{1,12}$/.test(ticker)||!['UP','DOWN'].includes(direction)||typeof contract_id!=='string'||!/^[A-Za-z0-9|._-]{1,120}$/.test(contract_id)||typeof expiry!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(expiry)||!Number.isFinite(Date.parse(expiry))||side!==(direction==='UP'?'call':'put')||!Number.isFinite(Number(strike))||Number(strike)<=0)return null;
 return {ticker,direction,contract_id,expiry,side,strike:Number(strike)};
};
const read=async env=>JSON.parse(await env.PLAID_STORE.get(KEY)||'{}');

export async function handleWatchService(request,env){
 if(!env.PLAID_STORE||!env.CF_ACCESS_AUD||!env.CF_ACCESS_EMAIL||!env.CF_ACCESS_TEAM_DOMAIN)return reply({ok:false,error:'Private watch service not configured'},503);
 if(!await verifyAccess(request,env))return reply({ok:false,error:'Access sign in required'},401);
 const url=new URL(request.url);
 if(url.pathname!=='/private/watch')return reply({ok:false,error:'Not found'},404);
 if(request.method==='GET'){
  const state=await read(env);return reply({ok:true,watches:state.watches||[],enabled:env.WATCH_ALERTS_ENABLED==='true'&&!!env.DISCORD_WATCH_WEBHOOK_URL,last_scan_at:state.previous?.generated_at||null,last_error:state.last_error||null});
 }
 if(request.method!=='PUT')return reply({ok:false,error:'PUT required'},405);
 if(request.headers.get('Origin')!==url.origin||request.headers.get('X-Requested-With')!=='ContractWatch')return reply({ok:false,error:'Invalid request origin'},403);
 if(Number(request.headers.get('Content-Length'))>16000)return reply({ok:false,error:'Watch list too large'},413);
 const body=await request.json().catch(()=>null),watches=body?.watches;
 if(!Array.isArray(watches)||watches.length>20||watches.some(w=>!cleanWatch(w)))return reply({ok:false,error:'Invalid watch list'},400);
 const unique=[...new Map(watches.map(w=>{const clean=cleanWatch(w);return [watchKey(clean),clean]})).values()];
 const state=await read(env);await env.PLAID_STORE.put(KEY,JSON.stringify({...state,watches:unique}));
 return reply({ok:true,count:unique.length,enabled:env.WATCH_ALERTS_ENABLED==='true'&&!!env.DISCORD_WATCH_WEBHOOK_URL});
}

export async function scheduledWatchCheck(env,now=Date.now(),fetcher=fetch){
 if(env.APP_ENV==='preview'||env.WATCH_ALERTS_ENABLED!=='true'||!env.PLAID_STORE||!env.DISCORD_WATCH_WEBHOOK_URL)return 'disabled';
 const state=await read(env);
 if(!state.watches?.length)return 'no-watches';
 const url='https://raw.githubusercontent.com/Carooch62/0dte-options-command-center/main/data/market-dashboard.json?v='+now;
 const response=await fetcher(url,{signal:AbortSignal.timeout(15000),cf:{cacheTtl:0}});
 if(!response.ok)throw Error(`Scan fetch HTTP ${response.status}`);
 const scan=await response.json();
 if(!scan?.scan_id||!Number.isFinite(Date.parse(scan.generated_at)))throw Error('Invalid published scan');
 if(state.previous?.scan_id===scan.scan_id)return 'unchanged';
 const old=state.previous;
 const events=pendingWatchEvents(state.watches,old,scan,state.deliveredKeys||[],now);
 for(const event of events){
  // Persist each success before continuing so partial batches can retry safely.
  await sendDiscordWatchEvent(event,env,fetcher);
  state.deliveredKeys=[...(state.deliveredKeys||[]),event.key].slice(-100);
  await env.PLAID_STORE.put(KEY,JSON.stringify(state));
 }
 state.previous=scan;state.last_error=null;
 await env.PLAID_STORE.put(KEY,JSON.stringify(state));
 return events.length?'sent':'checkpointed';
}
