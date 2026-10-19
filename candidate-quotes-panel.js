import {candidateQuotes} from './candidate-quotes.js';
import {validateRobinhoodPack} from './robinhood-review.js';
import {quoteGuidance,appendQuoteEvidence,quoteEvidenceInput,scannerFromEvidencePacket,validationTiming} from './quote-evidence.js';
import {SESSION_KEY,sessionPayload,restoreSession} from './quote-session.js';
import {quoteRequestTiming} from './quote-timing.js';
const $=id=>document.getElementById(id);
const recovery='Quote request could not reach the private service. Open Brokerage review and sign in, then retry. If already signed in, check your connection.';
const failure=e=>e instanceof TypeError||e.name==='AbortError'||e.name==='TimeoutError'?recovery:e.message;
async function readPrivate(path,body){
 const started=performance.now();
 let r;
 try{r=await fetch('/private/plaid/robinhood/'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(120000),...(body?{headers:{'Content-Type':'application/json','X-Requested-With':'RobinhoodQuotes'},body:JSON.stringify(body)}:{})});}
 catch(e){$('connection-state').textContent='Private service could not be reached. Review Connections, then retry here.';throw e;}
 $('connection-state').textContent=r.status===401||!r.headers.get('content-type')?.includes('application/json')?'Private sign-in required. Open Connections, sign in, then return here.':r.ok?'Private service reached. Robinhood authorization is checked when matching or fetching quotes.':'Private request failed. See the request message below; review Connections if authorization has expired.';
 if(!r.headers.get('content-type')?.includes('application/json'))throw Error('Open Brokerage review and sign in, then retry.');
 const d=await r.json();if(!r.ok)throw Error(r.status===401?'Private sign-in required. Open Brokerage review, sign in, then retry.':d.error||'Private request failed');
 if(path==='quotes')d.request_timing=quoteRequestTiming({...d.request_timing,browser_ms:performance.now()-started});
 return d;
}
let scanner=null,observations=[],evidenceHistory=[],busy=false,scannerSource='No snapshot';
let recoveryMessage='Tab recovery ready. Export observations for durable retention.';
function persist(){
 try{const payload=sessionPayload(scanner,observations,evidenceHistory,scannerSource);if(payload)sessionStorage.setItem(SESSION_KEY,JSON.stringify(payload));else sessionStorage.removeItem(SESSION_KEY);recoveryMessage='Saved in this tab. Recovery expires after 24 hours; export before closing the tab.';}
 catch{try{sessionStorage.removeItem(SESSION_KEY);}catch{}recoveryMessage='Tab recovery unavailable. Export observations before reloading or leaving.';}
 $('session-info').textContent=recoveryMessage;
}
function mayReplace(){return !evidenceHistory.length||confirm('Replace this batch and clear its captured observations? Export first to keep them.');}
try{const raw=sessionStorage.getItem(SESSION_KEY);if(raw){const d=restoreSession(raw);scanner=d.scanner;observations=d.observations;evidenceHistory=d.history;scannerSource=d.source;recoveryMessage='Restored this tab’s session with original timestamps. Refresh quotes before relying on prices.';$('status').textContent=recoveryMessage;}}
catch{recoveryMessage='No usable saved session. Load a batch; expired or damaged recovery is not used.';try{sessionStorage.removeItem(SESSION_KEY);}catch{}}
function render(){
 $('session-info').textContent=recoveryMessage;$('clear-session').disabled=busy||!scanner;
 $('load-scanner').disabled=busy;$('load-current').disabled=busy;$('resolve').disabled=busy||!scanner?.candidates?.length;
 $('load-validation').disabled=busy;$('validation-clock').textContent=validationTiming(evidenceHistory);
 $('export-evidence').disabled=busy||!evidenceHistory.length;
 $('resolve-help').textContent=busy?'A request is in progress. Wait for it to finish.':!scanner?'Load a batch first.':!scanner.candidates?.length?'This batch has no candidates. Load a current batch with eligible research contracts.':'Ready to match exact contracts and fetch their first quotes.';
 $('export-help').textContent=busy?'Wait for the current request to finish.':evidenceHistory.length?'Ready to export captured observations, including failed quote checks.':'Fetch quotes before exporting observations.';
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
 for(const row of rows.filter(r=>!$('verified-only').checked||r.status==='QUOTE_CHECK_PASSED'&&r.premium_status==='WITHIN_LIMIT')){const tr=document.createElement('tr');for(const value of [row.contract,row.bid===undefined?'Unknown':`${row.bid} / ${row.ask}`,Number.isFinite(row.age_seconds)?row.age_seconds.toFixed(1):'Unknown',row.premium_status,quoteGuidance(row)]){const td=document.createElement('td');td.textContent=value;td.setAttribute?.('data-label',['Contract','Bid / ask','Age (seconds)','$0.30 live ask','Quote check'][tr.children.length]);tr.append(td);}$('rows').append(tr);}
 const matched=rows.some(r=>r.instrument_id);
 $('refresh').disabled=busy||!matched;
 if(!busy&&matched)$('refresh-help').textContent='Ready to refresh manually. Use the validation clock for 5 / 10 / 15-minute captures; there is no automatic polling.';
 return rows;
}
for(const id of ['scanner','research'])$(id).onchange=async e=>{if(busy||id==='scanner'&&!mayReplace())return;try{const f=e.target.files[0];if(!f)return;if(f.size>10000000)throw Error('Maximum file size is 10 MB');const data=JSON.parse(await f.text());if(id==='scanner'){evidenceHistory=[];if(!Array.isArray(data.candidates))throw Error('Expected scanner candidates');candidateQuotes(data,[]);scanner=data;observations=[];scannerSource='Imported file; environment unverified';}else observations=validateRobinhoodPack(data).observations;render();persist();$('status').textContent='Snapshot checks updated. No scanner rankings changed.';}catch(e){if(id==='scanner'){scanner=null;evidenceHistory=[];}else observations=[];render();persist();$('refresh').disabled=true;$('status').textContent=e.message;}};
$('load-scanner').onclick=async()=>{
 if(busy||!mayReplace())return;busy=true;scanner=null;observations=[];evidenceHistory=[];render();
 try{
 const read=async path=>{const r=await fetch(path,{cache:'no-store',credentials:'same-origin'});if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error('Staging snapshot unavailable. Import a JSON snapshot instead.');return r.json();};
 const health=await read('/health');if(health.environment!=='staging')throw Error('This loader requires the staging environment. Import a snapshot instead.');
 const data=await read('/data/candidate-snapshot.json');candidateQuotes(data,[]);
 if(!Number.isFinite(Date.parse(data.generated_at)))throw Error('Snapshot generation timestamp is missing or invalid.');
 scanner=data;scannerSource='Staging · same-origin scanner data';$('status').textContent='Staging snapshot loaded. Review its generation time before using candidates.';
 }catch(e){$('status').textContent=e.message;}finally{busy=false;persist();render();}
};
$('load-current').onclick=async()=>{
 if(busy||!mayReplace())return;busy=true;scanner=null;observations=[];evidenceHistory=[];render();$('status').textContent='Loading current scanner candidates…';
 try{const d=await readPrivate('candidates');candidateQuotes(d.snapshot,[]);if(!Number.isFinite(Date.parse(d.snapshot.generated_at)))throw Error('Invalid scanner timestamp');scanner=d.snapshot;scannerSource='Production · private current scanner batch';$('status').textContent=`Loaded ${scanner.included_contracts} contracts from ${scanner.qualifying_contracts} passing research screens and ask <= $0.30. At most two per ticker. Review scan age; prices are not live.${scanner.included_contracts===0?' No candidates passed; no fallback to unscreened contracts.':''}`;}catch(e){$('status').textContent=failure(e);}finally{busy=false;persist();render();}
};
$('load-validation').onclick=async()=>{
 if(busy||!mayReplace())return;busy=true;scanner=null;observations=[];evidenceHistory=[];render();
 try{const r=await fetch('/data/staging-shadow-evidence-latest.json',{cache:'no-store',credentials:'same-origin'});if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error('Staging evidence unavailable. Open the review queue to check the staging scan.');
 scanner=scannerFromEvidencePacket(await r.json());scannerSource='STAGING VALIDATION · frozen evidence packet';$('status').textContent=`Loaded ${scanner.included_contracts} staging contracts. Packet captured ${scanner.captured_at}; session ${scanner.market_session||'unknown'}. Require a fresh OPEN-session packet for validation. Match contracts and fetch live quotes next.`;
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
 $('clear-session').onclick=()=>{if(busy||!mayReplace())return;scanner=null;observations=[];evidenceHistory=[];persist();render();$('status').textContent='Session cleared in this tab. Exported files are unchanged.';};
 render();
setInterval(render,1000);
$('export-evidence').onclick=()=>{
 if(busy||!evidenceHistory.length)return;
 const blob=new Blob([JSON.stringify(quoteEvidenceInput(scanner,evidenceHistory),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='private-quote-outcomes.json';a.click();URL.revokeObjectURL(url);
 $('status').textContent='Private quote observations exported. Run the offline outcome tool to evaluate available windows. Refresh manually to collect later observations.';
};




