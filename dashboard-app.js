import {entryReadiness,trendSummary,quoteKey,observePremiums,premiumChange,positionEstimate,reentryProblem,positionAlerts,validPlan} from './trade-review.js?v=20261002-trend-context';
import {refreshProgress,publishedReceipt,closedReceipt,refreshBlocksNewRequest,publicationCheckExpired,verifiedRefresh} from './refresh-progress.js?v=20261001-opening-bar';
import {finite,minutes,snapshotUsable,dataStatus,recordedState,matchesState,robinhoodStockUrl,contractExplanation,contractRank,contractShortlist,displayState,selectableContracts,tradePL,validTrade,riskSummary} from './dashboard-logic.js?v=20261002-trend-context';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const API='https://0dte-options-command-center.h69htk56cq.workers.dev';
const DATA=location.hostname==='localhost'||location.hostname==='127.0.0.1'?'./data/':'https://raw.githubusercontent.com/Carooch62/0dte-options-command-center/main/data/';
let data=null,previous=null,auto=true,timer,loadPromise=null,active=null,polling=false,dataDownloadFailed=false,lastRefresh=null,backendHealth=null,reloadMessage='';
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{$('journalNotice').textContent='Browser storage unavailable. Export your backup before leaving.';return false;}}
const oldTrades=read('0dteJournal',[]);
let trades=(Array.isArray(oldTrades)?oldTrades:[]).map(t=>({...t,id:t.id||crypto.randomUUID(),exit:t.exit??null,fees:t.fees||0})).filter(t=>validTrade(t)&&validPlan(t));
save('0dteJournal',trades);
let editingTrade=null;
let premiumHistory=read('0dtePremiumHistory',{});
if(!premiumHistory||Array.isArray(premiumHistory)||typeof premiumHistory!=='object')premiumHistory={};
let settings=read('0dteRisk',{}),stars=read('0dteStars',[]);
if(!Array.isArray(stars))stars=[];
const money=n=>finite(n)===null?'—':'$'+Number(n).toFixed(2),value=(n,d=2)=>finite(n)===null?'—':Number(n).toFixed(d),time=ts=>ts&&Number.isFinite(new Date(ts).getTime())?new Date(ts).toLocaleString():'Unknown';
function notice(id,text,kind='warn'){$(id).innerHTML=`<div class="notice ${kind}">${esc(text)}</div>`;}
async function json(url,timeout=20000){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(timeout)});if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();}
function movePercent(v){const n=finite(v);return `<span class="move ${n>0?'up':n<0?'down':''}">${n===null?'—':(n>0?'+':'')+value(n)+'%'}</span>`;}
function trendContext(x){
 const t=trendSummary(x),labels={ALIGNED:'Matches scan direction',AGAINST_TREND:'Against scan direction',MIXED:'Mixed longer-term trend',UNKNOWN:'Alignment unavailable'},color=t.alignment==='ALIGNED'?'green':t.alignment==='AGAINST_TREND'?'orange':'gray';
 const contextStatus=t.status==='READY'?'Completed daily bars':t.status==='INSUFFICIENT_HISTORY'?'Some horizons lack complete history':t.status==='STALE'?'Historical daily data':t.status==='SOURCE_FAILURE'?'Daily source unavailable; retained history only':'Daily context not recorded yet';
 return `<section class="trend-context"><div class="row"><b>Longer-term trend</b><span class="tag ${color}">${esc(labels[t.alignment])}</span></div><div class="metrics">${t.periods.map(p=>`<div class="metric"><small>${esc(p.label.toUpperCase())} · ${p.sessions} SESSIONS</small><b>${movePercent(p.change)}</b><small>${esc(p.direction)} · highs ${esc(p.highs.toLowerCase())} · lows ${esc(p.lows.toLowerCase())}</small></div>`).join('')}</div><p class="smallnote">${esc(contextStatus)}${t.asOf?' · as of '+esc(t.asOf):''}. Adjusted for splits and dividends. Daily context only; verify today’s entry separately.</p></section>`;
}
function stockLink(ticker){const url=robinhoodStockUrl(ticker);return url?`<a class="broker-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open ${esc(ticker)} in Robinhood ↗</a>`:'';}
function contract(o,ticker){return `<div class="contract"><div class="smallnote">Bid ${money(o.bid)} · spread ${value(o.spread_pct,1)}% · Δ ${value(o.delta)} · Γ ${value(o.gamma,4)} · volume ${value(o.volume,0)} · OI ${value(o.oi,0)}<br>${esc(o.source)} · ${esc(o.quote_freshness||'Unknown quote time')} · ${value(o.distance_pct,1)}% strike distance</div>${stockLink(ticker)}</div>`;}
function contractPicks(x,picks){
 if(!picks.length)return `<p class="smallnote">No contract shortlist: ${esc(contractExplanation(x,Number($('askMin').value),Number($('askMax').value)))}</p>`;
 return `<div class="smallnote">${x.direction==='UP'?'Calls match the upward stock direction.':'Puts match the downward stock direction.'} Ranked among returned contracts by preferred delta (|Δ| ≥ 0.40), then tighter spread, nearer strike, and volume. Your price filter stays in effect.</div>`+picks.map(p=>{const o=p.option,h=premiumHistory[quoteKey(x.ticker,o)];return `<section class="contract-pick ${p.rank===1?'primary-pick':''}"><div class="row"><span class="tag ${p.label==='PRIMARY WATCH'?'blue':'gray'}">${esc(p.label)}</span><small>Match #${p.rank}</small></div><h3>${esc(x.ticker)} ${money(o.strike)} ${esc(o.side.toUpperCase())}</h3><div>Expires ${esc(o.expiry)} · observed ask <b>${money(o.ask)}</b><br><span class="smallnote">About ${money(o.ask*100)} per standard 100-share contract, before fees</span></div><p class="smallnote">Why it matches: ${p.preferredDelta?'preferred delta':'minimum delta met'} (|Δ| ${value(Math.abs(o.delta))}) · spread ${money(o.spread)} / ${value(o.spread_pct,1)}% · ${value(o.distance_pct,1)}% from the stock · volume ${value(o.volume,0)}.</p><p><b>Contract: QUALIFIES UNDER YOUR FILTERS</b><br><b>Entry: ${esc(entryReadiness(x,dataDownloadFailed?{...data,generated_at:null}:data))}</b></p><p class="smallnote">${h?`First observed ask ${money(h.firstAsk)} (${esc(time(h.firstSeen))}) → latest observed ${money(h.lastAsk)} (${esc(time(h.lastSeen))}) · ${movePercent(premiumChange(h))}. ${premiumChange(h)>=25?'Premium rose 25% or more; reassess the setup and your maximum entry price.':''}`:'No comparison recorded yet.'}<br>Delayed source observations saved by this browser, not live quotes or fills. Source quote time: ${esc(time(o.option_timestamp))}.</p><p class="pick-guidance">${esc(p.guidance)} Each re-entry requires a new confirmed setup.</p>${contract(o,x.ticker)}</section>`;}).join('');
}
function stateColor(state){return ({'CONFIRMED DELAYED':'green',TRIGGERED:'yellow','SECOND-WAVE':'purple',WATCH:'blue',DECAYING:'orange',PASS:'gray','STALE PRICE DATA':'orange','STALE SCAN':'orange','MARKET CLOSED':'gray','DATA UNAVAILABLE':'red'})[state]||'gray';}
function card(x){const state=recordedState(x),freshness=dataStatus(x,dataDownloadFailed?{...data,generated_at:null}:data),opts=selectableContracts(x,Number($('askMin').value),Number($('askMax').value)),levels=x.key_levels||{},picks=contractShortlist(x,dataDownloadFailed?{...data,generated_at:null}:data,Number($('askMin').value),Number($('askMax').value));
const links=(x.news_items||[]).slice(0,2).map(n=>{let safe=false;try{safe=['http:','https:'].includes(new URL(n.url).protocol);}catch{}return safe?`<a target="_blank" rel="noopener" href="${esc(n.url)}">${esc(n.title)}</a>`:esc(n.title);}).join('<br>');
return `<article class="candidate ${!!dataStatus(x,dataDownloadFailed?{...data,generated_at:null}:data)?'stale':''}"><div class="row"><div class="row"><button class="star" data-star="${esc(x.ticker)}" aria-label="Star ${esc(x.ticker)}">${stars.includes(x.ticker)?'★':'☆'}</button><b class="ticker">${esc(x.ticker)}</b></div><div class="candidate-status"><small>LAST SCAN STATUS</small><span class="tag ${stateColor(state)}">${esc(state)}</span><small>${x.last_status?.observed_at?`Updated ${esc(new Date(x.last_status.observed_at).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))} ET`:'No timestamped setup recorded'}</small>${freshness&&x.last_status?'<small class="historical-note">Historical · not a live signal</small>':''}</div></div><div class="row"><strong class="price">${money(x.price)}</strong><span>${esc(x.direction)} · day ${movePercent(x.day_move)} · from open ${movePercent(x.open_move)}</span></div><div class="metrics"><div class="metric"><small>5 MIN</small><b>${movePercent(x.move_5m)}</b></div><div class="metric"><small>15 MIN</small><b>${movePercent(x.recent_move)}</b></div><div class="metric"><small>VOL BURST</small><b>${value(x.volume_ratio)}×</b></div><div class="metric"><small>ACCEL</small><b>${value(x.volume_acceleration)}×</b></div><div class="metric"><small>SCORE</small><b>${value(x.score,1)}</b></div></div>${trendContext(x)}<div class="smallnote">${esc(x.catalyst_level)} catalyst · ${esc(x.momentum_state)} · chase ${esc(x.chase_risk)}<br>Call/put volume balance: ${esc(x.volume_balance||'UNKNOWN')} · core ETF context ${esc(x.market_alignment||'UNKNOWN')}</div><div class="news">${links||'No company-specific headline confirmed.'}</div><div class="levels"><div class="level"><small>TRIGGER</small><b>${money(x.trigger_price)}</b></div><div class="level"><small>INVALIDATION</small><b>${money(x.invalidation_price)}</b></div><div class="level"><small>VWAP</small><b>${money(x.vwap)}</b></div><div class="level"><small>EXTENSION 1</small><b>${money(levels.target_1)}</b></div><div class="level"><small>EXTENSION 2</small><b>${money(levels.target_2)}</b></div></div><div class="smallnote">${x.second_wave_event?'New development: '+esc(x.second_wave_event)+'<br>':''}Completed bar: ${esc(time(x.bar_end))} · ${x.session_bar_count||0} session bars · ${value(minutes(x.bar_end),1)} min old<br>Options: ${esc(x.chain_status||'UNKNOWN')} · ${opts.length} pass your contract filters</div><details class="details" data-ticker="${esc(x.ticker)}"><summary>${picks.length?`Contracts · ${esc(picks[0].label)}: ${money(picks[0].option.strike)} ${esc(picks[0].option.side.toUpperCase())}`:'Contracts · no qualifying match'}</summary>${contractPicks(x,picks)}${opts.length>3?`<p class="smallnote">Showing the top 3 of ${opts.length} matching contracts.</p>`:''}<p class="smallnote">${(x.revisit_contracts||[]).length} eligible contracts above $0.30 retained for revisits.<br>${esc(x.option_source||'Chain not attempted')} · quote time ${esc(x.option_data_freshness||'UNKNOWN')}<br>Bar source: ${esc(x.price_source||'Unknown')}. No gamma minimum is assumed. Missing values remain unavailable.</p></details>${stockLink(x.ticker)}<div class="smallnote">Opens the stock page. Choose Trade, then your option expiration and strike. Your phone may open the app or website.</div></article>`;}
function render(){if(!data)return;
 const age=minutes(data.generated_at),usable=!dataDownloadFailed&&snapshotUsable(data);
 const sessionKnown=Date.now()>=Date.parse(data.session_open_at)&&Date.now()<Date.parse(data.session_close_at);
 $('session').textContent=sessionKnown?'REGULAR SESSION':'OUTSIDE VERIFIED SESSION';
 notice('freshness',`${usable?'Research snapshot':'STALE / RESEARCH ONLY'} · generated ${time(data.generated_at)} · ${age===null?'unknown age':value(age,1)+' min old'}. Options remain delayed; unknown quote times cannot confirm an entry.`,usable?'warn':'bad');
 const all=data.candidates||[],counts={};for(const x of all){const s=recordedState(x);counts[s]=(counts[s]||0)+1;}
 const c=data.coverage||{};
 $('stats').innerHTML=[['STOCK ROWS',c.stocks_received??data.scanned_rows??0],['CHAIN ATTEMPTS',c.chains_attempted??'Unknown'],['WITH SAME-DAY CHAIN',c.chains_with_contracts??'Unknown'],['LAST TRIGGERED',counts.TRIGGERED||0],['LAST SECOND-WAVE',counts['SECOND-WAVE']||0],['LAST CONFIRMED',counts['CONFIRMED DELAYED']||0]].map(([a,b])=>`<div class="panel stat"><b>${esc(b)}</b><span>${a}</span></div>`).join('');
 $('coverage').textContent=`Universe: ${data.universe_size??'unknown'} · ${c.chains_not_attempted??'unknown'} chains not yet attempted · ${Object.entries(c.chain_status_counts||{}).map(([a,b])=>a+': '+b).join(' · ')}. Broader discovery: ${Object.entries(data.discovery||{}).map(([a,b])=>a+' '+b.status).join(', ')}.`;
 const min=Number($('askMin').value),max=Number($('askMax').value);$('filterNotice').textContent=(!Number.isFinite(min)||!Number.isFinite(max)||min<0||max<min)?'Enter a valid minimum and maximum.':'';
 let rows=all.filter(x=>matchesState(x,dataDownloadFailed?{...data,generated_at:null}:data,$('state').value)&&($('direction').value==='ALL'||x.direction===$('direction').value)&&($('catalyst').value==='ALL'||x.catalyst_level===$('catalyst').value)&&($('onlyContracts').value!=='contracts'||selectableContracts(x,min,max).length)&&($('onlyContracts').value!=='starred'||stars.includes(x.ticker)));
 const order={'CONFIRMED DELAYED':7,TRIGGERED:6,'SECOND-WAVE':5,WATCH:4,DECAYING:3,PASS:2,'STALE PRICE DATA':1,'STALE SCAN':1,'MARKET CLOSED':1,'DATA UNAVAILABLE':0};
 rows.sort((a,b)=>$('sort').value==='score'?(b.score||0)-(a.score||0):$('sort').value==='move'?Math.abs(b.move_5m||0)-Math.abs(a.move_5m||0):(order[recordedState(b)]||0)-(order[recordedState(a)]||0)||contractRank(b,min,max)-contractRank(a,min,max)||(b.score||0)-(a.score||0));
 const opened=new Set([...$('board').querySelectorAll('details[open]')].map(d=>d.dataset.ticker));
 $('shown').textContent=rows.length+' candidates';$('board').innerHTML=rows.map(card).join('')||'<p class="empty">No candidates match these filters.</p>';
 for(const details of $('board').querySelectorAll('details'))details.open=opened.has(details.dataset.ticker);
 const changes=data.execution_layer?.state_transitions||[];$('changes').innerHTML=changes.length?changes.map(x=>`<div class="change-item"><b>${esc(x.ticker)}</b> ${esc(x.from)} → ${esc(x.to)}</div>`).join(''):'No transitions from a comparable same-session snapshot.';
 const f=data.option_feedback||{};$('feedback').innerHTML=`<p>${f.today_count||0} observations recorded today.</p>`+(f.recent||[]).slice(-5).reverse().map(x=>`<div class="change-item"><b>${esc(x.ticker)} ${esc(x.side)} ${money(x.strike)}</b> · observed ask ${money(x.entry_ask)} · ${esc(time(x.observed_at))}<br>${Object.entries(x.markouts||{}).map(([h,m])=>`${h}m: bid ${money(m.exit_bid)}, gross quote change ${money(m.gross_quote_change_per_contract)} / contract · ${esc(m.interpretation)}`).join('<br>')||'Waiting for a later, changed source snapshot.'}</div>`).join('');
}
function rememberRefresh(r){lastRefresh=r;save('0dteLastRefresh',r);}
function renderRefresh(){
 const r=active||lastRefresh;
 enableScan(!refreshBlocksNewRequest(active));
 const steps=r?refreshProgress({requestStatus:r.requestStatus,run:r.run,published:!!r.receipt,closed:!!r.closed,waiting:!!r.waiting}):[];
 if(r?.unverified){for(const step of steps)if(step.state==='active'||step.state==='waiting'){step.state='unverified';step.detail='Publication could not be verified';}steps.at(-1).label='Check ended';}
 const elapsed=r?Math.max(0,Math.floor(((r.finished||Date.now())-r.started)/1000)):0;
 let message=r?.message||'Ready to refresh. Live progress will appear here.';
 if(r?.receipt){const c=r.receipt.coverage||{};message=`Refresh completed. Published ${time(r.receipt.generated_at)} · ${c.stocks_received??'—'} stock rows · ${c.chains_attempted??'—'} chain checks.${data?.scan_id!==r.id?' Newer results are already displayed.':''}`;}
 if(r?.closed)message='Market closed · refresh finished. The last scan and its recorded statuses are retained.';
 if(r?.waiting)message=`Waiting for the first completed five-minute market bar${r.waiting.retry_after?' at '+time(r.waiting.retry_after):''}. This request finished without new market data. The next scheduled scan will try again; the last snapshot is retained.`;
 const current=steps.find(s=>s.state==='active'),title=r?.unverified?'Run finished · data not verified':r?.waiting?'Waiting for first bar':r?.closed?'Market closed':r?.receipt?'Refresh complete':r?.failed?'Refresh interrupted':current?.label||'Scanner updates';
 $('scanProgress').innerHTML=`<div class="refresh-box ${r?.failed?'failed':r?.finished?'finished':''}" role="status" aria-live="polite"><div class="row"><b>${esc(title)}</b><small>${r?.finished?'Finished':active?'In progress':'Ready'}</small></div><p class="refresh-message">${esc(message)}</p>${steps.length?`<ol class="refresh-timeline">${steps.map(s=>`<li class="${s.state}" ${s.state==='active'?'aria-current="step"':''} title="${esc(s.detail)}"><span>${s.state==='done'?'✓':s.state==='failed'?'!':s.state==='skipped'?'—':s.state==='active'?'●':'○'}</span> ${esc(s.label)}${s.state==='skipped'?' (skipped)':''}</li>`).join('')}</ol>`:''}${current?.detail?`<p class="smallnote">${esc(current.detail)}</p>`:''}<div class="smallnote">${r?`Requested ${esc(time(r.started))} · ${Math.floor(elapsed/60)}m ${elapsed%60}s${r.run?.url?` · <a href="${esc(r.run.url)}" target="_blank" rel="noopener">View run</a>`:''}`:''}${reloadMessage?`<br>${esc(reloadMessage)}`:''}${backendHealth?`<br>Latest scanner result: ${esc(backendHealth.status)} · ${esc(time(backendHealth.updated_at))}${backendHealth.error?' · '+esc(backendHealth.error):''}`:''}</div></div>`;
}
function applyVerifiedRefresh(request,result){
 if(!result||(active?active.id!==request.id:lastRefresh?.id!==request.id))return;
 rememberRefresh(result);
 if(active?.id===request.id){active=null;save('0dteActiveScan',null);}
 enableScan(!refreshBlocksNewRequest(active));renderRefresh();
}
async function load(manual=false){
 if(loadPromise)return loadPromise;
 loadPromise=(async()=>{try{
   const oldId=data?.scan_id,d=await json(DATA+'market-dashboard.json?v='+Date.now());
   if(data&&d.scan_id!==oldId)previous=data;data=d;dataDownloadFailed=false;premiumHistory=observePremiums(premiumHistory,d.candidates||[],d.generated_at);save('0dtePremiumHistory',premiumHistory);render();renderJournal();
   if(manual)reloadMessage=`${oldId===d.scan_id?'No newer scan has published.':'Displayed data updated.'} Latest snapshot: ${time(d.generated_at)}.`;
   const health=await json(DATA+'scan-health.json?v='+Date.now()).catch(()=>null);
   if(health)backendHealth=health;
   // A timed-out request remains eligible for late evidence, including after reopening.
   const r=active||(lastRefresh?.unverified?lastRefresh:null);
   if(r){
     let result=verifiedRefresh(r,data,[],health);
     if(!result&&(r.unverified||(r.run?.status==='completed'&&r.run?.conclusion==='success'))){
       const receipts=await json(DATA+'scan-receipts.json?v='+Date.now()).catch(()=>[]);
       result=verifiedRefresh(r,data,receipts,health);
     }
     applyVerifiedRefresh(r,result);
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
   if(r?.status==='completed'&&r.conclusion==='success'){
     active.verificationStarted??=Date.now();
     save('0dteActiveScan',active);
     await load();
     if(active?.id===id&&publicationCheckExpired(active)){
       rememberRefresh({...active,unverified:true,finished:Date.now(),message:'GitHub finished this run, but a new snapshot or completion receipt could not be verified. The last scan is retained. You can refresh again.'});
       active=null;save('0dteActiveScan',null);enableScan(true);renderRefresh();
     }
   }
   if(active&&Date.now()-active.started>20*60000){active.message='This request is taking longer than expected. View its run for details; you can start another scan.';enableScan(true);renderRefresh();}
 }catch(e){if(active&&active.id===id){active.message='Status check interrupted: '+e.message+'. Tracking will retry.';renderRefresh();}}
 finally{polling=false;}
}
async function startScan(mode){
 if(refreshBlocksNewRequest(active))return;
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
function renderJournal(){const closed=trades.filter(t=>t.exit!==null),pnl=closed.reduce((n,t)=>n+tradePL(t),0);$('journal').innerHTML=`<p>${closed.length} closed · ${trades.length-closed.length} open · realized P/L after entered fees ${money(pnl)}</p>`+trades.slice(0,100).map(t=>`<section class="contract-pick"><div class="row"><h3>${esc(t.ticker)} ${esc(t.contract)}</h3><span class="tag ${t.exit===null?'blue':'gray'}">${t.exit===null?'OPEN':'CLOSED'}</span></div><p>Filled entry ${money(t.entry)} · quantity ${t.qty} · entered fees ${money(t.fees)}<br>Opened ${esc(time(t.time))} · expiration ${esc(t.expiry||'Not entered')}</p>${t.exit===null?`<p>Bid-based estimate: ${money(positionEstimate(t,'bid'))} · mark-based estimate: ${money(positionEstimate(t,'mark'))}<br><small>Manual bid ${money(t.bid)} · manual mark ${money(t.mark)} · updated ${esc(time(t.quoteAt))}. Estimates use entered fees; quotes may be stale and do not guarantee fills.</small></p>`:`<p>Filled exit ${money(t.exit)} · realized P/L ${money(tradePL(t))}</p>`}<p>Loss-review bid ${money(t.lossReview)} · profit-review bid ${money(t.target)} · maximum entry ${money(t.maxEntry)}<br>Exit conditions: ${esc(t.exitConditions||'Not entered')}<br>Entry reason: ${esc(t.entryReason||'Not entered')} · confirmation ${esc(time(t.confirmationAt))}</p>${reentryProblem(t,trades.filter(p=>p.id!==t.id))?`<div class="notice warn">${esc(reentryProblem(t,trades.filter(p=>p.id!==t.id)))}</div>`:''}${positionAlerts(t).map(a=>`<div class="notice warn">${esc(a)} Based on your manually entered data.</div>`).join('')}<div class="controls">${t.exit===null?`<button data-quote="${esc(t.id)}">Update bid / mark</button><button data-close="${esc(t.id)}">Record exit fill</button>`:''}<button data-edit="${esc(t.id)}">Edit fill / plan</button><button data-delete="${esc(t.id)}">Delete</button></div></section>`).join('');renderRisk();}
$('addTrade').onclick=()=>{const opened=$('jtime').value?new Date($('jtime').value).toISOString():new Date().toISOString();const t={...trades.find(t=>t.id===editingTrade),id:editingTrade||crypto.randomUUID(),time:opened,ticker:$('jt').value.trim().toUpperCase(),contract:$('jc').value.trim(),entry:finite($('je').value),exit:finite($('jx').value),qty:Number($('jq').value),fees:finite($('jf').value),expiry:$('jexpiry').value,lossReview:finite($('jloss').value),target:finite($('jtarget').value),maxEntry:finite($('jmax').value),exitConditions:$('jconditions').value.trim(),entryReason:$('jreason').value.trim(),confirmationAt:$('jconfirm').value?new Date($('jconfirm').value).toISOString():null};if(!validTrade(t)||!validPlan(t)){notice('journalNotice','Enter ticker, contract, positive entry, whole quantity, and nonnegative fees/exit.','bad');return;}if(t.maxEntry!==null&&t.entry>t.maxEntry){notice('journalNotice','Your actual fill exceeds the recorded maximum entry. Saved for review.','warn');}const reentry=reentryProblem(t,trades.filter(p=>p.id!==t.id));if(t.exit!==null)t.closedAt=t.closedAt||new Date().toISOString();else delete t.closedAt;trades=trades.filter(p=>p.id!==t.id);trades.unshift(t);editingTrade=null;$('addTrade').textContent='Save trade';save('0dteJournal',trades);renderJournal();notice('journalNotice',reentry?'Actual fill saved for an accurate journal. '+reentry:t.maxEntry!==null&&t.entry>t.maxEntry?'Fill saved; it exceeded your maximum entry price.':'Trade saved.',reentry||t.maxEntry!==null&&t.entry>t.maxEntry?'warn':'ok');};
$('journal').onclick=e=>{const edit=e.target.dataset.edit;if(edit){const t=trades.find(t=>t.id===edit);editingTrade=edit;for(const [id,k] of Object.entries({jt:'ticker',jc:'contract',je:'entry',jx:'exit',jq:'qty',jf:'fees',jexpiry:'expiry',jloss:'lossReview',jtarget:'target',jmax:'maxEntry',jconditions:'exitConditions',jreason:'entryReason'}))$(id).value=t[k]??'';for(const [id,k] of [['jtime','time'],['jconfirm','confirmationAt']]){const d=new Date(t[k]);$(id).value=t[k]&&Number.isFinite(+d)?new Date(+d-d.getTimezoneOffset()*60000).toISOString().slice(0,16):'';}$('addTrade').textContent='Save changes';$('jt').scrollIntoView({block:'center'});return;}const id=e.target.dataset.close,del=e.target.dataset.delete,qid=e.target.dataset.quote;if(qid){const t=trades.find(t=>t.id===qid);const br=prompt('Current observed bid per share (blank = unknown):',t.bid??'');if(br===null)return;const mr=prompt('Current observed mark per share (blank = unknown):',t.mark??'');if(mr===null)return;const bid=finite(br),mark=finite(mr);if((br.trim()&&(bid===null||bid<0))||(mr.trim()&&(mark===null||mark<0)))return;trades=trades.map(t=>t.id===qid?{...t,bid,mark,quoteAt:new Date().toISOString()}:t);}else if(id){const raw=prompt('Exit premium per share:');if(raw===null||raw.trim()==='')return;const exit=finite(raw);if(exit===null||exit<0)return;const feesRaw=prompt('Total fees for entry and exit ($):','0');if(feesRaw===null)return;const fees=finite(feesRaw);if(fees===null||fees<0)return;trades=trades.map(t=>t.id===id?{...t,exit,fees,closedAt:new Date().toISOString()}:t);}else if(del&&confirm('Delete this journal entry?'))trades=trades.filter(t=>t.id!==del);else return;save('0dteJournal',trades);renderJournal();};
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({version:1,exported_at:new Date().toISOString(),trades,settings,stars},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='0DTE-journal-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('import').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>5_000_000)throw Error('Backup is too large');const b=JSON.parse(await f.text());if(b.version!==1||!Array.isArray(b.trades)||!b.trades.every(t=>validTrade(t)&&validPlan(t)))throw Error('Invalid backup');const ids=new Set(trades.map(t=>t.id));for(const t of b.trades)if(!ids.has(t.id)){trades.push({...t,id:t.id||crypto.randomUUID()});ids.add(t.id);}save('0dteJournal',trades);if(b.settings&&typeof b.settings==='object'){for(const id of ['perTrade','dailyLoss','maxExposure','timeStop','cutoff'])$(id).value=b.settings[id]??'';}stars=[...new Set([...stars,...(Array.isArray(b.stars)?b.stars.filter(x=>typeof x==='string'):[])])];save('0dteStars',stars);renderJournal();render();notice('journalNotice','Backup imported; existing trade IDs were preserved.','ok');}catch(err){notice('journalNotice','Import failed: '+err.message,'bad');}};
$('board').onclick=e=>{const t=e.target.dataset.star;if(!t)return;stars=stars.includes(t)?stars.filter(x=>x!==t):[...stars,t];save('0dteStars',stars);render();};
$('scan').onclick=()=>startScan('manual');$('wave').onclick=()=>startScan('second-wave');$('check').onclick=()=>load(true);$('auto').onclick=()=>{auto=!auto;startTimer();};$('interval').onchange=startTimer;
for(const id of ['state','direction','catalyst','askMin','askMax','onlyContracts','sort'])$(id).addEventListener('input',render);
for(const id of ['perTrade','dailyLoss','maxExposure','timeStop','cutoff']){$(id).value=settings[id]??'';$(id).addEventListener('input',renderRisk);}
for(const id of ['riskAsk','riskQty'])$(id).addEventListener('input',renderRisk);
active=read('0dteActiveScan',null);lastRefresh=read('0dteLastRefresh',null);enableScan(!refreshBlocksNewRequest(active));renderRefresh();renderJournal();await load();startTimer();if(active)pollRun();
setInterval(()=>{if(!document.hidden){$('clock').textContent=new Date().toLocaleString('en-US',{timeZone:'America/New_York'})+' ET';render();renderJournal();}},15000);
setInterval(pollRun,5000);
setInterval(()=>{if(!document.hidden&&active)renderRefresh();},1000);
document.addEventListener('visibilitychange',()=>{startTimer();if(!document.hidden){load();pollRun();}});
