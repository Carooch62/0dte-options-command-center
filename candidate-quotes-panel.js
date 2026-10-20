import {candidateQuotes} from './candidate-quotes.js';
import {validateRobinhoodPack} from './robinhood-review.js';
import {quoteGuidance,appendQuoteEvidence,quoteEvidenceInput,scannerFromEvidencePacket,validationTiming,captureWindows} from './quote-evidence.js';
import {SESSION_KEY,sessionPayload,restoreSession} from './quote-session.js';
import {quoteRequestTiming} from './quote-timing.js';
import {requestJSON,safeRequestAttempts} from './private-request.js';
const $=id=>document.getElementById(id);
const failure=e=>e.message;
let attempts=[],retryPath=null;
async function readPrivate(path,body){
 const started=performance.now(),started_at=new Date().toISOString();let code='SUCCESS',http_status=null;
 try{
  const d=await requestJSON('/private/plaid/robinhood/'+path,{method:body?'POST':'GET',...(body?{headers:{'Content-Type':'application/json','X-Requested-With':'RobinhoodQuotes'},body:JSON.stringify(body)}:{})},path==='resolve'?120000:30000);
  retryPath=null;$('connection-state').textContent=`Private service reached: ${path==='candidates'?'scanner batch':path==='quotes'?'quote request':path==='resolve'?'contract matching':'connection status'}.`;
  if(path==='quotes')d.request_timing=quoteRequestTiming({...d.request_timing,browser_ms:performance.now()-started});
  return d;
 }catch(e){code=e.code||'INVALID_RESPONSE';http_status=e.status??null;retryPath=path;$('connection-state').textContent=`${path==='candidates'?'Scanner batch could not be loaded. ':''}${e.message}`;throw e;}
 finally{attempts=safeRequestAttempts([...attempts,{operation:path,code,http_status,started_at,finished_at:new Date().toISOString(),browser_ms:performance.now()-started}]);}
}
let scanner=null,observations=[],evidenceHistory=[],busy=false,scannerSource='No snapshot';
let recoveryMessage='Tab recovery ready. Export observations for durable retention.';
function persist(){
 try{const payload=sessionPayload(scanner,observations,evidenceHistory,scannerSource,Date.now(),attempts);if(payload)sessionStorage.setItem(SESSION_KEY,JSON.stringify(payload));else sessionStorage.removeItem(SESSION_KEY);recoveryMessage='Saved in this tab. Recovery expires after 24 hours; export before closing the tab.';}
 catch{try{sessionStorage.removeItem(SESSION_KEY);}catch{}recoveryMessage='Tab recovery unavailable. Export observations before reloading or leaving.';}
 $('session-info').textContent=recoveryMessage;
}
function mayReplace(){return !evidenceHistory.length||confirm('Replace this batch and clear its captured observations? Export first to keep them.');}
try{const raw=sessionStorage.getItem(SESSION_KEY);if(raw){const d=restoreSession(raw);scanner=d.scanner;observations=d.observations;evidenceHistory=d.history;scannerSource=d.source;attempts=d.requests;recoveryMessage='Restored this tab’s session with original timestamps. Refresh quotes before relying on prices.';$('status').textContent=recoveryMessage;}}
catch{recoveryMessage='No usable saved session. Load a batch; expired or damaged recovery is not used.';try{sessionStorage.removeItem(SESSION_KEY);}catch{}}
function render(){
 $('session-info').textContent=recoveryMessage;$('clear-session').disabled=busy||!scanner&&!attempts.length;
 $('check-connection').disabled=busy;$('retry-request').disabled=busy||!retryPath;
 $('retry-request').textContent=retryPath?`Retry ${retryPath==='candidates'?'batch load':retryPath==='quotes'?'quote refresh':retryPath==='resolve'?'contract matching':'connection check'}`:'Retry last failed request';
 const success=attempts.filter(a=>a.code==='SUCCESS').at(-1);
 $('last-success').textContent=success?`${success.operation} · ${success.finished_at}`:'No successful request recorded in this tab';
 $('request-count').textContent=`${attempts.filter(a=>a.operation==='quotes'&&a.code==='SUCCESS').length} quote responses · ${attempts.filter(a=>a.code!=='SUCCESS').length} failed requests retained (latest 200 attempts). Successful responses may contain missing or failing contract checks.`;
 $('load-scanner').disabled=busy;$('load-current').disabled=busy;$('resolve').disabled=busy||!scanner?.candidates?.length;
 $('load-validation').disabled=busy;$('validation-clock').textContent=validationTiming(evidenceHistory);
 $('capture-windows').replaceChildren();
 const windows=captureWindows(evidenceHistory),clock=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
 for(const contract of [...new Set(windows.map(w=>w.contract))]){const p=document.createElement('p');p.textContent=contract+' · '+windows.filter(w=>w.contract===contract).map(w=>`${w.minutes}m: ${w.state==='OPEN'?'REFRESH NOW · closes in '+clock(w.seconds):w.state==='UPCOMING'?'opens in '+clock(w.seconds):w.state}${w.failed_checks?' (quote check failed)':''}`).join(' | ');$('capture-windows').append(p);}
 $('export-evidence').disabled=busy||!evidenceHistory.length&&!attempts.length;
 $('resolve-help').textContent=busy?'A request is in progress. Wait for it to finish.':!scanner?'Load a batch first.':!scanner.candidates?.length?'This batch has no candidates. Load a current batch with eligible research contracts.':'Ready to match exact contracts and fetch their first quotes.';
 $('export-help').textContent=busy?'Wait for the current request to finish.':evidenceHistory.length||attempts.length?'Ready to export observations and request diagnostics, including failures.':'Fetch quotes before exporting observations.';
 $('refresh-help').textContent=busy?'A request is in progress. Wait for it to finish.':'Load a batch, then match contracts to enable refresh. Waiting five minutes does not enable this button.';
 const latest=observations.filter(x=>Number.isFinite(Date.parse(x.received_at))).sort((a,b)=>Date.parse(b.received_at)-Date.parse(a.received_at))[0];
 $('last-receipt').textContent=latest?.received_at||'No current quote response';
 const duration=latest?.request_timing?.browser_ms;
 $('request-duration').textContent=Number.isFinite(duration)?`${(duration/1000).toFixed(2)} seconds`:'Not measured for this response';
 const generated=Date.parse(scanner?.generated_at),age=(Date.now()-generated)/60000;
 $('snapshot-info').textContent=scanner?`${scannerSource} · Generated: ${scanner.generated_at||'unknown'} · Age: ${Number.isFinite(age)&&age>=0?age.toFixed(1)+' minutes':'unknown'} · Coverage: ${scanner.included_contracts??'unknown'} included / ${scanner.total_contracts??'unknown'} total; ${scanner.omitted_contracts??'unknown'} omitted${scanner.research_rejected_contracts!==undefined?' · '+scanner.research_rejected_contracts+' price-only matches rejected by research screens':''}${scanner.scanned_contracts!==undefined?' · '+scanner.scanned_contracts+' identities examined; batch requires published research screens':''} · Snapshot freshness is separate from quote freshness.`:'No scanner snapshot loaded.';
 $('scanner').disabled=busy;$('research').disabled=busy;
 $('rows').replaceChildren();if(!scanner){$('refresh').disabled=true;$('quote-summary').textContent='No quotes checked.';return [];}
 const rows=candidateQuotes(scanner,observations);
 const within=rows.filter(r=>r.status==='QUOTE_CHECK_PASSED'&&r.premium_status==='WITHIN_LIMIT').length,above=rows.filter(r=>r.status==='QUOTE_CHECK_PASSED'&&r.premium_status==='ABOVE_LIMIT').length;
 $('quote-summary').textContent=`${within} fresh quotes within $0.30 · ${above} fresh quotes above limit · ${rows.length-within-above} unverified or requires recheck. Quote checks are not setup eligibility or trade recommendations.`;
 for(const row of rows.filter(r=>!$('verified-only').checked||r.status==='QUOTE_CHECK_PASSED'&&r.premium_status==='WITHIN_LIMIT')){const tr=document.createElement('tr');for(const value of [row.contract,row.bid===undefined?'Unknown':`${row.bid} / ${row.ask}`,Number.isFinite(row.age_seconds)?row.age_seconds.toFixed(1):'Unknown',row.premium_status==='WITHIN_LIMIT'?'Within $0.30':row.premium_status==='ABOVE_LIMIT'?'Above $0.30 · outside budget':'Unknown · quote check required',quoteGuidance(row)]){const td=document.createElement('td');td.textContent=value;td.setAttribute?.('data-label',['Contract','Bid / ask','Age (seconds)','$0.30 live ask','Quote check'][tr.children.length]);tr.append(td);}$('rows').append(tr);}
 const matched=rows.some(r=>r.instrument_id);
 $('refresh').disabled=busy||!matched;
 if(!busy&&matched)$('refresh-help').textContent='Ready to refresh manually. Use the validation clock for 5 / 10 / 15-minute captures; there is no automatic polling.';
 return rows;
}
for(const id of ['scanner','research'])$(id).onchange=async e=>{if(busy||id==='scanner'&&!mayReplace())return;try{const f=e.target.files[0];if(!f)return;if(f.size>10000000)throw Error('Maximum file size is 10 MB');const data=JSON.parse(await f.text());if(id==='scanner'){if(!Array.isArray(data.candidates))throw Error('Expected scanner candidates');candidateQuotes(data,[]);scanner=data;observations=[];evidenceHistory=[];scannerSource='Imported file; environment unverified';}else observations=validateRobinhoodPack(data).observations;render();persist();$('status').textContent='Snapshot checks updated. No scanner rankings changed.';}catch(e){render();persist();$('status').textContent=e.message;}};
$('load-scanner').onclick=async()=>{
 if(busy||!mayReplace())return;busy=true;render();
 try{
 const read=path=>requestJSON(path);
 const health=await read('/health');if(health.environment!=='staging')throw Error('This loader requires the staging environment. Import a snapshot instead.');
 const data=await read('/data/candidate-snapshot.json');candidateQuotes(data,[]);
 if(!Number.isFinite(Date.parse(data.generated_at)))throw Error('Snapshot generation timestamp is missing or invalid.');
 scanner=data;observations=[];evidenceHistory=[];scannerSource='Staging · same-origin scanner data';$('status').textContent='Staging snapshot loaded. Review its generation time before using candidates.';
 }catch(e){$('status').textContent=e.message;}finally{busy=false;persist();render();}
};
$('load-current').onclick=async()=>{
 if(busy||!mayReplace())return;busy=true;render();$('status').textContent='Loading current scanner candidates…';
 try{const d=await readPrivate('candidates');candidateQuotes(d.snapshot,[]);if(!Number.isFinite(Date.parse(d.snapshot.generated_at)))throw Error('Invalid scanner timestamp');scanner=d.snapshot;observations=[];evidenceHistory=[];scannerSource='Production · private current scanner batch';$('status').textContent=`Loaded ${scanner.included_contracts} contracts from ${scanner.qualifying_contracts} passing research screens and ask <= $0.30. At most two per ticker. Review scan age; prices are not live.${scanner.included_contracts===0?' No candidates passed; no fallback to unscreened contracts.':''}`;}catch(e){$('status').textContent=failure(e);}finally{busy=false;persist();render();}
};
$('load-validation').onclick=async()=>{
 if(busy||!mayReplace())return;busy=true;render();
 try{
 const replacement=scannerFromEvidencePacket(await requestJSON('/data/staging-shadow-evidence-latest.json'));scanner=replacement;observations=[];evidenceHistory=[];scannerSource='STAGING VALIDATION · frozen evidence packet';$('status').textContent=`Loaded ${scanner.included_contracts} staging contracts. Packet captured ${scanner.captured_at}; session ${scanner.market_session||'unknown'}. Require a fresh OPEN-session packet for validation. Match contracts and fetch live quotes next.`;
 }catch(e){$('status').textContent=e.message;}finally{busy=false;persist();render();}
};
$('resolve').onclick=async()=>{
 if(busy||!scanner)return;
 const contracts=[],seen=new Set();
 for(const c of scanner.candidates)for(const o of [...(c.options||[]),...Object.values(c.expiry_groups||{}).flatMap(g=>g?.options||[])]){const x={ticker:c.ticker,strike:Number(o.strike),side:o.side,expiry:o.expiry},key=JSON.stringify(x);if(!seen.has(key)){seen.add(key);contracts.push(x);}}
 if(!contracts.length||contracts.length>20){$('status').textContent='Resolve requires 1–20 contracts. Load the current batch or import a smaller snapshot.';return;}
 busy=true;observations=[];render();$('status').textContent='Resolving exact contracts from Robinhood metadata…';
 try{
 const d=await readPrivate('resolve',{contracts});if(!Array.isArray(d.results)||d.results.length!==contracts.length)throw Error('Incomplete metadata response');
 const mapped=[];
 for(let n=0;n<contracts.length;n++){
 const r=d.results[n],c=contracts[n];if(!r?.contract||r.contract.ticker!==c.ticker||Number(r.contract.strike)!==c.strike||r.contract.expiry!==c.expiry||r.contract.side!==c.side)throw Error('Unexpected contract response');
 if(r.status==='EXACT_METADATA_MATCH'){const i=r.instrument;if(i?.chain_symbol!==c.ticker||Number(i.strike_price)!==c.strike||i.expiration_date!==c.expiry||i.type!==c.side)throw Error('Unexpected contract metadata');mapped.push({instrument:i,quote:{instrument_id:i.id},received_at:null});}
 }
 observations=mapped;$('status').textContent=`Matched ${mapped.length} of ${contracts.length}. Missing, ambiguous or incomplete mappings stay unverified. Refresh matched quotes next.`;
 }catch(e){observations=[];$('status').textContent=failure(e);}finally{busy=false;persist();render();}
 if(observations.length)await $('refresh').onclick();
};
$('refresh').onclick=async()=>{
 if(busy)return;
 busy=true;const rows=render(),ids=[...new Set(rows.map(r=>r.instrument_id).filter(Boolean))];
 if(ids.length>20){busy=false;render();$('status').textContent='More than 20 matches. Import a smaller candidate snapshot.';return;}
 const prior=observations;observations=[];render();$('status').textContent='Fetching matched quotes…';
 try{const data=await readPrivate('quotes',{kind:'option',instrument_ids:ids});
 if(!Array.isArray(data.observations))throw Error('Quote response is incomplete. Retry the private request.');
 const seen=new Set();observations=data.observations.map(x=>{const id=x.quote.instrument_id;if(!ids.includes(id)||seen.has(id))throw Error('Unexpected quote identity');seen.add(id);const old=prior.find(p=>p.instrument.id===id);return {instrument:old.instrument,quote:x.quote,received_at:data.received_at,request_timing:data.request_timing};});
 observations.push(...prior.filter(x=>!seen.has(x.instrument.id)).map(x=>({...x,quote:{instrument_id:x.instrument.id},received_at:null})));
 evidenceHistory=appendQuoteEvidence(scanner,observations,evidenceHistory);
 $('status').textContent=`Received ${data.received_at}. Missing contracts: ${ids.filter(id=>!seen.has(id)).length}. Refresh request: ${(data.request_timing.browser_ms/1000).toFixed(1)} seconds.`;
 }catch(e){observations=prior.map(x=>({...x,quote:{instrument_id:x.instrument.id},received_at:null}));$('status').textContent=failure(e);}finally{busy=false;persist();render();}
};
 $('verified-only').onchange=render;
 $('check-connection').onclick=async()=>{if(busy)return;busy=true;render();try{const d=await readPrivate('status');$('authorization-state').textContent=d.connected?`Authorized until ${d.expires_at}. This is separate from a successful quote request.`:'Robinhood authorization is inactive. Open Connections to connect or renew.';$('status').textContent='Connection status checked. Batch loading and quote checks are separate.';}catch(e){$('authorization-state').textContent='Authorization could not be checked; the previous stored connection may still be active.';$('status').textContent=failure(e);}finally{busy=false;persist();render();}};
 $('retry-request').onclick=()=>{const id={status:'check-connection',candidates:'load-current',resolve:'resolve',quotes:'refresh'}[retryPath];if(!busy&&id)return $(id).onclick();};
 $('clear-session').onclick=()=>{if(busy||!mayReplace())return;scanner=null;observations=[];evidenceHistory=[];attempts=[];retryPath=null;persist();render();$('status').textContent='Session cleared in this tab. Exported files are unchanged.';};
 render();
setInterval(render,1000);
$('export-evidence').onclick=()=>{
 if(busy||!evidenceHistory.length&&!attempts.length)return;
 const blob=new Blob([JSON.stringify(quoteEvidenceInput(scanner,evidenceHistory,new Date().toISOString(),attempts),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='private-quote-outcomes.json';a.click();URL.revokeObjectURL(url);
 $('status').textContent='Private quote observations exported. Run the offline outcome tool to evaluate available windows. Refresh manually to collect later observations.';
};




