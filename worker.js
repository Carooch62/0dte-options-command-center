import {handleRobinhood} from './robinhood-live.js';
import {handleShadowResearch} from './shadow-research.js';
import {handlePlaid,scheduledPlaidSync} from './plaid-sync.js';
import {handleWatchService,scheduledWatchCheck} from './watch-service.js';
import {runWatchQuotePilot} from './watch-quote-pilot.js';
const REPO = 'Carooch62/0dte-options-command-center';
const WORKFLOW = 'market-scan.yml';
const VERSION = '2026-11-06.scan-handoff';
const ORIGINS = new Set(['https://carooch62.github.io','https://0dte-options-command-center.h69htk56cq.workers.dev']);
function response(body, status=200, request) {
  const origin=request?.headers.get('Origin');
  return new Response(status===204?null:JSON.stringify(body), {status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',
    ...(ORIGINS.has(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{}),
    'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});
}
function headers(env) {return {Authorization:`Bearer ${env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'0DTE-Command-Center'};}
async function api(path,env,options={}) {
  const r=await fetch(`https://api.github.com/repos/${REPO}/${path}`,{...options,headers:{...headers(env),...options.headers},signal:AbortSignal.timeout(options.timeoutMs??15000)});
  if(!r.ok)throw Object.assign(new Error(`GitHub HTTP ${r.status}`),{status:r.status});
  return r.status===204?null:r.json();
}
const scanRuns=`actions/workflows/${WORKFLOW}/runs?branch=main&per_page=30`;
const runMatches=(run,id)=>run.display_title?.startsWith(`Scan ${id} (`);
const dispatchScan=(env,id,mode)=>api(`actions/workflows/${WORKFLOW}/dispatches`,env,{
  method:'POST',headers:{'Content-Type':'application/json'},timeoutMs:7000,
  body:JSON.stringify({ref:'main',inputs:{scan_mode:mode,request_id:id}})
});
const guard=(env)=>env.SCAN_COORDINATOR.get(env.SCAN_COORDINATOR.idFromName('production-market-scan'));

// Serialize the GitHub list-and-dispatch operation across cron and dashboard requests.
export class ScanCoordinator {
  constructor(state,env){this.state=state;this.env=env;}

  async fetch(request){
    return this.state.blockConcurrencyWhile(async()=>{
      const {id,mode,scheduled}=await request.json();
      const pending=await this.state.storage.get('pending');
      const {workflow_runs:runs}=await api(scanRuns,this.env,{timeoutMs:7000});
      if(pending){
        if(runs.some(run=>runMatches(run,pending.id))||Date.now()>=pending.until){
          await this.state.storage.delete('pending');
        }else{
          return Response.json({status:pending.id===id?'already-requested':'already-running',activeRequestId:pending.id});
        }
      }
      if(runs.some(run=>runMatches(run,id)))return Response.json({status:'already-requested'});
      const unfinished=runs.find(run=>run.status!=='completed');
      if(unfinished){
        const activeRequestId=/^Scan ([a-zA-Z0-9-]{8,80}) \(/.exec(unfinished.display_title)?.[1]??null;
        return Response.json({status:'already-running',activeRequestId});
      }
      if(scheduled&&!regularWeekday(new Date()))return Response.json({status:'outside-session'});
      // A timed-out dispatch may have succeeded. Let GitHub surface it before retrying.
      await this.state.storage.put('pending',{id,until:Date.now()+120000});
      try{await dispatchScan(this.env,id,mode);}
      catch(error){
        if([401,403,404,422,429].includes(error.status))await this.state.storage.delete('pending');
        return Response.json({status:'dispatch-uncertain'}, {status:502});
      }
      return Response.json({status:'dispatched'});
    });
  }
}

async function requestScan(env,id,mode,scheduled){
  const result=await guard(env).fetch('https://scan-coordinator/dispatch',{
    method:'POST',body:JSON.stringify({id,mode,scheduled})
  });
  return result.json();
}
export function regularWeekday(now) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  const minute=Number(parts.hour)*60+Number(parts.minute);
  return !['Sat','Sun'].includes(parts.weekday)&&minute>=570&&minute<960;
}
export async function scheduledScan(env,now=new Date()) {
  if(env.APP_ENV==='preview')return 'preview-disabled';
  if(!regularWeekday(now))return 'outside-session';
  if(!env.GITHUB_TOKEN)throw Error('Refresh service is not configured');
  if(env.SCAN_COORDINATOR){
    const interval=env.FAST_SCAN_ENABLED==='true'?60000:300000;
    const {status}=await requestScan(env,'scheduled-'+Math.floor(now.getTime()/interval),'manual',true);
    return status;
  }
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
    if(env.APP_ENV==='preview')return;
    const now=new Date(controller.scheduledTime);
    const legacyTick=now.getUTCMinutes()%5===1;
    if(legacyTick||(env.FAST_SCAN_ENABLED==='true'&&env.SCAN_COORDINATOR)){
      try{const result=await scheduledScan(env,now);console.log(JSON.stringify({scheduler:result,scheduled_at:controller.scheduledTime}));}
      catch(e){console.log(JSON.stringify({scheduler:'failed',error:e.message}));}
    }
    if(!legacyTick)return;
    if(regularWeekday(now)&&env.WATCH_QUOTE_PILOT_ENABLED==='true'){
      try{console.log(JSON.stringify({watch_quote_pilot:await runWatchQuotePilot(env)}));}
      catch{console.log(JSON.stringify({watch_quote_pilot:{status:'verification-failed'}}));}
    }
    if(regularWeekday(now)){
      try{console.log(JSON.stringify({watch_monitor:await scheduledWatchCheck(env,Date.now())}));}
      catch(e){console.log(JSON.stringify({watch_monitor:'failed',error:e.message}));}
    }
    if(regularWeekday(now)&&new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',minute:'2-digit'}).format(now)==='31') {
      const status=await scheduledPlaidSync(env);
      console.log(JSON.stringify({plaid_sync:status,scheduled_at:controller.scheduledTime}));
    }
  },
  async fetch(request,env) {
    const url=new URL(request.url);
    if(env.APP_ENV==='preview') {
      if(url.pathname.startsWith('/private/')||url.pathname==='/refresh')return response({ok:false,error:'Private connections and scan requests are disabled in branch previews.'},403,request);
      if(url.pathname==='/health')return response({ok:true,environment:'preview',private_connections:false,scan_requests:false},200,request);
    }
    if(url.pathname.startsWith('/private/plaid/robinhood/')) {
      try{return await handleRobinhood(request,env)}catch{return response({ok:false,error:'Private Robinhood service unavailable'},502,request)}
    }
    if(url.pathname.startsWith('/private/watch')) {
      try{return await handleWatchService(request,env)}catch{return response({ok:false,error:'Private watch service unavailable'},502,request)}
    }
    if(url.pathname.startsWith('/private/plaid/')) {
      try{return await handlePlaid(request,env)}catch(e){return response({ok:false,error:e.message},502,request)}
    }
    if(request.method==='OPTIONS')return response({},204,request);
    try {
      const shadow=await handleShadowResearch(request);
      if(shadow)return shadow;
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
        if(env.SCAN_COORDINATOR){
          const {status,activeRequestId}=await requestScan(env,id,mode,false);
          if(status==='already-running')return response({ok:false,status:'ALREADY_RUNNING',active_request_id:activeRequestId,error:'A scan is already running or starting. Check the current scan before retrying.'},409,request);
          if(status!=='dispatched'&&status!=='already-requested')return response({ok:false,error:'Dispatch could not be confirmed. Check scanner status before retrying.'},502,request);
          return response({ok:true,status:'ACCEPTED',request_id:id},202,request);
        }
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


