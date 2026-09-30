import {refreshProgress,publishedReceipt} from './refresh-progress.js';
import {finite,minutes,snapshotUsable,dataStatus,recordedState,matchesState,robinhoodStockUrl,contractExplanation,contractRank,displayState,selectableContracts,tradePL,validTrade,riskSummary} from './dashboard-logic.js';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const API='https://0dte-options-command-center.h69htk56cq.workers.dev';
const DATA=location.hostname==='localhost'||location.hostname==='127.0.0.1'?'./data/':'https://raw.githubusercontent.com/Carooch62/0dte-options-command-center/main/data/';
let data=null,previous=null,auto=true,timer,loadPromise=null,active=null,polling=false,dataDownloadFailed=false,lastRefresh=null;
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{$('journalNotice').textContent='Browser storage unavailable. Export your backup before leaving.';return false;}}
const oldTrades=read('0dteJournal',[]);
let trades=(Array.isArray(oldTrades)?oldTrades:[]).map(t=>({...t,id:t.id||crypto.randomUUID(),exit:t.exit??null,fees:t.fees||0})).filter(validTrade);
save('0dteJournal',trades);
let settings=read('0dteRisk',{}),stars=read('0dteStars',[]);
if(!Array.isArray(stars))stars=[];
const money=n=>finite(n)===null?'—':'$'+Number(n).toFixed(2),value=(n,d=2)=>finite(n)===null?'—':Number(n).toFixed(d),time=ts=>ts&&Number.isFinite(new Date(ts).getTime())?new Date(ts).toLocaleString():'Unknown';
function notice(id,text,kind='warn'){$(id).innerHTML=`<div class="notice ${kind}">${esc(text)}</div>`;}
async function json(url,timeout=20000){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(timeout)});if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();}
function movePercent(v){const n=finite(v);return `<span class="move ${n>0?'up':n<0?'down':''}">${n===null?'—':(n>0?'+':'')+value(n)+'%'}</span>`;}
function stockLink(ticker){const url=robinhoodStockUrl(ticker);return url?`<a class="broker-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open ${esc(ticker)} in Robinhood ↗</a>`:'';}
function contract(o,ticker){return `<div class="contract"><b>${esc(o.expiry)} ${esc(o.side?.toUpperCase())} ${money(o.strike)} — ask ${money(o.ask)}</b><div class="smallnote">Bid ${money(o.bid)} · spread ${value(o.spread_pct,1)}% · Δ ${value(o.delta)} · Γ ${value(o.gamma,4)} · volume ${value(o.volume,0)} · OI ${value(o.oi,0)}<br>${esc(o.source)} · ${esc(o.quote_freshness||'Unknown quote time')} · ${value(o.distance_pct,1)}% strike distance</div>${stockLink(ticker)}</div>`;}
function stateColor(state){return ({'CONFIRMED DELAYED':'green',TRIGGERED:'yellow','SECOND-WAVE':'purple',WATCH:'blue',DECAYING:'orange',PASS:'gray','STALE PRICE DATA':'orange','STALE SCAN':'orange','MARKET CLOSED':'gray','DATA UNAVAILABLE':'red'})[state]||'gray';}
function card(x){const state=recordedState(x),freshness=dataStatus(x,dataDownloadFailed?{...data,generated_at:null}:data),opts=selectableContracts(x,Number($('askMin').value),Number($('askMax').value)),levels=x.key_levels||{};
const links=(x.news_items||[]).slice(0,2).map(n=>{let safe=false;try{safe=['http:','https:'].includes(new URL(n.url).protocol);}catch{}return safe?`<a target="_blank" rel="noopener" href="${esc(n.url)}">${esc(n.title)}</a>`:esc(n.title);}).join('<br>');
return `<article class="candidate ${!!dataStatus(x,dataDownloadFailed?{...data,generated_at:null}:data)?'stale':''}"><div class="row"><div class="row"><button class="star" data-star="${esc(x.ticker)}" aria-label="Star ${esc(x.ticker)}">${stars.includes(x.ticker)?'★':'☆'}</button><b class="ticker">${esc(x.ticker)}</b></div><div class="candidate-status"><span class="tag ${stateColor(state)}">${esc(state)}</span>${freshness?`<span class="tag ${stateColor(freshness.state)} freshness-tag">${esc(freshness.state)}</span><small>Last scan status · ${esc(time(data.generated_at))}</small>`:''}</div></div>${dataStatus(x,dataDownloadFailed?{...data,generated_at:null}:data)?`<p class="smallnote">${esc(dataStatus(x,dataDownloadFailed?{...data,generated_at:null}:data).detail)}</p>`:''}<div class="row"><strong class="price">${money(x.price)}</strong><span>${esc(x.direction)} · day ${movePercent(x.day_move)} · from open ${movePercent(x.open_move)}</span></div><div class="metrics"><div class="metric"><small>5 MIN</small><b>${movePercent(x.move_5m)}</b></div><div class="metric"><small>15 MIN</small><b>${movePercent(x.recent_move)}</b></div><div class="metric"><small>VOL BURST</small><b>${value(x.volume_ratio)}×</b></div><div class="metric"><small>ACCEL</small><b>${value(x.volume_acceleration)}×</b></div><div class="metric"><small>SCORE</small><b>${value(x.score,1)}</b></div></div><div class="smallnote">${esc(x.catalyst_level)} catalyst · ${esc(x.momentum_state)} · chase ${esc(x.chase_risk)}<br>Call/put volume balance: ${esc(x.volume_balance||'UNKNOWN')} · core ETF context ${esc(x.market_alignment||'UNKNOWN')}</div><div class="news">${links||'No company-specific headline confirmed.'}</div><div class="levels"><div class="level"><small>TRIGGER</small><b>${money(x.trigger_price)}</b></div><div class="level"><small>INVALIDATION</small><b>${money(x.invalidation_price)}</b></div><div class="level"><small>VWAP</small><b>${money(x.vwap)}</b></div><div class="level"><small>EXTENSION 1</small><b>${money(levels.target_1)}</b></div><div class="level"><small>EXTENSION 2</small><b>${money(levels.target_2)}</b></div></div><div class="smallnote">${x.second_wave_event?'New development: '+esc(x.second_wave_event)+'<br>':''}Completed bar: ${esc(time(x.bar_end))} · ${x.session_bar_count||0} session bars · ${value(minutes(x.bar_end),1)} min old<br>Options: ${esc(x.chain_status||'UNKNOWN')} · ${opts.length} pass your contract filters</div><details class="details" data-ticker="${esc(x.ticker)}"><summary>Contracts and source details</summary>${opts.length?opts.map(o=>contract(o,x.ticker)).join(''):`<p>${esc(contractExplanation(x,Number($('askMin').value),Number($('askMax').value)))}</p>`}<p class="smallnote">${(x.revisit_contracts||[]).length} eligible contracts above $0.30 retained for revisits.<br>${esc(x.option_source||'Chain not attempted')} · quote time ${esc(x.option_data_freshness||'UNKNOWN')}<br>Bar source: ${esc(x.price_source||'Unknown')}. No gamma minimum is assumed. Missing values remain unavailable.</p></details>${stockLink(x.ticker)}<div class="smallnote">Opens the stock page. Choose Trade, then your option expiration and strike. Your phone may open the app or website.</div></article>`;}
function render(){if(!data)return;
 const age=minutes(data.generated_at),usable=!dataDownloadFailed&&snapshotUsable(data);
 const sessionKnown=Date.now()>=Date.parse(data.session_open_at)&&Date.now()<Date.parse(data.session_close_at);
 $('session').textContent=sessionKnown?'REGULAR SESSION':'OUTSIDE VERIFIED SESSION';
 notice('freshness',`${usable?'Research snapshot':'STALE / RESEARCH ONLY'} · generated ${time(data.generated_at)} · ${age===null?'unknown age':value(age,1)+' min old'}. Options remain delayed; unknown quote times cannot confirm an entry.`,usable?'warn':'bad');
 const all=data.candidates||[],counts={};for(const x of all){const s=displayState(x,dataDownloadFailed?{...data,generated_at:null}:data);counts[s]=(counts[s]||0)+1;}
 const c=data.coverage||{};
 $('stats').innerHTML=[['STOCK ROWS',c.stocks_received??data.scanned_rows??0],['CHAIN ATTEMPTS',c.chains_attempted??'Unknown'],['WITH SAME-DAY CHAIN',c.chains_with_contracts??'Unknown'],['TRIGGERED',counts.TRIGGERED||0],['SECOND-WAVE',counts['SECOND-WAVE']||0],['DELAYED CONFIRMED',counts['CONFIRMED DELAYED']||0]].map(([a,b])=>`<div class="panel stat"><b>${esc(b)}</b><span>${a}</span></div>`).join('');
 $('coverage').textContent=`Universe: ${data.universe_size??'unknown'} · ${c.chains_not_attempted??'unknown'} chains not yet attempted · ${Object.entries(c.chain_status_counts||{}).map(([a,b])=>a+': '+b).join(' · ')}. Broader discovery: ${Object.entries(data.discovery||{}).map(([a,b])=>a+' '+b.status).join(', ')}.`;
 const min=Number($('askMin').value),max=Number($('askMax').value);$('filterNotice').textContent=(!Number.isFinite(min)||!Number.isFinite(max)||min<0||max<min)?'Enter a valid minimum and maximum.':'';
 let rows=all.filter(x=>matchesState(x,dataDownloadFailed?{...data,generated_at:null}:data,$('state').value)&&($('direction').value==='ALL'||x.direction===$('direction').value)&&($('catalyst').value==='ALL'||x.catalyst_level===$('catalyst').value)&&($('onlyContracts').value!=='contracts'||selectableContracts(x,min,max).length)&&($('onlyContracts').value!=='starred'||stars.includes(x.ticker)));
 const order={'CONFIRMED DELAYED':7,TRIGGERED:6,'SECOND-WAVE':5,WATCH:4,DECAYING:3,PASS:2,'STALE PRICE DATA':1,'STALE SCAN':1,'MARKET CLOSED':1,'DATA UNAVAILABLE':0};
 rows.sort((a,b)=>$('sort').value==='score'?(b.score||0)-(a.score||0):$('sort').value==='move'?Math.abs(b.move_5m||0)-Math.abs(a.move_5m||0):(order[displayState(b,dataDownloadFailed?{...data,generated_at:null}:data)]||0)-(order[displayState(a,dataDownloadFailed?{...data,generated_at:null}:data)]||0)||contractRank(b,min,max)-contractRank(a,min,max)||(b.score||0)-(a.score||0));
 const opened=new Set([...$('board').querySelectorAll('details[open]')].map(d=>d.dataset.ticker));
 $('shown').textContent=rows.length+' candidates';$('board').innerHTML=rows.map(card).join('')||'<p class="empty">No candidates match these filters.</p>';
 for(const details of $('board').querySelectorAll('details'))details.open=opened.has(details.dataset.ticker);
 const changes=data.execution_layer?.state_transitions||[];$('changes').innerHTML=changes.length?changes.map(x=>`<div class="change-item"><b>${esc(x.ticker)}</b> ${esc(x.from)} → ${esc(x.to)}</div>`).join(''):'No transitions from a comparable same-session snapshot.';
 const f=data.option_feedback||{};$('feedback').innerHTML=`<p>${f.today_count||0} observations recorded today.</p>`+(f.recent||[]).slice(-5).reverse().map(x=>`<div class="change-item"><b>${esc(x.ticker)} ${esc(x.side)} ${money(x.strike)}</b> · observed ask ${money(x.entry_ask)} · ${esc(time(x.observed_at))}<br>${Object.entries(x.markouts||{}).map(([h,m])=>`${h}m: bid ${money(m.exit_bid)}, gross quote change ${money(m.gross_quote_change_per_contract)} / contract · ${esc(m.interpretation)}`).join('<br>')||'Waiting for a later, changed source snapshot.'}</div>`).join('');
}
function rememberRefresh(r){lastRefresh=r;save('0dteLastRefresh',r);}
function renderRefresh(){
 const r=active||lastRefresh;if(!r){$('scanProgress').innerHTML='<p class="smallnote">Press Refresh scanner to see each live step. Reload displayed data only checks for a newer published snapshot.</p>';return;}
 const steps=refreshProgress({requestStatus:r.requestStatus,run:r.run,published:!!r.receipt});
 const elapsed=Math.max(0,Math.floor(((r.finished||Date.now())-r.started)/1000));
 const label={waiting:'Waiting',active:'In progress',done:'Complete',failed:'Failed'};
 $('scanProgress').innerHTML=`<div class="refresh-steps">${steps.map((s,i)=>`<div class="refresh-step ${s.state}" aria-current="${s.state==='active'?'step':'false'}"><span class="step-status">${s.state==='done'?'✓':s.state==='failed'?'!':i+1} · ${label[s.state]}</span><b>${esc(s.label)}</b><small>${esc(s.detail)}</small></div>`).join('')}</div><div class="refresh-summary smallnote">Requested ${esc(time(r.started))} · ${Math.floor(elapsed/60)}m ${elapsed%60}s${r.run?.url?` · <a href="${esc(r.run.url)}" target="_blank" rel="noopener">View this run</a>`:''}</div>`;
 let message=r.message||'Tracking your refresh request.';
 if(r.receipt){const c=r.receipt.coverage||{};message=`Refresh completed. Published ${time(r.receipt.generated_at)} · ${c.stocks_received??'—'} stock rows · ${c.chains_attempted??'—'} chain checks.${data?.scan_id!==r.id?' Newer results are already displayed.':''}`;}
 notice('scanStatus',message,r.receipt?'ok':r.failed?'bad':'warn');
}
function completeRefresh(r,receipt){
 if(!active||active.id!==r.id)return;
 rememberRefresh({...active,receipt,finished:Date.now(),message:'Refresh completed.'});
 active=null;save('0dteActiveScan',null);enableScan(true);renderRefresh();
}
async function load(manual=false){
 if(loadPromise)return loadPromise;
 loadPromise=(async()=>{try{
   const oldId=data?.scan_id,d=await json(DATA+'market-dashboard.json?v='+Date.now());
   if(data&&d.scan_id!==oldId)previous=data;data=d;dataDownloadFailed=false;render();
   if(manual)notice('dataStatus',`${oldId===d.scan_id?'No newer scan has published.':'Displayed data updated.'} Latest snapshot: ${time(d.generated_at)}.`,oldId===d.scan_id?'warn':'ok');
   const health=await json(DATA+'scan-health.json?v='+Date.now()).catch(()=>null);
   if(health)notice('health',`Last backend result: ${health.status} · ${time(health.updated_at)}${health.error?' · '+health.error:''}`,health.status==='FAILED'?'bad':health.status==='SUCCESS'?'ok':'warn');
   const r=active;
   if(r){
     let receipt=publishedReceipt(data,[],r.id);
     if(!receipt&&r.run?.status==='completed'&&r.run?.conclusion==='success'){
       const receipts=await json(DATA+'scan-receipts.json?v='+Date.now()).catch(()=>[]);
       receipt=publishedReceipt(data,receipts,r.id);
     }
     if(receipt)completeRefresh(r,receipt);
   }
   renderRefresh();
 }catch(e){dataDownloadFailed=true;if(data)render();notice('freshness','Unable to download new results: '+e.message+'. Last displayed snapshot is retained for research.','bad');}
 })();
 try{await loadPromise;}finally{loadPromise=null;}
}
function enableScan(enabled){$('scan').disabled=!enabled;$('wave').disabled=!enabled;}
async function pollRun(){
 if(!active||document.hidden||polling)return;
 polling=true;const id=active.id;
 try{
   await load();if(!active||active.id!==id)return;
   const h=await json(API+'/health?request_id='+encodeURIComponent(id),35000);
   if(!active||active.id!==id)return; // A data download may finish this request while status is in flight.
   const r=h.latestRun;
   if(r){active.run=r;active.requestStatus='accepted';active.message=r.status==='completed'&&r.conclusion==='success'?'Scan finished; checking that its data has published.':`Your scan is ${r.status.replaceAll('_',' ')}.`;
     if(r.status==='completed'&&r.conclusion!=='success'){
       rememberRefresh({...active,failed:true,finished:Date.now(),message:`Scan ${r.conclusion}. The last validated snapshot is preserved.`});
       active=null;save('0dteActiveScan',null);enableScan(true);renderRefresh();return;
     }
   }else active.message=active.requestStatus==='unknown'?'Checking whether GitHub received the request after a connection interruption.':'Request accepted; waiting for GitHub to register this run.';
   save('0dteActiveScan',active);rememberRefresh(active);renderRefresh();
   if(r?.status==='completed'&&r.conclusion==='success')await load();
   if(active&&Date.now()-active.started>20*60000){active.message='This request is taking longer than expected. View its run for details; you can start another scan.';enableScan(true);renderRefresh();}
 }catch(e){if(active&&active.id===id){active.message='Status check interrupted: '+e.message+'. Tracking will retry.';renderRefresh();}}
 finally{polling=false;}
}
async function startScan(mode){
 if(active&&Date.now()-active.started<20*60000)return;
 active={id:crypto.randomUUID(),started:Date.now(),requestStatus:'sending',message:'Sending refresh request…'};
 const id=active.id;save('0dteActiveScan',active);rememberRefresh(active);enableScan(false);renderRefresh();
 let rejected=false;
 try{
   const r=await fetch(API+'/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scan_mode:mode,request_id:id}),signal:AbortSignal.timeout(20000)});
   const j=await r.json();if(!r.ok||!j.ok){rejected=true;throw Error(j.error||'Request failed');}
   if(!active||active.id!==id)return;
   active.requestStatus='accepted';active.message='Accepted. Watching your scan through publication.';save('0dteActiveScan',active);rememberRefresh(active);renderRefresh();await pollRun();
 }catch(e){if(!active||active.id!==id)return;
   if(rejected){rememberRefresh({...active,requestStatus:'failed',failed:true,finished:Date.now(),message:'Scan request failed: '+e.message});active=null;save('0dteActiveScan',null);enableScan(true);}
   else{active.requestStatus='unknown';active.message='Connection interrupted. Checking whether your request was accepted before retrying.';save('0dteActiveScan',active);rememberRefresh(active);}
   renderRefresh();if(active)pollRun();
 }
}
function startTimer(){clearInterval(timer);if(auto&&!document.hidden)timer=setInterval(load,Number($('interval').value));$('auto').textContent='Auto-check '+(auto?'ON':'OFF');}
function renderRisk(){settings=Object.fromEntries(['perTrade','dailyLoss','maxExposure','timeStop','cutoff'].map(id=>[id,id==='cutoff'?$(id).value:finite($(id).value)]));save('0dteRisk',settings);const r=riskSummary(settings,trades,finite($('riskAsk').value),Number($('riskQty').value));$('riskResult').innerHTML=`<p>Proposed premium: <b>${money(r.cost)}</b> · recorded open premiums and fees: ${money(r.exposure)} · today’s realized P/L after entered fees: ${money(r.dayPL)}</p>`+r.alerts.map(a=>`<div class="notice bad">${esc(a)}</div>`).join('');}
function renderJournal(){const closed=trades.filter(t=>t.exit!==null),pnl=closed.reduce((n,t)=>n+tradePL(t),0);$('journal').innerHTML=`<p>${closed.length} closed · ${trades.length-closed.length} open · realized P/L after entered fees ${money(pnl)}</p><table><thead><tr><th>Opened</th><th>Contract</th><th>Entry</th><th>Exit</th><th>Qty</th><th>Fees</th><th>P/L</th><th>Action</th></tr></thead><tbody>${trades.slice(0,100).map(t=>`<tr><td>${esc(time(t.time))}</td><td>${esc(t.ticker)} ${esc(t.contract)}</td><td>${money(t.entry)}</td><td>${money(t.exit)}</td><td>${t.qty}</td><td>${money(t.fees)}</td><td>${t.exit===null?'Open':money(tradePL(t))}</td><td>${t.exit===null?`<button data-close="${esc(t.id)}">Close</button>`:''}<button data-delete="${esc(t.id)}">Delete</button></td></tr>`).join('')}</tbody></table>`;renderRisk();}
$('addTrade').onclick=()=>{const opened=$('jtime').value?new Date($('jtime').value).toISOString():new Date().toISOString();const t={id:crypto.randomUUID(),time:opened,ticker:$('jt').value.trim().toUpperCase(),contract:$('jc').value.trim(),entry:finite($('je').value),exit:finite($('jx').value),qty:Number($('jq').value),fees:finite($('jf').value)};if(!validTrade(t)){notice('journalNotice','Enter ticker, contract, positive entry, whole quantity, and nonnegative fees/exit.','bad');return;}if(t.exit!==null)t.closedAt=new Date().toISOString();trades.unshift(t);save('0dteJournal',trades);renderJournal();notice('journalNotice','Trade saved.','ok');};
$('journal').onclick=e=>{const id=e.target.dataset.close,del=e.target.dataset.delete;if(id){const raw=prompt('Exit premium per share:');if(raw===null||raw.trim()==='')return;const exit=finite(raw);if(exit===null||exit<0)return;const feesRaw=prompt('Total fees for entry and exit ($):','0');if(feesRaw===null)return;const fees=finite(feesRaw);if(fees===null||fees<0)return;trades=trades.map(t=>t.id===id?{...t,exit,fees,closedAt:new Date().toISOString()}:t);}else if(del&&confirm('Delete this journal entry?'))trades=trades.filter(t=>t.id!==del);else return;save('0dteJournal',trades);renderJournal();};
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({version:1,exported_at:new Date().toISOString(),trades,settings,stars},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='0DTE-journal-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('import').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>5_000_000)throw Error('Backup is too large');const b=JSON.parse(await f.text());if(b.version!==1||!Array.isArray(b.trades)||!b.trades.every(validTrade))throw Error('Invalid backup');const ids=new Set(trades.map(t=>t.id));for(const t of b.trades)if(!ids.has(t.id)){trades.push({...t,id:t.id||crypto.randomUUID()});ids.add(t.id);}save('0dteJournal',trades);if(b.settings&&typeof b.settings==='object'){for(const id of ['perTrade','dailyLoss','maxExposure','timeStop','cutoff'])$(id).value=b.settings[id]??'';}stars=[...new Set([...stars,...(Array.isArray(b.stars)?b.stars.filter(x=>typeof x==='string'):[])])];save('0dteStars',stars);renderJournal();render();notice('journalNotice','Backup imported; existing trade IDs were preserved.','ok');}catch(err){notice('journalNotice','Import failed: '+err.message,'bad');}};
$('board').onclick=e=>{const t=e.target.dataset.star;if(!t)return;stars=stars.includes(t)?stars.filter(x=>x!==t):[...stars,t];save('0dteStars',stars);render();};
$('scan').onclick=()=>startScan('manual');$('wave').onclick=()=>startScan('second-wave');$('check').onclick=()=>load(true);$('auto').onclick=()=>{auto=!auto;startTimer();};$('interval').onchange=startTimer;
for(const id of ['state','direction','catalyst','askMin','askMax','onlyContracts','sort'])$(id).addEventListener('input',render);
for(const id of ['perTrade','dailyLoss','maxExposure','timeStop','cutoff']){$(id).value=settings[id]??'';$(id).addEventListener('input',renderRisk);}
for(const id of ['riskAsk','riskQty'])$(id).addEventListener('input',renderRisk);
active=read('0dteActiveScan',null);lastRefresh=read('0dteLastRefresh',null);enableScan(!active);renderRefresh();renderJournal();await load();startTimer();if(active)pollRun();
setInterval(()=>{if(!document.hidden){$('clock').textContent=new Date().toLocaleString('en-US',{timeZone:'America/New_York'})+' ET';render();renderRisk();}},15000);
setInterval(pollRun,5000);
setInterval(()=>{if(!document.hidden&&active)renderRefresh();},1000);
document.addEventListener('visibilitychange',()=>{startTimer();if(!document.hidden){load();pollRun();}});
