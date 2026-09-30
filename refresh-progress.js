// Shared status model: every completed stage comes from a response, job step, or published receipt.
export function refreshProgress({requestStatus='accepted',run=null,published=false}={}) {
  const steps=[['request','Request sent'],['queue','Queued'],['prepare','Preparing'],['scan','Scan & validate'],['publish','Publishing'],['complete','Published']].map(([id,label])=>({id,label,state:'waiting',detail:''}));
  const set=(id,state,detail='')=>Object.assign(steps.find(s=>s.id===id),{state,detail});
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
  return Array.isArray(receipts)?receipts.find(r=>r.scan_id===id)||null:null;
}
