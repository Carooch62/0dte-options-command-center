import {validationSample,validationReport} from './dashboard-quote-validation.js';
import {attachPositionPlanControls} from './dashboard-position-plans.js';
import {QuotePoller,quoteSessionOpen} from './quote-poller.js';
import {requestJSON} from './private-request.js';
import {candidateQuotes} from './candidate-quotes.js';
export const PRIVATE_DASHBOARD='https://0dte-options-command-center.h69htk56cq.workers.dev/dashboard_liquid.html?v=20261119-auto-exits';
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function optionIdentity(raw){
 if(!raw||typeof raw.ticker!=='string'||! /^[A-Z][A-Z0-9.-]{0,9}$/.test(raw.ticker)||typeof raw.contract_id!=='string'||!raw.contract_id||raw.contract_id.length>100||!['call','put'].includes(raw.side)||!Number.isFinite(Number(raw.strike))||Number(raw.strike)<=0||typeof raw.expiry!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(raw.expiry))throw Error('Select an exact option contract first.');
 const date=new Date(raw.expiry+'T00:00:00Z');if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==raw.expiry)throw Error('Invalid option expiration.');
 return {ticker:raw.ticker,contract_id:raw.contract_id,side:raw.side,strike:Number(raw.strike),expiry:raw.expiry};
}
export function quoteSignInUrl(contract){const back='/dashboard_liquid.html?v=20261119-auto-exits#rh-quote='+encodeURIComponent(JSON.stringify(optionIdentity(contract)));return '/private/plaid/robinhood/sign-in?'+new URLSearchParams({return_to:back});}
export function privateQuoteUrl(raw){return PRIVATE_DASHBOARD+'#rh-quote='+encodeURIComponent(JSON.stringify(optionIdentity(raw)));}
function exactInstrument(c,i){return i&&uuid.test(i.id)&&i.chain_symbol===c.ticker&&i.type===c.side&&i.expiration_date===c.expiry&&Number(i.strike_price)===c.strike;}
export async function fetchOptionQuote(raw,read=requestJSON){
 const contract=optionIdentity(raw),{ticker,side,strike,expiry}=contract;
 const post=body=>({method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'RobinhoodQuotes'},body:JSON.stringify(body)});
 const match=await read('/private/plaid/robinhood/resolve',post({contracts:[{ticker,side,strike,expiry}]}),120000);
 const r=match.results?.[0];
 if(match.results?.length!==1||r?.status!=='EXACT_METADATA_MATCH'||!r.contract||r.contract.ticker!==ticker||r.contract.side!==side||r.contract.expiry!==expiry||Number(r.contract.strike)!==strike||!exactInstrument(contract,r.instrument))throw Error('Exact Robinhood contract match unavailable. No quote accepted.');
 const response=await read('/private/plaid/robinhood/quotes',post({kind:'option',instrument_ids:[r.instrument.id]}),30000);
 if(!Array.isArray(response.observations)||response.observations.length!==1||response.observations[0]?.quote?.instrument_id!==r.instrument.id)throw Error('Missing or mismatched Robinhood quote. Retry when ready.');
 return {contract,observation:{instrument:r.instrument,quote:response.observations[0].quote,received_at:response.received_at},timing:response.request_timing||{}};
}
export function optionQuoteView(record,now=Date.now()){
 if(!record)return null;
 const row=candidateQuotes({candidates:[{ticker:record.contract.ticker,options:[record.contract]}]},[record.observation],now)[0];
 const clock=Date.parse(row.observed_at),receipt=Date.parse(row.received_at);
 const clockValid=Number.isFinite(clock)&&Number.isFinite(receipt)&&clock<=receipt&&receipt<=now;
 const age=clockValid?(now-clock)/1000:null;
 const identityValid=!row.reasons.some(r=>['QUOTE_ID_MISMATCH','AMBIGUOUS_CONTRACT','NO_CONTRACT_MATCH','CONFLICTING_QUOTE_OBSERVATIONS'].includes(r));
 const bid=identityValid&&Number.isFinite(row.bid)?row.bid:null,ask=identityValid&&Number.isFinite(row.ask)?row.ask:null;
 return {bid,ask,midpoint:bid!==null&&ask!==null?(bid+ask)/2:null,age_seconds:age,observed_at:row.observed_at,received_at:row.received_at,
  status:!clockValid?'UNKNOWN QUOTE TIME':age>60?'STALE QUOTE':row.status==='QUOTE_CHECK_PASSED'?'FRESH QUOTE · CHECKS PASSED':'QUOTE REQUIRES REVIEW',reasons:row.reasons};
}
export function matchingQuoteFills(contract,trades){return (Array.isArray(trades)?trades:[]).filter(t=>t&&t.exit==null&&t.ticker===contract.ticker&&t.contract===contract.contract_id&&t.expiry===contract.expiry&&typeof t.entry==='number'&&Number.isFinite(t.entry)&&t.entry>0).slice(0,20);}
export function attachDashboardOptionQuotes({board,getTrades=()=>[],getSnapshot=()=>null,journal=document.getElementById('journal'),privateOrigin=location.origin==='https://0dte-options-command-center.h69htk56cq.workers.dev',read=requestJSON}){
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const panel=document.createElement('section');panel.id='privateOptionQuote';panel.className='panel';panel.style.overflowWrap='anywhere';panel.hidden=true;board.before(panel);
 let validation=[],selected=null,record=null,busy=false,inFlight=false,generation=0,error='',errorCode='',refreshButton,metrics={requests:0,successful:0,fresh:0,last_ms:null};
 const poller=new QuotePoller({run:()=>refresh(true),allowed:()=>!!selected&&!inFlight&&!document.hidden&&quoteSessionOpen(getSnapshot())&&!(record&&optionQuoteView(record).reasons.includes('DEADLINE_UNKNOWN_OR_PASSED')),onChange:()=>renderAutoStatus()});
 function renderAutoStatus(){const evidence=panel.querySelector('[data-validation-summary]');if(evidence){const report=validationReport(validation);evidence.textContent=`${report.passing_open_quotes} passing OPEN quotes · request p50 ${report.request_p50_ms??'unknown'} ms / p95 ${report.request_p95_ms??'unknown'} ms · 5/10/15-minute windows ${report.windows.filter(w=>w.status==='OBSERVED').length}/3. Token renewal and Discord receipt need separate verification.`;}const node=panel.querySelector('[data-auto-status]');if(node)node.textContent=`Auto-refresh ${poller.enabled?'ON':'OFF'} · ${Math.round(poller.interval*Math.min(16,2**poller.failures)/1000)}s after completion. ${document.hidden?'Paused while hidden. ':!quoteSessionOpen(getSnapshot())?'Waiting for a current OPEN-session snapshot. ':''}${metrics.successful}/${metrics.requests} successful responses · ${metrics.fresh} fresh checks · last request ${metrics.last_ms===null?'unknown':(metrics.last_ms/1000).toFixed(1)+'s'}. Safari must remain open; this is polling.`;const toggle=panel.querySelector('[data-quote-auto]');if(toggle){toggle.checked=poller.enabled;toggle.disabled=busy||(!poller.enabled&&(!record||optionQuoteView(record).status!=='FRESH QUOTE · CHECKS PASSED'||!quoteSessionOpen(getSnapshot())));}}
 const positionPlans=attachPositionPlanControls({panel,journal,getTrades,getContract:()=>selected,privateOrigin,read});
 const money=x=>typeof x!=='number'||!Number.isFinite(x)?'Unknown':'$'+x.toFixed(3);
 function fillHtml(){const fills=matchingQuoteFills(selected,getTrades());return fills.length?'<h4>Matching local open fills</h4>'+fills.map(t=>`<p>Recorded entry ${money(t.entry)} · quantity ${escape(t.qty)} · opened ${escape(t.time)}<br>Saved loss-review ${money(t.lossReview)} · profit-review ${money(t.target)}. Compare with the observed bid above; quotes do not change your saved plan.</p>`).join(''):'<p class="smallnote">No matching open fills in this private site’s journal.</p>';}

 function render(){
  if(!selected)return;
  const view=optionQuoteView(record),label=[selected.ticker,selected.expiry,selected.strike,selected.side.toUpperCase()].join(' · ');
  panel.hidden=false;
  panel.innerHTML=`<h3>Private Robinhood option quote</h3><p><b>${escape(label)}</b><br><small>${escape(selected.contract_id)}</small></p><p role="status" data-quote-status>${escape(busy?'Checking exact contract and fetching quote…':error||view?.status||'Ready to request a quote.')}</p>${view?`<table><caption>Premium per share · provider observation</caption><thead><tr><th>Bid</th><th>Ask</th><th>Midpoint</th></tr></thead><tbody><tr><td>${money(view.bid)}</td><td>${money(view.ask)}</td><td>${money(view.midpoint)}</td></tr></tbody></table><p class="smallnote">Provider time ${escape(view.observed_at||'unknown')} · age <span data-quote-age>${view.age_seconds===null?'unknown':Math.floor(view.age_seconds)+'s'}</span><br>Received ${escape(view.received_at||'unknown')}. ${escape(view.reasons.join(' · '))}</p>`:''}<div data-quote-fills>${fillHtml()}</div><details><summary>Quote privacy and limitations</summary><p class="smallnote">The quote display stays in this private tab; reviewed exit plans can be stored privately on the server. Journal entries saved on GitHub Pages remain there; they are not automatically copied here. Optional auto-refresh polls only while this tab is visible and a current OPEN-session snapshot is available. Fresh means a provider timestamp within 60 seconds and passing quote checks; it does not establish streaming prices, exchange latency, market-open status, scanner eligibility, or a guaranteed fill. Midpoint is arithmetic, not an executable price. Research prices and your recorded fill remain separate.</p></details>`;
  refreshButton=document.createElement('button');refreshButton.type='button';refreshButton.textContent='Refresh Robinhood quote';refreshButton.disabled=busy;refreshButton.onclick=()=>void refresh();panel.insertBefore(refreshButton,panel.querySelector('[data-quote-fills]'));
  if(['SIGN_IN','ACCESS_DENIED'].includes(errorCode)){const signIn=document.createElement('a');signIn.href=quoteSignInUrl(selected);signIn.target='_blank';signIn.rel='noopener';signIn.className='broker-link';signIn.textContent='Sign in to private quotes';panel.insertBefore(signIn,refreshButton);const help=document.createElement('p');help.className='smallnote';help.textContent='Complete private website sign-in in the new tab, then return here and refresh. This does not disconnect Robinhood or replace its authorization.';panel.insertBefore(help,refreshButton);}
  const close=document.createElement('button');close.type='button';close.textContent='Close quote';close.onclick=()=>{poller.enable(false);generation++;selected=null;record=null;busy=false;error='';errorCode='';panel.hidden=true;};panel.insertBefore(close,panel.querySelector('[data-quote-fills]'));
  const auto=document.createElement('label');auto.innerHTML='<input type="checkbox" data-quote-auto> Auto-refresh selected quote';auto.querySelector('input').onchange=e=>{poller.enable(e.target.checked);renderAutoStatus();};panel.insertBefore(auto,panel.querySelector('[data-quote-fills]'));const schedule=document.createElement('p');schedule.className='smallnote';schedule.dataset.autoStatus='';panel.insertBefore(schedule,panel.querySelector('[data-quote-fills]'));renderAutoStatus();
  const evidence=document.createElement('details');evidence.innerHTML='<summary>Private quote validation</summary><p class="smallnote" data-validation-summary></p><p class="smallnote">Keep this Safari tab open for the 5/10/15-minute quote checks. Export before leaving. This session keeps at most 500 request samples in memory; choosing a different contract starts a new capture.</p>';const download=document.createElement('button');download.type='button';download.textContent='Export private quote validation';download.disabled=busy||!validation.length;download.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({...validationReport(validation),contract:selected},null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='private-quote-validation.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};evidence.append(download);panel.append(evidence);renderAutoStatus();
  const connection=document.createElement('a');connection.href='candidate-quotes.html';connection.textContent='Robinhood connection and quote diagnostics';panel.append(connection);positionPlans.render();
 }
 async function refresh(automatic=false){
  if(inFlight||!selected||!privateOrigin)return {ok:false,code:'BUSY'};
  inFlight=true;busy=true;error='';errorCode='';record=null;const version=++generation,contract=selected,started=performance.now();metrics.requests++;render();let outcome={ok:false};
  try{const result=await fetchOptionQuote(contract,(...args)=>{if(version!==generation)throw Error('Quote selection changed.');return read(...args);});if(version===generation){record=result;metrics.successful++;if(optionQuoteView(record).status==='FRESH QUOTE · CHECKS PASSED')metrics.fresh++;outcome={ok:optionQuoteView(record).status==='FRESH QUOTE · CHECKS PASSED'};if(optionQuoteView(record).reasons.includes('DEADLINE_UNKNOWN_OR_PASSED'))outcome.code='EXPIRED';}}
  catch(e){if(version===generation){errorCode=e.code||'';outcome={ok:false,code:errorCode};error=errorCode==='SIGN_IN'?'Private website sign-in required. Sign in below, then refresh this quote. Robinhood authorization has not been checked.':e.message||'Private quote unavailable. Retry when ready.';}}
  finally{inFlight=false;if(version===generation){metrics.last_ms=performance.now()-started;validation.push(validationSample({view:optionQuoteView(record),snapshot:getSnapshot(),duration_ms:metrics.last_ms,error_code:errorCode}));validation=validation.slice(-500);busy=false;render();if(!automatic){if(['SIGN_IN','ACCESS_DENIED','AUTHORIZATION','SETUP','EXPIRED'].includes(outcome.code))poller.enable(false);else poller.postpone();}}}
  return outcome;
 }
 function select(raw){if(inFlight)return;poller.enable(false);validation=[];metrics={requests:0,successful:0,fresh:0,last_ms:null};selected=optionIdentity(raw);generation++;busy=false;record=null;error='';errorCode='';render();panel.scrollIntoView({block:'center'});}
 function addControls(){
  if(privateOrigin)for(const article of board.querySelectorAll('article.candidate')){
   if(article.querySelector('[data-discover-option]'))continue;
   const ticker=article.querySelector('[data-star]')?.dataset.star;
   if(!ticker)continue;
   const button=document.createElement('button');button.type='button';button.dataset.discoverOption=ticker;button.textContent='Verify call / put with Robinhood';
   const result=document.createElement('p');result.className='smallnote';result.setAttribute('role','status');
   button.onclick=async()=>{
    button.disabled=true;result.textContent='Checking current stock setup, complete expiration and nearby Robinhood contracts…';
    try{
     const data=await read('/private/plaid/robinhood/discover',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'RobinhoodQuotes'},body:JSON.stringify({ticker})},120000);
     if(data.status==='VERIFIED_WATCH'&&data.best){const b=data.best;result.textContent=`Best verified watch among ${data.checked} checked (${data.near_atm} nearby): ${ticker} ${b.expiry} $${b.strike} ${b.side.toUpperCase()} · ask $${b.ask.toFixed(2)} · delta ${b.delta.toFixed(2)} · spread ${b.spread_pct.toFixed(1)}% · volume ${b.volume} · quote ${b.quote_updated_at}. Check the current quote and remaining risk filters before trading. ${data.limitation}`;}
     else result.textContent=`No verified contract: ${data.reason||data.status||'unknown'}. ${data.checked??0} checked${data.expiry?' for '+data.expiry:''}.`;
    }catch(e){result.textContent=e.message||'Robinhood verification unavailable.';}finally{button.disabled=false;}
   };
   article.append(button,result);
  }
  for(const source of board.querySelectorAll('.purchase-action [data-record-fill],button[data-watch]')){
   if(source.parentElement.querySelector('[data-rh-quote]'))continue;
   let contract;try{contract=optionIdentity(JSON.parse(decodeURIComponent(source.dataset.recordFill||source.dataset.watch)));}catch{continue;}
   const control=document.createElement(privateOrigin?'button':'a');control.dataset.rhQuote=encodeURIComponent(JSON.stringify(contract));
   control.textContent=privateOrigin?'Check Robinhood quote':'Open private Robinhood quote';
   if(privateOrigin){control.type='button';control.onclick=()=>{if(inFlight)return;select(contract);void refresh();};}
   else{control.href=privateQuoteUrl(contract);control.target='_blank';control.rel='noopener';control.className='broker-link';}
   source.after(control);
  }
 }
 new MutationObserver(addControls).observe(board,{childList:true,subtree:true});addControls();
 if(privateOrigin&&location.hash.startsWith('#rh-quote=')&&location.hash.length<2000){try{select(JSON.parse(decodeURIComponent(location.hash.slice(10))));}catch{/* invalid handoff never makes a request */}}
 const timer=setInterval(()=>{if(selected&&record&&!busy&&!document.hidden){const view=optionQuoteView(record);if(view.reasons.includes('DEADLINE_UNKNOWN_OR_PASSED')&&poller.enabled)poller.enable(false);renderAutoStatus();panel.querySelector('[data-quote-status]').textContent=view.status;panel.querySelector('[data-quote-age]').textContent=view.age_seconds===null?'unknown':Math.floor(view.age_seconds)+'s';const fills=panel.querySelector('[data-quote-fills]'),html=fillHtml();if(fills.innerHTML!==html)fills.innerHTML=html;}},1000);
 document.addEventListener('visibilitychange',()=>{poller.postpone();renderAutoStatus();});
 window.addEventListener('pagehide',()=>{poller.enable(false);clearInterval(timer);},{once:true});
 return {select,refresh,getState:()=>({selected,record,busy,error,metrics,auto:poller.enabled})};
}
