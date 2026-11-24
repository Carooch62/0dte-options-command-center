// Owner-protected position plans and background long-option BID checkpoint reviews.
import {verifyAccess} from './plaid-sync.js';
import {quoteWatchContracts,privateStorageOwner} from './robinhood-live.js';
import {candidateQuotes} from './candidate-quotes.js';
import {configuredDiscordWebhook} from './watch-discord-config.js';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const enc=new TextEncoder(),dec=new TextDecoder(),keyName='encrypted-position-state-v1';
async function cipher(env){const raw=Uint8Array.from(atob((env.PLAID_ENCRYPTION_KEY||'').replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));if(raw.length!==32)throw Error('Encryption unavailable');return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);}
async function seal(value,env){const iv=crypto.getRandomValues(new Uint8Array(12)),data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('position-plans-v1')},await cipher(env),enc.encode(JSON.stringify(value))));return {iv:Array.from(iv),data:Array.from(data)};}
async function unseal(value,env){return value?JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(value.iv),additionalData:enc.encode('position-plans-v1')},await cipher(env),new Uint8Array(value.data)))):{plans:[],markers:{},failures:0,next_at:0,last_check:null};}
async function fingerprint(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const number=v=>typeof v==='number'&&Number.isFinite(v);
export function cleanExitPlan(p,now=Date.now()){
 const c=p?.contract,date=typeof c?.expiry==='string'?new Date(c.expiry+'T00:00:00Z'):null;
 if(!p||typeof p.id!=='string'||!/^[-A-Za-z0-9_]{1,100}$/.test(p.id)||!c||! /^[A-Z][A-Z0-9.-]{0,9}$/.test(c.ticker||'')||!['call','put'].includes(c.side)||typeof c.contract_id!=='string'||!/^[-A-Za-z0-9|._]{1,100}$/.test(c.contract_id)||!number(c.strike)||c.strike<=0||!/^\d{4}-\d{2}-\d{2}$/.test(c.expiry)||!Number.isFinite(+date)||date.toISOString().slice(0,10)!==c.expiry)throw Error('Exact contract required');
 const paidAt=Date.parse(p.entered_at),day=new Date(now).toLocaleDateString('sv-SE',{timeZone:'America/New_York'});
 if(!number(p.entry)||p.entry<=0||!Number.isInteger(p.quantity)||p.quantity<1||p.quantity>10000||!Number.isFinite(paidAt)||paidAt>now||c.expiry<day||p.entered_at.slice(0,10)>c.expiry||!number(p.loss)||p.loss<=0||p.loss>=p.entry||!number(p.profit)||p.profit<=p.entry||!/^([a-f0-9]{64})$/.test(p.source_fingerprint||'')||p.confirmed!==true||typeof p.active!=='boolean')throw Error('Confirm actual fill, quantity, purchase time and loss/profit levels');
 return {id:p.id,contract:{ticker:c.ticker,contract_id:c.contract_id,expiry:c.expiry,side:c.side,strike:c.strike},entry:p.entry,quantity:p.quantity,entered_at:new Date(paidAt).toISOString(),loss:p.loss,profit:p.profit,active:p.active,confirmed:true,source_fingerprint:p.source_fingerprint};
}
export function exitSessionOpen(snapshot,now){
 const open=Date.parse(snapshot?.session_open_at),close=Date.parse(snapshot?.session_close_at),generated=Date.parse(snapshot?.generated_at),day=new Date(now).toLocaleDateString('sv-SE',{timeZone:'America/New_York'});
 return Number.isFinite(open)&&Number.isFinite(close)&&Number.isFinite(generated)&&generated<=now&&now-generated<86400000&&open<=now&&now<close&&close-open<=8*3600000&&new Date(open).toLocaleDateString('sv-SE',{timeZone:'America/New_York'})===day;
}
export function exitQuoteReview(plan,observations,now){
 const row=candidateQuotes({candidates:[{ticker:plan.contract.ticker,options:[plan.contract]}]},observations,now)[0];
 const reasons=row.reasons.filter(r=>r!=='WIDE_SPREAD');if(row.bid_size===0)reasons.push('NO_DISPLAYED_BID_SIZE');
 if(reasons.length||!number(row.bid))return {verified:false,reasons,hits:[]};
 return {verified:true,reasons:[],hits:row.bid<=plan.loss?['LOSS_REVIEW']:row.bid>=plan.profit?['PROFIT_REVIEW']:[]};
}
export function exitHits(plan,observations,now){return exitQuoteReview(plan,observations,now).hits;}
export function exitDiscordMessage(plan,reason,at){return {content:`OPTION EXIT CHECKPOINT — REVIEW A SALE\n${plan.contract.ticker} ${plan.contract.expiry} ${plan.contract.strike} ${plan.contract.side.toUpperCase()} · ${plan.contract.contract_id}\nPosition ${plan.id.slice(0,8)} · plan revision ${plan.revision}\n${reason==='LOSS_REVIEW'?'Your saved loss-review level was reached.':'Your saved profit-review level was reached.'}\nQuote observation checked ${at}. Open Robinhood and verify the current executable bid before choosing Sell to Close. This is a review reminder, not an order or a filled sale. Polling is every five minutes; brief crossings can be missed. Provider prices and Greeks remain private.`,allowed_mentions:{parse:[]}};}
export class PositionExitMonitor {
 constructor(state,env,{fetcher=fetch,verify=quoteWatchContracts,clock=Date.now}={}){this.state=state;this.env=env;this.running=false;this.fetcher=fetcher;this.verify=verify;this.clock=clock;}
 async read(){return unseal(await this.state.storage.get(keyName),this.env);}
 async change(fn){return this.state.storage.transaction(async store=>{const state=await unseal(await store.get(keyName),this.env);const result=await fn(state);await store.put(keyName,await seal(state,this.env));return result;});}
 async fetch(request){
  const path=new URL(request.url).pathname;
  try{
   if(path==='/tick')return reply(await this.tick());
   if(path==='/list'){const s=await this.read();return reply({ok:true,plans:s.plans,last_check:{...s.last_check,delivery_states:Object.values(s.markers).map(m=>m.state)},delivery_test_id:s.delivery_test?.state==='ACCEPTED'?s.delivery_test.id:null,poll_seconds:300,enabled:this.env.POSITION_EXIT_ALERTS_ENABLED==='true',discord_configured:!!await configuredDiscordWebhook(this.env),maximum_active:3});}
   const body=await request.json();
   if(path==='/test'){
    const webhook=await configuredDiscordWebhook(this.env);if(!webhook)return reply({ok:false,error:'Configure your private Discord webhook first'},503);
    const at=this.clock(),id=crypto.randomUUID(),webhook_hash=await fingerprint(webhook);
    const accepted=await this.change(s=>{if(s.delivery_test&&at-s.delivery_test.at<60000)return false;s.delivery_test={id,at,webhook_hash,state:'PENDING'};return true;});if(!accepted)return reply({ok:false,error:'Wait one minute before another test'},429);
    const result=await this.fetcher(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:'TEST ONLY — position exit notification delivery check. No trade signal or sale.',allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(10000)});
    if(!result.ok)return reply({ok:false,error:'Discord test was not accepted; verify the webhook before retrying'},502);
    await this.change(s=>{if(s.delivery_test.id===id)s.delivery_test.state='ACCEPTED';});return reply({ok:true,test_id:id});
   }
   if(path==='/save'){
    const plan=cleanExitPlan(body.plan,this.clock());let delivery_hash=null;const current=await this.read(),existing=current.plans.find(p=>p.id===plan.id);if((existing?.revision||0)!==body.expected_revision)return reply({ok:false,error:'Plan changed on another device; reload before saving'},409);if(plan.active&&current.plans.filter(p=>p.active&&p.id!==plan.id).length>=3)return reply({ok:false,error:'At most three active position plans'},400);
    if(plan.active&&(this.env.POSITION_EXIT_ALERTS_ENABLED!=='true'||this.env.ROBINHOOD_UNATTENDED_CONFIRMED!=='true'||!this.env.ROBINHOOD_COORDINATOR||!await configuredDiscordWebhook(this.env)))return reply({ok:false,error:'Background quote permission, renewal or Discord is unavailable'},503);
    if(plan.active){
     const state=await this.read(),test=state.delivery_test,webhook=await configuredDiscordWebhook(this.env);delivery_hash=await fingerprint(webhook||'');
     if(body.delivery_confirmed!==true||!test||test.state!=='ACCEPTED'||test.id!==body.delivery_test_id||test.webhook_hash!==delivery_hash||this.clock()-test.at>86400000)return reply({ok:false,error:'Send TEST ONLY and confirm receiving it in your private channel before activation'},400);
     const session=await this.fetcher('https://raw.githubusercontent.com/Carooch62/0dte-options-command-center/main/data/market-dashboard-today.json?v='+this.clock(),{signal:AbortSignal.timeout(15000),cf:{cacheTtl:0}});
     if(!session.ok||!exitSessionOpen(await session.json(),this.clock()))return reply({ok:false,error:'Activation requires a verified OPEN market session; save paused until the session opens'},409);
     const quotes=await this.verify(this.env,[plan.contract]);
     if(quotes.status!=='checked')return reply({ok:false,error:'Private quote authorization could not be verified'},503);
     const row=candidateQuotes({candidates:[{ticker:plan.contract.ticker,options:[plan.contract]}]},quotes.observations,this.clock())[0];
     if(row.reasons.some(r=>r!=='WIDE_SPREAD')||row.bid_size===0)return reply({ok:false,error:'Activation requires fresh exact-contract bid/ask evidence'},409);
    }
    return await this.change(s=>{const old=s.plans.find(p=>p.id===plan.id);if((old?.revision||0)!==body.expected_revision)return reply({ok:false,error:'Plan changed on another device; reload before saving'},409);if(plan.active&&s.plans.filter(p=>p.active&&p.id!==plan.id).length>=3)return reply({ok:false,error:'At most three active position plans'},400);if(!old&&s.plans.length>=50)return reply({ok:false,error:'Private plan history limit reached; existing plans were kept. Export and review private storage before adding more.'},400);const saved={...plan,delivery_hash,revision:(old?.revision||0)+1,updated_at:new Date().toISOString()};s.plans=s.plans.filter(p=>p.id!==plan.id);s.plans.push(saved);s.markers=Object.fromEntries(Object.entries(s.markers).filter(([key])=>!key.startsWith(plan.id+'|')));s.next_at=0;return reply({ok:true,plan:saved});});
   }
   if(path==='/pause')return await this.change(s=>{const p=s.plans.find(p=>p.id===body.id);if(!p)return reply({ok:true});if(p.revision!==body.expected_revision)return reply({ok:false,error:'Plan changed; reload and pause its latest revision'},409);p.active=false;p.revision++;p.updated_at=new Date().toISOString();return reply({ok:true,plan:p});});
   return reply({ok:false,error:'Not found'},404);
  }catch{return reply({ok:false,error:'Position request could not be verified; no automatic sale occurred'},400);}
 }
 async tick({now=this.clock(),clock=this.clock,verify=this.verify,fetcher=this.fetcher}={}){
  if(this.running)return {status:'busy'};if(this.env.APP_ENV==='preview'||this.env.POSITION_EXIT_ALERTS_ENABLED!=='true'||this.env.ROBINHOOD_UNATTENDED_CONFIRMED!=='true')return {status:'disabled'};
  this.running=true;
  try{
   const saved=await this.read(),plans=saved.plans.filter(p=>p.active),day=new Date(now).toLocaleDateString('sv-SE',{timeZone:'America/New_York'});
   if(!plans.length)return {status:'no-active-plans'};if(saved.next_at>now)return {status:'backoff'};
   const valid=plans.filter(p=>p.contract.expiry>=day);if(valid.length<plans.length)await this.change(s=>{for(const p of s.plans)if(p.active&&p.contract.expiry<day){p.active=false;p.revision++;p.pause_reason='EXPIRATION_PASSED';}s.last_check={at:new Date(now).toISOString(),status:'expired-plans-paused'};});if(!valid.length)return {status:'expired-plans'};
   const webhook=await configuredDiscordWebhook(this.env);if(!webhook)throw Error('Discord unavailable');const delivery_hash=await fingerprint(webhook);
   const eligiblePlans=valid.filter(p=>p.delivery_hash===delivery_hash);if(eligiblePlans.length!==valid.length)await this.change(s=>{for(const p of s.plans)if(p.active&&p.delivery_hash!==delivery_hash){p.active=false;p.revision++;p.pause_reason='DISCORD_DESTINATION_CHANGED';}s.last_check={at:new Date(now).toISOString(),status:'discord-destination-changed'};});if(!eligiblePlans.length)return {status:'discord-destination-changed'};
   const sessionResponse=await fetcher('https://raw.githubusercontent.com/Carooch62/0dte-options-command-center/main/data/market-dashboard-today.json?v='+now,{signal:AbortSignal.timeout(15000),cf:{cacheTtl:0}});
   if(!sessionResponse.ok)throw Error('Session calendar unavailable');const session=await sessionResponse.json();if(!exitSessionOpen(session,now))return {status:'session-not-verified'};
   const result=await verify(this.env,[...new Map(eligiblePlans.slice(0,3).map(p=>[JSON.stringify([p.contract.ticker,p.contract.expiry,p.contract.side,p.contract.strike]),p.contract])).values()]);if(result.status!=='checked')throw Error('Quote authorization unavailable');
   const checked=clock(),reviews=eligiblePlans.map(p=>({id:p.id,...exitQuoteReview(p,result.observations,checked)}));
   let sent=0;
   for(const plan of eligiblePlans.slice(0,3))for(const hit of exitHits(plan,result.observations,checked)){
    if(!exitSessionOpen(session,clock())||!exitHits(plan,result.observations,clock()).includes(hit))continue;
    const marker=plan.id+'|'+plan.revision+'|'+hit;
    const claimed=await this.change(s=>{const current=s.plans.find(p=>p.id===plan.id);if(!current?.active||current.revision!==plan.revision||s.markers[marker])return false;s.markers[marker]={state:'DELIVERY_PENDING',at:new Date(checked).toISOString()};return true;});
    if(!claimed)continue;
    const latest=(await this.read()).plans.find(p=>p.id===plan.id);if(!latest?.active||latest.revision!==plan.revision)continue;
    let state='DELIVERY_UNKNOWN';
    try{const delivered=await fetcher(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(exitDiscordMessage(plan,hit,new Date(checked).toISOString())),signal:AbortSignal.timeout(10000)});state=delivered.ok?'SENT':'DELIVERY_FAILED';if(delivered.ok)sent++;}catch{/* a timeout can mean accepted: never blindly resend */}
    await this.change(s=>{if(s.markers[marker])s.markers[marker].state=state;});
   }
   await this.change(s=>{s.failures=0;s.next_at=checked+300000;s.last_check={at:new Date(checked).toISOString(),status:'checked',sent,positions_checked:eligiblePlans.length,quotes_verified:reviews.filter(r=>r.verified).length,reviews,delivery_states:Object.values(s.markers).map(m=>m.state)};});
   return {status:'checked',sent};
  }catch{await this.change(s=>{s.failures=Math.min(4,(s.failures||0)+1);s.next_at=now+Math.min(900000,300000*2**s.failures);s.last_check={at:new Date(now).toISOString(),status:'request-failed',retry_at:new Date(s.next_at).toISOString()};});return {status:'request-failed'};}finally{this.running=false;}
 }
}
const owner=async env=>env.POSITION_EXIT_MONITOR.get(env.POSITION_EXIT_MONITOR.idFromName('private-exit-owner:'+await privateStorageOwner(env)));
export async function handlePositionExits(request,env){
 if(env.APP_ENV==='preview')return reply({ok:false,error:'Private positions disabled in preview'},403);
 if(!await verifyAccess(request,env))return reply({ok:false,error:'Private sign in required'},401);
 if(!env.POSITION_EXIT_MONITOR||!env.PLAID_ENCRYPTION_KEY)return reply({ok:false,error:'Private position storage unavailable'},503);
 const url=new URL(request.url);if(request.method==='GET'&&url.pathname==='/private/plaid/robinhood/position-plans')return (await owner(env)).fetch('https://positions/list');
 if(request.method!=='POST'||!['/private/plaid/robinhood/position-plans','/private/plaid/robinhood/position-plans/pause','/private/plaid/robinhood/position-plans/test'].includes(url.pathname))return reply({ok:false,error:'Invalid position operation'},405);
 if(request.headers.get('Origin')!==url.origin||request.headers.get('X-Requested-With')!=='RobinhoodQuotes')return reply({ok:false,error:'Invalid request origin'},403);
 const raw=await request.text();if(raw.length>8000)return reply({ok:false,error:'Position request too large'},413);
 return (await owner(env)).fetch('https://positions/'+(url.pathname.endsWith('/pause')?'pause':url.pathname.endsWith('/test')?'test':'save'),{method:'POST',body:raw});
}
export async function scheduledPositionExits(env){if(env.APP_ENV==='preview'||env.POSITION_EXIT_ALERTS_ENABLED!=='true'||!env.POSITION_EXIT_MONITOR||!env.CF_ACCESS_EMAIL)return {status:'disabled'};return (await (await owner(env)).fetch('https://positions/tick',{method:'POST'})).json();}
