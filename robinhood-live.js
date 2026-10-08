// Separate, private OAuth client. Never inherits the ChatGPT connection.
import {verifyAccess} from './plaid-sync.js';
const MCP='https://agent.robinhood.com/mcp/trading';
const ISSUER=MCP;
const TOKEN='https://api.robinhood.com/oauth2/token/';
const encoder=new TextEncoder(),decoder=new TextDecoder();
const COOKIE='__Secure-rh-connect';
const COOKIE_PATH='/private/robinhood/';
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const reply=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...headers,...extra}});
const configured=env=>env.ROBINHOOD_HOSTED_APPROVED==='true'&&env.ROBINHOOD_CLIENT_ID&&env.ROBINHOOD_REDIRECT_URI&&env.PLAID_STORE&&env.PLAID_ENCRYPTION_KEY&&env.CF_ACCESS_EMAIL&&env.CF_ACCESS_AUD&&env.CF_ACCESS_TEAM_DOMAIN;
const cookie=(value,maxAge)=>`${COOKIE}=${value}; Path=${COOKIE_PATH}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
async function key(env){const raw=bytes(env.PLAID_ENCRYPTION_KEY);if(raw.length!==32)throw Error('Invalid encryption configuration');return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);}
async function seal(data,env){const iv=crypto.getRandomValues(new Uint8Array(12));const dataBytes=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode('robinhood-live-v1')},await key(env),encoder.encode(JSON.stringify(data)));return `${b64(iv)}.${b64(new Uint8Array(dataBytes))}`;}
async function unseal(raw,env){const [iv,value]=raw.split('.');return JSON.parse(decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:encoder.encode('robinhood-live-v1')},await key(env),bytes(value))));}
const storageKey=env=>`robinhood-live:connection:${env.CF_ACCESS_EMAIL.toLowerCase()}`;
async function connection(env){const raw=await env.PLAID_STORE.get(storageKey(env));return raw?unseal(raw,env):null;}
async function exchange(form){const response=await fetch(TOKEN,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(form),signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Robinhood authorization failed; reconnect to retry');const data=await response.json();if(typeof data.access_token!=='string'||!data.access_token||!Number.isFinite(Number(data.expires_in))||Number(data.expires_in)<=0||data.token_type?.toLowerCase()!=='bearer')throw Error('Invalid Robinhood authorization response');return {access_token:data.access_token,expires_at:Date.now()+Number(data.expires_in)*1000};}

// The client cannot accept arbitrary MCP methods or tool names from the browser.
const ALLOWED=new Set(['get_equity_quotes','get_option_quotes']);
export async function rpc(token,method,params={},session=null){
 if(!['initialize','tools/list','tools/call'].includes(method)||method==='tools/call'&&!ALLOWED.has(params.name))throw Error('Market-data operation required');
 const response=await fetch(MCP,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream',...(session?{'Mcp-Session-Id':session,'MCP-Protocol-Version':'2025-03-26'}:{})},body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method,params}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error(response.status===401?'Robinhood connection expired; reconnect':'Robinhood quote service unavailable');
 const raw=await response.text();if(raw.length>2000000)throw Error('Robinhood response too large');
 let message;
 if(response.headers.get('Content-Type')?.includes('text/event-stream')){
  const events=raw.split(/\r?\n\r?\n/).map(event=>event.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n')).filter(Boolean).map(value=>JSON.parse(value));
  message=events.find(event=>event.id!==undefined&&('result' in event||'error' in event));
 }else message=JSON.parse(raw);
 if(!message||message.error||message.result?.isError)throw Error('Robinhood market-data request failed');
 return {result:message.result,session:response.headers.get('Mcp-Session-Id')||session};
}
export function quoteRequest(body){
 if(body?.kind==='equity'&&Array.isArray(body.symbols)&&body.symbols.length>0&&body.symbols.length<=20&&body.symbols.every(symbol=>typeof symbol==='string'&&/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)))return {name:'get_equity_quotes',arguments:{symbols:[...new Set(body.symbols)]}};
 if(body?.kind==='option'&&Array.isArray(body.instrument_ids)&&body.instrument_ids.length>0&&body.instrument_ids.length<=20&&body.instrument_ids.every(id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))return {name:'get_option_quotes',arguments:{instrument_ids:[...new Set(body.instrument_ids.map(id=>id.toLowerCase()))]}};
 throw Error('Supply 1–20 stock symbols or Robinhood option instrument IDs');
}
export function quoteAge(updatedAt,receivedAt=Date.now()){
 const timestamp=typeof updatedAt==='string'?Date.parse(updatedAt):NaN;
 if(!Number.isFinite(timestamp)||timestamp>receivedAt+5000)return {age_seconds:null,freshness:'UNKNOWN'};
 const age=Math.max(0,(receivedAt-timestamp)/1000);
 return {age_seconds:age,freshness:age<=60?'RECENT_REFRESH':'STALE_REFRESH'};
}
export function normalizeQuotes(data,operation,receivedAt){
 const rows=Array.isArray(data.results)?data.results:Array.isArray(data.quotes)?data.quotes:null;
 if(!rows||rows.length>20||!rows.length)throw Error('Unsupported Robinhood quote response');
 const equity=operation.name==='get_equity_quotes';
 const requested=new Set(equity?operation.arguments.symbols:operation.arguments.instrument_ids);
 const seen=new Set();
 const observations=rows.map(row=>{
  const quote=row?.quote,id=equity?quote?.symbol:quote?.instrument_id;
  if(!quote||!requested.has(id)||seen.has(id))throw Error('Unexpected Robinhood quote identity');
  seen.add(id);
  const allowed=['symbol','instrument_id','bid_price','ask_price','bid_size','ask_size','last_trade_price','last_non_reg_trade_price','mark_price','adjusted_mark_price','adjusted_previous_close','previous_close','previous_close_date','has_traded','state','delta','gamma','theta','vega','rho','implied_volatility','open_interest','volume','updated_at','venue_bid_time','venue_ask_time','venue_last_trade_time','venue_last_non_reg_trade_time'];
  const safe=Object.fromEntries(allowed.filter(k=>k in quote&&['string','number','boolean'].includes(typeof quote[k])).map(k=>[k,quote[k]]));
  for(const k of ['bid_price','ask_price'])if(!(Number(safe[k])>0))safe[k]=null;
  const close=row.close;
  const officialClose=close&&(equity?close.symbol===id:close.instrument_id===id)?Object.fromEntries(['price','date','interpolated','source'].filter(k=>k in close&&['string','number','boolean'].includes(typeof close[k])).map(k=>[k,close[k]])):null;
  const clocks=equity?{bid:quoteAge(quote.venue_bid_time,receivedAt),ask:quoteAge(quote.venue_ask_time,receivedAt),last_trade:quoteAge(quote.venue_last_trade_time,receivedAt)}:{refresh:quoteAge(quote.updated_at,receivedAt)};
  return {quote:safe,official_close:officialClose,clocks,book_status:safe.bid_price&&safe.ask_price?(Number(safe.bid_price)>Number(safe.ask_price)?'CROSSED':'AVAILABLE'):'UNAVAILABLE'};
 });
 return {observations,missing:[...requested].filter(id=>!seen.has(id))};
}
function quoteData(result){
 if(result?.structuredContent)return result.structuredContent.data??result.structuredContent;
 for(const item of result?.content||[])if(item.type==='text'){try{const data=JSON.parse(item.text);return data.data??data;}catch{}}
 throw Error('Unsupported Robinhood quote response');
}
export async function handleRobinhood(request,env){
 const url=new URL(request.url),path=url.pathname;
 if(!await verifyAccess(request,env))return reply({ok:false,error:'Private sign in required'},401);
 if(!configured(env))return reply({ok:false,status:'SETUP_REQUIRED',error:'Robinhood connection is awaiting hosted-client approval and configuration'},503);
 const redirect=new URL(env.ROBINHOOD_REDIRECT_URI);
 if(redirect.protocol!=='https:'||redirect.origin!==url.origin||redirect.pathname!=='/private/robinhood/callback'||redirect.search||redirect.hash)return reply({ok:false,error:'Invalid Robinhood callback configuration'},503);
 await key(env);
 if(path==='/private/robinhood/status'&&request.method==='GET'){
  const saved=await connection(env),connected=!!saved&&saved.expires_at>Date.now();
  return reply({ok:true,connected,expires_at:saved?new Date(saved.expires_at).toISOString():null,status:connected?'CONNECTED_UNVERIFIED':saved?'RECONNECT_REQUIRED':'READY_TO_CONNECT',scanner_feed:'DELAYED_RESEARCH'});
 }
 if(path==='/private/robinhood/callback'&&request.method==='GET'){
  const clear={'Set-Cookie':cookie('',0)};
  try{
   const raw=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1);
   if(!raw||raw.length>4000)throw Error();
   const pending=await unseal(raw,env);
   if(pending.expires_at<Date.now()||pending.email!==env.CF_ACCESS_EMAIL.toLowerCase()||pending.state!==url.searchParams.get('state')||url.searchParams.get('iss')!==ISSUER||url.searchParams.has('error'))throw Error();
   const code=url.searchParams.get('code');if(!code||code.length>2000)throw Error();
   const saved=await exchange({grant_type:'authorization_code',code,client_id:env.ROBINHOOD_CLIENT_ID,redirect_uri:redirect.href,code_verifier:pending.verifier,resource:MCP});
   await env.PLAID_STORE.put(storageKey(env),await seal(saved,env));
   return new Response(null,{status:303,headers:{...headers,...clear,Location:'/brokerage.html#robinhood-live'}});
  }catch{return reply({ok:false,error:'Connection could not be completed. Return to brokerage review and reconnect.'},400,clear);}
 }
 if(request.method!=='POST')return reply({ok:false,error:'Not found'},404);
 if(request.headers.get('Origin')!==url.origin||request.headers.get('X-Requested-With')!=='RobinhoodQuotes')return reply({ok:false,error:'Invalid request origin'},403);
 if(path==='/private/robinhood/connect'){
  const verifier=b64(crypto.getRandomValues(new Uint8Array(32))),state=b64(crypto.getRandomValues(new Uint8Array(32)));
  const pending=await seal({verifier,state,email:env.CF_ACCESS_EMAIL.toLowerCase(),expires_at:Date.now()+600000},env);
  const auth=new URL('https://robinhood.com/oauth');
  for(const [k,v] of Object.entries({response_type:'code',client_id:env.ROBINHOOD_CLIENT_ID,redirect_uri:redirect.href,scope:'internal',resource:MCP,state,code_challenge:b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(verifier)))),code_challenge_method:'S256'}))auth.searchParams.set(k,v);
  return reply({ok:true,authorization_url:auth.href},200,{'Set-Cookie':cookie(pending,600)});
 }
 if(path==='/private/robinhood/disconnect'){
  await env.PLAID_STORE.delete(storageKey(env));
  return reply({ok:true,connected:false,revocation_note:'Stored authorization erased. Remove this client in Robinhood to revoke its provider authorization.'},200,{'Set-Cookie':cookie('',0)});
 }
 if(path==='/private/robinhood/quotes'){
  let operation;try{if(Number(request.headers.get('Content-Length'))>10000)throw Error();const raw=await request.text();if(raw.length>10000)throw Error();operation=quoteRequest(JSON.parse(raw));}catch{return reply({ok:false,error:'Invalid quote request'},400);}
  const saved=await connection(env);if(!saved||saved.expires_at<=Date.now()+15000)return reply({ok:false,error:'Reconnect Robinhood before collecting quotes'},409);
  try{
   const init=await rpc(saved.access_token,'initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'0DTE Private Quotes',version:'1.0.0'}});
   if(init.result?.protocolVersion!=='2025-03-26')throw Error('Unsupported Robinhood protocol version');
   // Complete initialization before any market-data operation.
   const ready=await fetch(MCP,{method:'POST',headers:{Authorization:`Bearer ${saved.access_token}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-03-26',...(init.session?{'Mcp-Session-Id':init.session}:{})},body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'}),signal:AbortSignal.timeout(15000)});
   if(!ready.ok)throw Error('Robinhood initialization failed');
   let cursor,matched=false,count=0;
   do{const listed=await rpc(saved.access_token,'tools/list',cursor?{cursor}:{},init.session);matched||=listed.result?.tools?.some(tool=>tool.name===operation.name);cursor=listed.result?.nextCursor;if(++count>10)throw Error('Robinhood tool discovery incomplete');}while(cursor&&!matched);
   if(!matched)throw Error('Required Robinhood quote tool is unavailable');
   const result=await rpc(saved.access_token,'tools/call',operation,init.session),receivedAt=Date.now();
   const data=quoteData(result.result);
   // Extract only quote pairs; never expose arbitrary tool content or account data.
   const normalized=normalizeQuotes(data,operation,receivedAt);
   return reply({ok:true,source:'Robinhood MCP',received_at:new Date(receivedAt).toISOString(),...normalized,latency_verified:false,greek_calculation_time:null,scanner_feed:'DELAYED_RESEARCH'});
  }catch{return reply({ok:false,error:'Robinhood quote verification failed; reconnect or check client setup'},502);}
 }
 return reply({ok:false,error:'Not found'},404);
}
