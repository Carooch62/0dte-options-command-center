// Public research only. The staging workflow's XNYS gate remains authoritative.
const REPO='Carooch62/0dte-options-command-center';
const WORKFLOW='staging-scan.yml';
export function collectionSnapshotOpen(snapshot,now){
 const at=now.getTime(),generated=Date.parse(snapshot?.generated_at),open=Date.parse(snapshot?.session_open_at),close=Date.parse(snapshot?.session_close_at);
 return snapshot?.market_session==='OPEN'&&[at,generated,open,close].every(Number.isFinite)&&generated>=open&&generated<close&&at>=open+300000&&at<close&&at>=generated&&at-generated<=480000;
}
export async function coordinateStaging(state,env,id,api,now=Date.now()){
 if(!/^staging-slot-\d{7,12}$/.test(id))return Response.json({status:'invalid-request'},{status:400});
 const pending=await state.storage.get('staging-pending');
 const {workflow_runs:runs}=await api(`actions/workflows/${WORKFLOW}/runs?per_page=30`,env,{timeoutMs:7000});
 const matching=run=>run.display_title===`Staging ${id}`;
 if(runs.some(matching))return Response.json({status:'already-requested'});
 if(runs.some(run=>run.status!=='completed'))return Response.json({status:'already-running'});
 if(pending&&now<pending.until)return Response.json({status:'dispatch-pending'});
 await state.storage.put('staging-pending',{id,until:now+300000});
 try{await api(`actions/workflows/${WORKFLOW}/dispatches`,env,{method:'POST',timeoutMs:7000,headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:'main',inputs:{request_id:id}})});}
 catch{return Response.json({status:'dispatch-uncertain'},{status:502});}
 return Response.json({status:'dispatched'});
}
export async function scheduledStagingCollection(env,now=new Date(),fetcher=fetch){
 if(env.APP_ENV==='preview'||env.STAGING_COLLECTION_ENABLED!=='true')return 'disabled';
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
 const minute=Number(parts.hour)*60+Number(parts.minute);
 if(['Sat','Sun'].includes(parts.weekday)||minute<575||minute>=960)return 'outside-session';
 if(!env.GITHUB_TOKEN||!env.SCAN_COORDINATOR)return 'prerequisites-unavailable';
 let snapshot;
 try{
  const r=await fetcher(`https://raw.githubusercontent.com/${REPO}/main/data/market-dashboard.json`,{cache:'no-store',cf:{cacheTtl:0},signal:AbortSignal.timeout(10000)});
  if(!r.ok)return 'calendar-source-unavailable';snapshot=await r.json();
 }catch{return 'calendar-source-unavailable';}
 if(!collectionSnapshotOpen(snapshot,now))return 'no-fresh-open-calendar';
 const owner=env.SCAN_COORDINATOR.get(env.SCAN_COORDINATOR.idFromName('prospective-staging-collection'));
 const r=await owner.fetch('https://scan-coordinator/staging',{method:'POST',body:JSON.stringify({id:`staging-slot-${Math.floor(now.getTime()/900000)}`})});
 return (await r.json()).status;
}
