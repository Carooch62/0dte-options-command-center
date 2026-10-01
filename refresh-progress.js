// Shared status model: every completed stage comes from a response, job step, or published receipt.
export function refreshProgress({requestStatus='accepted',run=null,published=false,closed=false,waiting=false}={}) {
  const steps=[['request','Request sent'],['queue','Queued'],['prepare','Preparing'],['scan','Scan & validate'],['publish','Publishing'],['complete','Published']].map(([id,label])=>({id,label,state:'waiting',detail:''}));
  const set=(id,state,detail='')=>Object.assign(steps.find(s=>s.id===id),{state,detail});
  if(waiting){for(const s of steps)s.state='done';set('scan','skipped','First five-minute bar is not complete yet');set('publish','skipped','Last snapshot retained');steps[5].label='Waiting for first bar';steps[5].detail='Request finished without a new snapshot';return steps;}
  if(closed){for(const s of steps)s.state='done';set('scan','skipped','Market calendar is closed; no new scan');set('publish','skipped','Last snapshot retained');steps[5].label='Market closed';steps[5].detail='Request finished';return steps;}
  if(published){for(const s of steps)s.state='done';steps[5].detail='Verified in published data';return steps;}
  if(requestStatus==='sending'){set('request','active','Contacting refresh service');return steps;}
  if(requestStatus==='unknown'&&!run){set('request','active','Checking whether the request reached GitHub');return steps;}
  if(requestStatus==='failed'){set('request','failed','Request was rejected');return steps;}
  set('request','done','Refresh service accepted the request');
  if(!run){set('queue','active','Waiting for GitHub to register this request');return steps;}
  if(['queued','waiting','requested','pending'].includes(run.status)){set('queue','active','Waiting for an available runner');return steps;}
  set('queue','done');
  const jobSteps=run.steps||[],scan=jobSteps.find(s=>s.name==='Scan, enrich, and validate'),publish=jobSteps.find(s=>s.name==='Publish validated data or failure health');
  const scanIndex=jobSteps.indexOf(scan),prep=scanIndex>=0?jobSteps.slice(0,scanIndex):jobSteps;
  const failed=s=>['failure','cancelled','timed_out','action_required'].includes(s?.conclusion);
  const prepFailed=prep.find(failed),prepActive=prep.find(s=>s.status==='in_progress');
  if(prepFailed){set('prepare','failed',prepFailed.name);return steps;}
  if(scan?.status==='in_progress'||scan?.status==='completed')set('prepare','done');
  else if(run.status==='completed'&&run.conclusion==='success')set('complete','active','Run succeeded; checking published data (step details unavailable)');
  else set('prepare','active',prepActive?.name||'Starting the job and checking dependencies');
  if(scan?.status==='in_progress')set('scan','active','Collecting prices, news and chains; checking data quality');
  if(scan?.status==='completed')set('scan',scan.conclusion==='success'?'done':'failed',scan.conclusion==='success'?'Data validation passed':`Scanner ${scan.conclusion||'did not finish'}`);
  if(scan?.conclusion==='success') {
    if(publish?.status==='in_progress')set('publish','active','Writing the validated snapshot');
    if(publish?.status==='completed')set('publish',publish.conclusion==='success'?'done':'failed',publish.conclusion==='success'?'Commit completed; checking published data':`Publication ${publish.conclusion}`);
    if(publish?.conclusion==='success')set('complete','active','Waiting for the published snapshot or receipt');
  }
  if(run.status==='completed'&&run.conclusion!=='success'&&!steps.some(s=>s.state==='failed')){
    const current=steps.find(s=>s.state==='active')||steps.find(s=>s.state==='waiting');
    if(current){current.state='failed';current.detail=`Run ${run.conclusion||'did not complete'}`;}
  }
  return steps;
}
export function publishedReceipt(data,receipts,id){
  if(!id)return null;
  if(data?.scan_id===id)return {scan_id:id,generated_at:data.generated_at,coverage:data.coverage};
  return Array.isArray(receipts)?receipts.find(r=>r.scan_id===id&&!['CLOSED','WAITING_FOR_BAR'].includes(r.status))||null:null;
}

export function closedReceipt(receipts,health,id){
  if(!id)return null;
  const receipt=Array.isArray(receipts)?receipts.find(r=>r.scan_id===id&&r.status==='CLOSED'):null;
  if(receipt)return receipt;
  if(health?.status==='CLOSED'&&health.request_id===id)return {scan_id:id,status:'CLOSED',completed_at:health.updated_at};
  return null;
}

export function refreshBlocksNewRequest(request,now=Date.now()){
  return Boolean(request&&request.run?.status!=='completed'&&now-request.started<20*60000);
}
export function publicationCheckExpired(request,now=Date.now()){
  return request?.run?.status==='completed'&&request.run.conclusion==='success'&&Number.isFinite(request.verificationStarted)&&now-request.verificationStarted>=90000;
}

export function verifiedRefresh(request,data,receipts,health,now=Date.now()){
  if(!request?.id)return null;
  const closed=closedReceipt(receipts,health,request.id);
  const waiting=(Array.isArray(receipts)?receipts.find(r=>r.scan_id===request.id&&r.status==='WAITING_FOR_BAR'):null)||(health?.status==='WAITING_FOR_BAR'&&health.request_id===request.id?{scan_id:request.id,status:health.status,completed_at:health.updated_at,retry_after:health.retry_after}:null);
  const receipt=closed||waiting?null:publishedReceipt(data,receipts,request.id);
  if(!closed&&!waiting&&!receipt)return null;
  const completed=Date.parse((closed||waiting)?.completed_at);
  return {...request,closed,waiting,receipt,unverified:false,failed:false,verificationStarted:null,
    finished:Number.isFinite(completed)?completed:request.finished||now,
    message:waiting?'Waiting for the first completed five-minute bar; last snapshot retained.':closed?'Market closed · refresh finished.':'Refresh completed.'};
}
