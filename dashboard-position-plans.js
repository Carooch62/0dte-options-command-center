import {requestJSON} from './private-request.js';
const path='/private/plaid/robinhood/position-plans';
export async function positionSourceFingerprint(t){const value=JSON.stringify([t.ticker,t.contract,t.expiry,t.entry,t.qty,t.time,t.lossReview??null,t.target??null]);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function attachPositionPlanControls({panel,journal,getTrades,getContract,privateOrigin,read=requestJSON}){
 let plans=[],loaded=false,working=false,message='',previous=new Set(getTrades().map(t=>t.id)),syncing=false,syncError='',box=null,renderedContract='',testId=null;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const syncNotice=document.createElement('p');syncNotice.className='smallnote';journal.before(syncNotice);
 let known=new Set();try{known=new Set(JSON.parse(localStorage.getItem('0dtePrivatePositionIds')||'[]'));}catch{}
 const remember=()=>{try{localStorage.setItem('0dtePrivatePositionIds',JSON.stringify([...known]));}catch{}};
 let lastLocal=JSON.stringify(getTrades());
 const post=(url,body)=>read(url,{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'RobinhoodQuotes'},body:JSON.stringify(body)});
 const matches=(t,c)=>t.exit==null&&t.ticker===c?.ticker&&t.contract===c?.contract_id&&t.expiry===c?.expiry;
 async function pause(p){const r=await post(path+'/pause',{id:p.id,expected_revision:p.revision});if(r.plan)plans=plans.map(x=>x.id===p.id?r.plan:x);known.delete(p.id);remember();}
 async function sync(){
  if(!privateOrigin||syncing)return;const local=JSON.stringify(getTrades());if(!loaded&&!known.size){lastLocal=local;return;}syncing=true;syncError='';let changed=false;
  try{if(!loaded){const r=await read(path);plans=r.plans;loaded=true;}const trades=getTrades();for(const p of plans.filter(p=>p.active)){
   const t=trades.find(t=>t.id===p.id);
   if(t?.exit!=null||!t&&(previous.has(p.id)||known.has(p.id))||t&&await positionSourceFingerprint(t)!==p.source_fingerprint){await pause(p);changed=true;message='A closed, deleted or edited local fill paused its private monitor. Review the plan before enabling it again.';}
  }previous=new Set(trades.map(t=>t.id));lastLocal=local;}
  catch{changed=true;message=syncError='Private pause could not be confirmed. The server may still monitor its saved plan. Reload private plans and use Pause before relying on cancellation.';}
  finally{syncing=false;if(changed){syncNotice.textContent=message;render();}}
 }
 function render(force=true){
  if(!privateOrigin||!getContract())return;
  const identity=JSON.stringify(getContract());if(!force&&box&&identity===renderedContract){if(!box.isConnected)panel.append(box);return;}
  const wasOpen=box?.open===true;box?.remove();box=document.createElement('details');box.open=wasOpen;renderedContract=identity;box.dataset.positionMonitor='';box.innerHTML='<summary>Private background exit plans · five-minute checks</summary>';panel.append(box);
  const note=document.createElement('p');note.className='smallnote';note.textContent='Explicitly confirm an actual fill and chosen levels before enabling alerts. At most three active plans. Polling can miss brief crossings. Alerts request a review in Robinhood; no orders are placed. Pausing/closing cancels future checks; a delivery already in flight can still arrive. Private prices and Greeks are omitted from Discord.';box.append(note);
  const status=document.createElement('p');status.setAttribute('role','status');status.textContent=message;box.append(status);
  const load=document.createElement('button');load.type='button';load.textContent='Load private exit plans';load.disabled=working;load.onclick=async()=>{working=true;render();try{const r=await read(path);plans=r.plans;testId=r.delivery_test_id;loaded=true;for(const p of plans)if(p.active&&getTrades().some(t=>t.id===p.id))known.add(p.id);remember();message=`Private plans loaded. Discord ${r.discord_configured?'configured':'not configured'} · background checks ${r.enabled?'available':'disabled'}. Last check: ${r.last_check?.at||'none'} · ${r.last_check?.status||'unknown'} · messages sent ${r.last_check?.sent??0} · verified quotes ${r.last_check?.quotes_verified??0}/${r.last_check?.positions_checked??0}${r.last_check?.retry_at?' · retry after '+r.last_check.retry_at:''}${r.last_check?.delivery_states?.some(s=>s!=='SENT')?' · A delivery failed or is unconfirmed; check Discord before enabling a new revision.':''}`;await sync();}catch(e){message=e.message;}finally{working=false;render();}};box.append(load);
  if(!loaded)return;
  const test=document.createElement('button');test.type='button';test.textContent='Send TEST ONLY exit notification';test.disabled=working;test.onclick=async()=>{working=true;try{const result=await post(path+'/test',{});testId=result.test_id;message='TEST ONLY was accepted. Confirm receiving it in your private Discord channel before enabling a position.';}catch(e){message=e.message;}finally{working=false;render();}};box.append(test);
  const exportButton=document.createElement('button');exportButton.type='button';exportButton.textContent='Export private exit plans';exportButton.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({format:'private-position-plans-v1',exported_at:new Date().toISOString(),plans},null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='private-exit-plans.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};box.append(exportButton);
  for(const p of plans){const item=document.createElement('p');item.textContent=`${p.contract.ticker} ${p.contract.expiry} ${p.contract.strike} ${p.contract.side} · ${p.active?'ENABLED':'PAUSED'} · revision ${p.revision}${p.pause_reason?' · '+p.pause_reason:''}`;if(p.active){const button=document.createElement('button');button.type='button';button.textContent='Pause '+p.contract.ticker+' exit plan';button.disabled=working;button.onclick=async()=>{working=true;try{await pause(p);message='Private monitor paused.';}catch(e){message=e.message;}finally{working=false;render();}};item.append(button);}box.append(item);}
  for(const t of getTrades().filter(t=>matches(t,getContract()))){
   const old=plans.find(p=>p.id===t.id),form=document.createElement('form');form.innerHTML=`<p><b>Review actual fill: ${esc(t.contract)}</b><br>Paid $${esc(t.entry)} per share · ${esc(t.qty)} contract(s) · ${esc(t.time)}</p><label>Loss-review bid <input name="loss" type="number" min="0.01" step="0.01" required value="${esc(old?.loss??t.lossReview??'')}"></label><label>Profit-review bid <input name="profit" type="number" min="0.01" step="0.01" required value="${esc(old?.profit??t.target??'')}"></label><p><label><input name="confirmed" type="checkbox" required> I confirm this actual fill and have reviewed these exit levels.</label></p><p><label><input name="delivery" type="checkbox"> I received the TEST ONLY message in my private Discord channel.</label></p><p><label><input name="active" type="checkbox"> Enable private Discord checkpoint alerts for this plan.</label></p><button type="submit">Save reviewed private exit plan</button>`;
   form.querySelector('[name=active]').checked=old?.active===true;form.querySelector('button').disabled=working;
   form.onsubmit=async e=>{e.preventDefault();if(working||!form.reportValidity())return;working=true;const delivery_confirmed=form.elements.delivery.checked;if(form.elements.active.checked&&(!testId||!delivery_confirmed)){working=false;message='Send TEST ONLY and confirm receipt before enabling alerts.';render();return;}const c=getContract(),loss=Number(form.elements.loss.value),profit=Number(form.elements.profit.value),active=form.elements.active.checked;
    try{const current=getTrades().find(x=>x.id===t.id);if(!current||JSON.stringify(current)!==JSON.stringify(t))throw Error('Fill changed; reload before saving.');const source_fingerprint=await positionSourceFingerprint(t);const r=await post(path,{delivery_confirmed,delivery_test_id:testId,expected_revision:old?.revision||0,plan:{id:t.id,contract:c,entry:t.entry,quantity:t.qty,entered_at:t.time,loss,profit,confirmed:true,active,source_fingerprint}});plans=plans.filter(p=>p.id!==t.id);plans.push(r.plan);if(active)known.add(t.id);else known.delete(t.id);remember();await sync();message=syncError|| (active&&plans.find(p=>p.id===t.id)?.active?'Private plan enabled. Background checks run every five minutes while the exchange session can be verified.':'Private plan saved paused.');}catch(e){message=e.message;}finally{working=false;render();}
   };box.append(form);
  }
 }
 new MutationObserver(()=>{if(JSON.stringify(getTrades())!==lastLocal)void sync();}).observe(journal,{childList:true});
 if(privateOrigin&&known.size)void sync();
 return {render:()=>render(false)};
}
