import {requestJSON} from './private-request.js';
import {candidateQuotes} from './candidate-quotes.js';
export const PRIVATE_DASHBOARD='https://0dte-options-command-center.h69htk56cq.workers.dev/dashboard_liquid.html?v=20261119-private-quotes';
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function optionIdentity(raw){
 if(!raw||typeof raw.ticker!=='string'||! /^[A-Z][A-Z0-9.-]{0,9}$/.test(raw.ticker)||typeof raw.contract_id!=='string'||!raw.contract_id||raw.contract_id.length>100||!['call','put'].includes(raw.side)||!Number.isFinite(Number(raw.strike))||Number(raw.strike)<=0||typeof raw.expiry!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(raw.expiry))throw Error('Select an exact option contract first.');
 const date=new Date(raw.expiry+'T00:00:00Z');if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==raw.expiry)throw Error('Invalid option expiration.');
 return {ticker:raw.ticker,contract_id:raw.contract_id,side:raw.side,strike:Number(raw.strike),expiry:raw.expiry};
}
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
export function attachDashboardOptionQuotes({board,privateOrigin=location.origin==='https://0dte-options-command-center.h69htk56cq.workers.dev',read=requestJSON}){
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const panel=document.createElement('section');panel.id='privateOptionQuote';panel.className='panel';panel.hidden=true;board.before(panel);
 let selected=null,record=null,busy=false,inFlight=false,generation=0,error='',refreshButton;
 const money=x=>x===null?'Unknown':'$'+x.toFixed(3);
 function render(){
  if(!selected)return;
  const view=optionQuoteView(record),label=[selected.ticker,selected.expiry,selected.strike,selected.side.toUpperCase()].join(' · ');
  panel.hidden=false;
  panel.innerHTML=`<h3>Private Robinhood option quote</h3><p><b>${escape(label)}</b><br><small>${escape(selected.contract_id)}</small></p><p role="status" data-quote-status>${escape(busy?'Checking exact contract and fetching quote…':error||view?.status||'Ready to request a quote.')}</p>${view?`<table><caption>Premium per share · provider observation</caption><thead><tr><th>Bid</th><th>Ask</th><th>Midpoint</th></tr></thead><tbody><tr><td>${money(view.bid)}</td><td>${money(view.ask)}</td><td>${money(view.midpoint)}</td></tr></tbody></table><p class="smallnote">Provider time ${escape(view.observed_at||'unknown')} · age <span data-quote-age>${view.age_seconds===null?'unknown':Math.floor(view.age_seconds)+'s'}</span><br>Received ${escape(view.received_at||'unknown')}. ${escape(view.reasons.join(' · '))}</p>`:''}<p class="smallnote">Quotes stay in this private tab. Journal entries saved on GitHub Pages remain there; they are not automatically copied here. Manual refresh only. Fresh means a provider timestamp within 60 seconds and passing quote checks; it does not establish streaming prices, exchange latency, market-open status, scanner eligibility, or a guaranteed fill. Midpoint is arithmetic, not an executable price. Research prices and your recorded fill remain separate.</p>`;
  refreshButton=document.createElement('button');refreshButton.type='button';refreshButton.textContent='Refresh Robinhood quote';refreshButton.disabled=busy;refreshButton.onclick=refresh;panel.append(refreshButton);
  const close=document.createElement('button');close.type='button';close.textContent='Close quote';close.onclick=()=>{generation++;selected=null;record=null;busy=false;error='';panel.hidden=true;};panel.append(close);
  const connection=document.createElement('a');connection.href='candidate-quotes.html';connection.textContent='Robinhood connection and quote diagnostics';panel.append(connection);
 }
 async function refresh(){
  if(inFlight||!selected||!privateOrigin)return;
  inFlight=true;busy=true;error='';record=null;const version=++generation,contract=selected;render();
  try{const result=await fetchOptionQuote(contract,(...args)=>{if(version!==generation)throw Error('Quote selection changed.');return read(...args);});if(version===generation)record=result;}
  catch(e){if(version===generation)error=e.message||'Private quote unavailable. Retry when ready.';}
  finally{inFlight=false;if(version===generation){busy=false;render();}}
 }
 function select(raw){if(inFlight)return;selected=optionIdentity(raw);generation++;busy=false;record=null;error='';render();panel.scrollIntoView({block:'center'});}
 function addControls(){
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
 const timer=setInterval(()=>{if(selected&&record&&!busy&&!document.hidden){const view=optionQuoteView(record);panel.querySelector('[data-quote-status]').textContent=view.status;panel.querySelector('[data-quote-age]').textContent=view.age_seconds===null?'unknown':Math.floor(view.age_seconds)+'s';}},1000);
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 return {select,refresh,getState:()=>({selected,record,busy,error})};
}
