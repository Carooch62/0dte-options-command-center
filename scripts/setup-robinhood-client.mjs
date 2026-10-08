// Run only in the authenticated Worker deployment job. Never prints credentials.
import {appendFileSync} from 'node:fs';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('Cloudflare deployment credentials are missing');
const root='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account);
const worker='0dte-options-command-center';
async function api(path,options={}){
 const r=await fetch(root+path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000)});
 const data=await r.json();
 if(!r.ok||!data.success)throw Error('Cloudflare configuration API HTTP '+r.status);
 return data.result;
}
// Public OAuth client metadata. These are not user tokens.
for(const [name,text] of Object.entries({
 ROBINHOOD_CLIENT_ID:"LtLiNmbs9owbYfWgBlC68Z2VujIPuvGoAiSYr8xW",
 ROBINHOOD_REDIRECT_URI:'https://0dte-options-command-center.h69htk56cq.workers.dev/private/plaid/robinhood/callback'
})){
 await api('/workers/scripts/'+worker+'/secrets',{method:'PUT',body:JSON.stringify({name,text,type:'secret_text'})});
}
const settings=await api('/workers/scripts/'+worker+'/settings');
const names=new Set((settings.bindings||[]).map(b=>b.name));
const required=['ROBINHOOD_CLIENT_ID','ROBINHOOD_REDIRECT_URI','PLAID_STORE','PLAID_ENCRYPTION_KEY','CF_ACCESS_TEAM_DOMAIN','CF_ACCESS_AUD','CF_ACCESS_EMAIL'];
const missing=required.filter(name=>!names.has(name));
let accessRoutes=null,accessInspection='available';
try{
 const apps=await api('/access/apps?per_page=100');
 const prefix=worker+'.h69htk56cq.workers.dev';
 accessRoutes=apps.flatMap(app=>[app.domain,...(app.destinations||[]).map(d=>d.uri)]).filter(uri=>typeof uri==='string'&&uri.replace(/^https?:\/\//,'').includes('h69htk56cq.workers.dev'));
}catch{accessInspection='not permitted by deployment token';}
// Report route protection separately from provider authorization compatibility.
const origin='https://'+worker+'.h69htk56cq.workers.dev';
const guards=[];
for(const path of ['/brokerage.html','/private/plaid/robinhood/status','/private/plaid/robinhood/callback']){
 const r=await fetch(origin+path,{redirect:'manual',signal:AbortSignal.timeout(15000)});
 const location=r.headers.get('Location');
 let host=null;try{host=new URL(location).hostname;}catch{}
 guards.push({path,protected:r.status===302&&/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(host||''),host});
}
const guarded=guards.every(g=>g.protected)&&new Set(guards.map(g=>g.host)).size===1;
const privatePrerequisitesReady=missing.length===0&&guarded;
// The owner explicitly requested a manual retry. This enables sign-in attempts
// only; registration and Access checks do not prove provider authorization.
const enabled=privatePrerequisitesReady;
await api('/workers/scripts/'+worker+'/secrets',{method:'PUT',body:JSON.stringify({name:'ROBINHOOD_CONNECTION_ENABLED',text:enabled?'true':'false',type:'secret_text'})});
const result={registered_client_configured:true,manual_connection_enabled:enabled,private_prerequisites_ready:privatePrerequisitesReady,authorization_status:enabled?'MANUAL_RETRY_UNVERIFIED':'SETUP_REQUIRED',protected_routes:guards.map(({path,protected:guard})=>({path,protected:guard})),missing_bindings:missing,access_inspection:accessInspection,access_routes:accessRoutes,automatic_polling_enabled:false};
console.log('Robinhood setup: '+JSON.stringify(result));
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'\nRobinhood setup (no credentials):\n\n```json\n'+JSON.stringify(result,null,2)+'\n```\n');
