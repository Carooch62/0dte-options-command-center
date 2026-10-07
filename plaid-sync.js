// Private brokerage integration. All routes fail closed until Access, KV and Plaid are configured.
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const privateHeaders = {'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply = (value,status=200)=>new Response(JSON.stringify(value),{status,headers:privateHeaders});
const decode = s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const encode = bytes=>btoa(String.fromCharCode(...bytes));
const required = env=>Boolean(env.PLAID_CLIENT_ID&&env.PLAID_SECRET&&env.PLAID_STORE&&env.PLAID_ENCRYPTION_KEY&&env.PLAID_ENV&&env.CF_ACCESS_TEAM_DOMAIN&&env.CF_ACCESS_AUD&&env.CF_ACCESS_EMAIL);

export async function verifyAccess(request,env,now=Date.now()) {
  const domain=env.CF_ACCESS_TEAM_DOMAIN;
  if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain||''))return false;
  const token=request.headers.get('Cf-Access-Jwt-Assertion');
  if(!token||token.length>10000)return false;
  const pieces=token.split('.');if(pieces.length!==3)return false;
  try {
    const header=JSON.parse(decoder.decode(decode(pieces[0]))),payload=JSON.parse(decoder.decode(decode(pieces[1])));
    if(header.alg!=='RS256'||!header.kid||payload.iss!==`https://${domain}`||!Array.isArray(payload.aud)||!payload.aud.includes(env.CF_ACCESS_AUD)||payload.email?.toLowerCase()!==env.CF_ACCESS_EMAIL.toLowerCase()||!(payload.exp>now/1000)||!(payload.nbf===undefined||payload.nbf<=now/1000))return false;
    const certs=await fetch(`https://${domain}/cdn-cgi/access/certs`,{signal:AbortSignal.timeout(7000)});
    if(!certs.ok)return false;
    const jwk=(await certs.json()).keys?.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)return false;
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(pieces[2]),encoder.encode(`${pieces[0]}.${pieces[1]}`));
  }catch{return false;}
}

async function cipherKey(env){const bytes=decode(env.PLAID_ENCRYPTION_KEY);if(bytes.length!==32)throw Error('Encryption key must contain 32 bytes');return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);}
async function seal(data,env){const iv=crypto.getRandomValues(new Uint8Array(12));const value=await crypto.subtle.encrypt({name:'AES-GCM',iv},await cipherKey(env),encoder.encode(JSON.stringify(data)));return JSON.stringify({iv:encode(iv),value:encode(new Uint8Array(value))});}
async function unseal(raw,env){const x=JSON.parse(raw);return JSON.parse(decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(x.iv)},await cipherKey(env),decode(x.value))));}
async function plaid(path,body,env){
  const host=env.PLAID_ENV==='sandbox'?'sandbox':env.PLAID_ENV==='production'?'production':null;
  if(!host)throw Error('Plaid environment must be configured');
  const r=await fetch(`https://${host}.plaid.com${path}`,{method:'POST',headers:{'Content-Type':'application/json','PLAID-CLIENT-ID':env.PLAID_CLIENT_ID,'PLAID-SECRET':env.PLAID_SECRET},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
  const data=await r.json();if(!r.ok)throw Error(`Plaid ${data.error_code||r.status}: ${data.error_message||'Request failed'}`);return data;
}
async function saved(env){const raw=await env.PLAID_STORE.get('connection');return raw?unseal(raw,env):null;}
async function collect(env,connection){
  const token=connection.access_token;
  const holdings=await plaid('/investments/holdings/get',{access_token:token},env);
  const end=new Date().toISOString().slice(0,10),start=new Date(Date.now()-365*86400000).toISOString().slice(0,10);
  const transactions=[];const securities=new Map((holdings.securities||[]).map(s=>[s.security_id,s]));let offset=0,total=Infinity;
  while(offset<total){
    const page=await plaid('/investments/transactions/get',{access_token:token,start_date:start,end_date:end,options:{count:500,offset}},env);
    for(const security of page.securities||[])securities.set(security.security_id,{...securities.get(security.security_id),...security});
    transactions.push(...(page.investment_transactions||[]));total=page.total_investment_transactions??transactions.length;offset=transactions.length;
    if(!page.investment_transactions?.length||offset>10000)break;
  }
  return {source:'Plaid Investments',retrieved_at:new Date().toISOString(),range:{start,end},item_id:connection.item_id,accounts:holdings.accounts||[],holdings:holdings.holdings||[],securities:[...securities.values()],transactions,coverage:{reported_transactions:transactions.length,total_transactions:total,complete:offset>=total}};
}
export async function scheduledPlaidSync(env){
  if(!required(env))return 'unconfigured';
  const connection=await saved(env);if(!connection)return 'unlinked';
  try{const snapshot=await collect(env,connection);await env.PLAID_STORE.put('snapshot',await seal(snapshot,env));await env.PLAID_STORE.delete('sync-error');return 'updated';}
  catch(e){await env.PLAID_STORE.put('sync-error',JSON.stringify({at:new Date().toISOString(),message:e.message}));return 'failed';}
}
export async function handlePlaid(request,env){
  if(!required(env))return reply({ok:false,error:'Private Plaid sync is not configured'},503);
  if(!await verifyAccess(request,env))return reply({ok:false,error:'Access sign in required'},401);
  await cipherKey(env);
  const url=new URL(request.url),path=url.pathname;
  if(request.method==='GET'){
    if(path==='/private/plaid/status')return reply({ok:true,connected:!!await saved(env),sync_error:JSON.parse(await env.PLAID_STORE.get('sync-error')||'null'),last_updated:(await env.PLAID_STORE.get('snapshot')? (await unseal(await env.PLAID_STORE.get('snapshot'),env)).retrieved_at:null)});
    if(path==='/private/plaid/snapshot'){const raw=await env.PLAID_STORE.get('snapshot');return reply({ok:true,snapshot:raw?await unseal(raw,env):null});}
    return reply({ok:false,error:'Not found'},404);
  }
  if(request.method!=='POST')return reply({ok:false,error:'POST required'},405);
  if(request.headers.get('Origin')!==url.origin||request.headers.get('X-Requested-With')!=='BrokerageReview')return reply({ok:false,error:'Invalid request origin'},403);
  if(path==='/private/plaid/link-token'){
    const data=await plaid('/link/token/create',{client_name:'0DTE Options Command Center',language:'en',country_codes:['US'],products:['investments'],user:{client_user_id:'personal-brokerage-review'}},env);
    return reply({ok:true,link_token:data.link_token});
  }
  if(path==='/private/plaid/exchange'){
    if(await saved(env))return reply({ok:false,error:'Disconnect existing account before linking another'},409);
    const {public_token}=await request.json().catch(()=>({}));if(typeof public_token!=='string'||public_token.length>1000)return reply({ok:false,error:'Invalid Link token'},400);
    const item=await plaid('/item/public_token/exchange',{public_token},env);
    await env.PLAID_STORE.put('connection',await seal({access_token:item.access_token,item_id:item.item_id},env));
    return reply({ok:true,connected:true});
  }
  if(path==='/private/plaid/sync'){
    if(!await saved(env))return reply({ok:false,error:'Connect an account first'},409);
    const status=await scheduledPlaidSync(env);return reply({ok:status==='updated',status},status==='updated'?200:502);
  }
  if(path==='/private/plaid/disconnect'){
    const connection=await saved(env);
    if(connection)await plaid('/item/remove',{access_token:connection.access_token},env);
    await Promise.all(['connection','snapshot','sync-error'].map(k=>env.PLAID_STORE.delete(k)));
    return reply({ok:true});
  }
  return reply({ok:false,error:'Not found'},404);
}

