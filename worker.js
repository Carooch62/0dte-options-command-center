import {handleRobinhood} from './robinhood-live.js';
import {handlePlaid,scheduledPlaidSync} from './plaid-sync.js';
const REPO = 'Carooch62/0dte-options-command-center';
const WORKFLOW = 'market-scan.yml';
const VERSION = '2026-09-30.6-contract-reasons';
const ORIGINS = new Set(['https://carooch62.github.io','https://0dte-options-command-center.h69htk56cq.workers.dev']);
function response(body, status=200, request) {
  const origin=request?.headers.get('Origin');
  return new Response(status===204?null:JSON.stringify(body), {status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',
    ...(ORIGINS.has(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{}),
    'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});
}
function headers(env) {return {Authorization:`Bearer ${env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'0DTE-Command-Center'};}
async function api(path,env,options={}) {
  const r=await fetch(`https://api.github.com/repos/${REPO}/${path}`,{...options,headers:{...headers(env),...options.headers},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error(`GitHub HTTP ${r.status}`);
  return r.status===204?null:r.json();
}
export function regularWeekday(now) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  const minute=Number(parts.hour)*60+Number(parts.minute);
  return !['Sat','Sun'].includes(parts.weekday)&&minute>=570&&minute<960;
}
export async function scheduledScan(env,now=new Date()) {
  if(!regularWeekday(now))return 'outside-session';
  if(!env.GITHUB_TOKEN)throw Error('Refresh service is not configured');
  const d=await api(`actions/workflows/${WORKFLOW}/runs?branch=main&per_page=30`,env);
  const unfinished=d.workflow_runs.find(r=>r.status!=='completed');
  if(unfinished){
    console.log(JSON.stringify({scheduler:'blocked-by-unfinished-run',run_id:unfinished.id,status:unfinished.status,created_at:unfinished.created_at,age_minutes:(now-Date.parse(unfinished.created_at))/60000}));
    return 'already-running';
  }
  const id='scheduled-'+Math.floor(now.getTime()/300000);
  if(d.workflow_runs.some(r=>r.display_title?.startsWith(`Scan ${id} (`)))return 'already-requested';
  await api(`actions/workflows/${WORKFLOW}/dispatches`,env,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:'main',inputs:{scan_mode:'manual',request_id:id}})});
  return 'dispatched';
}
export default {
  async scheduled(controller,env) {
    const result=await scheduledScan(env,new Date(controller.scheduledTime));
    console.log(JSON.stringify({scheduler:result,scheduled_at:controller.scheduledTime}));
    // Existing five-minute trigger: collect a private brokerage snapshot hourly during the session.
    const now=new Date(controller.scheduledTime);
    if(regularWeekday(now)&&new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',minute:'2-digit'}).format(now)==='31') {
      const status=await scheduledPlaidSync(env);
      console.log(JSON.stringify({plaid_sync:status,scheduled_at:controller.scheduledTime}));
    }
  },
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname.startsWith('/private/robinhood/')) {
      try{return await handleRobinhood(request,env)}catch{return response({ok:false,error:'Private Robinhood service unavailable'},502,request)}
    }
    if(url.pathname.startsWith('/private/plaid/')) {
      try{return await handlePlaid(request,env)}catch(e){return response({ok:false,error:e.message},502,request)}
    }
    if(request.method==='OPTIONS')return response({},204,request);
    try {
      if(url.pathname==='/health') {
        if(!env.GITHUB_TOKEN)return response({ok:false,error:'Refresh service is not configured'},503,request);
        const id=url.searchParams.get('request_id');
        if(id&&!/^[a-zA-Z0-9-]{8,80}$/.test(id))return response({ok:false,error:'Invalid request ID'},400,request);
        const d=await api(`actions/workflows/${WORKFLOW}/runs?branch=main&per_page=30`,env);
        const run=id?d.workflow_runs.find(r=>r.display_title?.startsWith(`Scan ${id} (`)):d.workflow_runs[0];
        const latestRun=run?{id:run.id,status:run.status,conclusion:run.conclusion,url:run.html_url,createdAt:run.created_at,steps:[]}:null;
        if(run){
          try{
            const jobs=await api(`actions/runs/${run.id}/jobs?filter=latest&per_page=10`,env);
            const job=jobs.jobs?.find(j=>j.name==='scan');
            latestRun.steps=(job?.steps||[]).map(s=>({name:s.name,status:s.status,conclusion:s.conclusion,startedAt:s.started_at,completedAt:s.completed_at}));
            latestRun.runnerAssigned=!!job?.runner_name;
            latestRun.waitingForRunner=run.status!=='completed'&&!job?.runner_name&&!latestRun.steps.length;
            latestRun.ageMinutes=Math.max(0,(Date.now()-Date.parse(run.created_at))/60000);
            latestRun.publicationNote=latestRun.waitingForRunner?'Waiting for a GitHub runner; scheduled requests are skipped while this run is unfinished.':run.status==='completed'&&!job?.runner_name&&!latestRun.steps.length?'Run ended without an assigned runner or recorded scan steps; no new snapshot was produced.':null;
          }catch(e){latestRun.stepError=e.message;}
        }
        return response({ok:true,version:VERSION,request_id:id,latestRun},200,request);
      }
      if(url.pathname==='/refresh') {
        if(request.method!=='POST')return response({ok:false,error:'POST required'},405,request);
        if(!ORIGINS.has(request.headers.get('Origin')))return response({ok:false,error:'Forbidden origin'},403,request);
        if(!env.GITHUB_TOKEN)return response({ok:false,error:'Refresh service is not configured'},503,request);
        const body=await request.json().catch(()=>({}));
        const id=body.request_id||crypto.randomUUID();
        if(!/^[a-zA-Z0-9-]{8,80}$/.test(id))return response({ok:false,error:'Invalid request ID'},400,request);
        const mode=body.scan_mode==='second-wave'?'second-wave':'manual';
        await api(`actions/workflows/${WORKFLOW}/dispatches`,env,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:'main',inputs:{scan_mode:mode,request_id:id}})});
        return response({ok:true,status:'ACCEPTED',request_id:id},202,request);
      }
      // Data commits do not require redeploying the Worker asset bundle.
      if(/^\/data\/(market-dashboard|market|scan-health|scan-history|scan-receipts|feedback|option-observations)\.json$/.test(url.pathname)) {
        const r=await fetch(`https://raw.githubusercontent.com/${REPO}/main${url.pathname}?v=${Date.now()}`,{cf:{cacheTtl:0},signal:AbortSignal.timeout(15000)});
        return new Response(r.body,{status:r.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
      }
      return env.ASSETS.fetch(request);
    }catch(e){return response({ok:false,error:e.message},502,request);}
  }
};
