import {validatePack,researchDataset} from './dashboard-broker-logic.js?v=20261007-broker';
const $=id=>document.getElementById(id),esc=x=>String(x??'Unknown').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=x=>x===null||x===undefined?'Unknown':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(x);
const key='0dteBrokerReviewV1';let pack=null,history=[],historyError='';
try{const r=await fetch('https://raw.githubusercontent.com/Carooch62/0dte-options-command-center/main/data/scan-history.json',{cache:'no-store'});if(!r.ok)throw Error();history=await r.json();if(!Array.isArray(history))throw Error();}catch{history=[];historyError='Scanner history could not be loaded. Comparisons are unavailable.';}
function comparison(s){
 if(s.status!=='RESEARCH_COMPARISON')return `<p>${s.status==='NO_PRIOR_SNAPSHOT'?'No preceding same-session snapshot retained.':'Ticker absent from the latest preceding snapshot.'}</p>`;
 const tr=s.trend_context;
 return `<p>Snapshot published ${esc(s.published_at)} · ${Number(s.age_minutes).toFixed(1)} minutes before provider transaction time<br>Rank ${esc(s.rank)} · stock direction ${s.direction_aligned?'aligned':'not aligned'} with option<br>Setup qualified: ${s.setup_qualified===null?'Unknown':s.setup_qualified?'Yes':'No'} · chase ${esc(s.chase_risk)}<br>Stock ${money(s.price)} · VWAP ${money(s.vwap)} · trigger ${money(s.trigger_price)}<br>Volume burst ${esc(s.volume_ratio)}× · acceleration ${esc(s.volume_acceleration)}×<br>Daily trend ${esc(tr?.overall_direction)} · alignment ${esc(tr?.alignment)}<br>${['week','two_weeks','month'].map(k=>`${k.replace('_',' ')}: ${esc(tr?.periods?.[k]?.direction)} (${esc(tr?.periods?.[k]?.change_pct)}%)`).join(' · ')}<br>Entry delta/theta: unavailable.</p><p class="muted">${esc(s.limitation)}</p>`;
}
function render(){
 if(!pack)return;
 const d=researchDataset(pack,history),net=d.rows.every(t=>t.net!==null)?d.rows.reduce((a,t)=>a+t.net,0):null;
 $('status').textContent=`${pack.source||'Imported brokerage'} · retrieved ${pack.retrieved_at}\nCoverage: ${pack.coverage?.note||'Unknown completeness'}\nFreshness: ${pack.coverage?.freshness||'unknown'}. ${historyError}`;
 $('summary').textContent=`${d.rows.length} unambiguous round trips · combined P/L after reported fees ${money(net)}. Based on imported records only; this is not a complete account performance total.`;
 $('trades').innerHTML=d.rows.map(t=>`<details><summary>${esc(t.ticker)} ${esc(t.strike)} ${esc(t.side)} · expires ${esc(t.expiry)} · ${money(t.net)}</summary><p>${t.qty} contract(s) · ${money(t.entry)} → ${money(t.exit)} · fees ${money(t.fees)}<br>Provider transaction times: ${esc(t.time)} → ${esc(t.closedAt)}<br>${esc(t.timestamp_basis)}</p><b>Prior scanner evidence</b>${comparison(t.scanner)}</details>`).join('')||'No unambiguous option round trips.';
 $('issues').innerHTML=d.issues.map(i=>`<p>${esc(i.symbol)}: ${esc(i.reason)}</p>`).join('')+`<p>${d.issues.length} flagged groups/records. Nonstandard option symbols and non-option records excluded from automatic matching.</p>`;
 $('holdings').innerHTML='<table><tr><th>Holding</th><th>Quantity</th><th>Reported value</th><th>Price as of</th></tr>'+pack.holdings.map(h=>`<tr><td>${esc(h.ticker_symbol||h.name)}</td><td>${esc(h.quantity)}</td><td>${money(h.institution_value)}</td><td>${esc(h.institution_price_datetime||h.institution_price_as_of)}</td></tr>`).join('')+'</table>';
 $('export').disabled=false;
}
$('file').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>10_000_000)throw Error('File exceeds 10 MB');const next=validatePack(JSON.parse(await f.text()));researchDataset(next,history);localStorage.setItem(key,JSON.stringify(next));pack=next;render();}catch(e){$('status').textContent=`Import failed: ${e.message}. Existing saved data preserved.`;}};
$('clear').onclick=()=>{localStorage.removeItem(key);pack=null;$('status').textContent='Saved brokerage data cleared.';for(const id of ['summary','trades','issues','holdings'])$(id).textContent='';$('export').disabled=true;};
$('export').onclick=()=>{const u=URL.createObjectURL(new Blob([JSON.stringify(researchDataset(pack,history),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='private-brokerage-research.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
try{const saved=localStorage.getItem(key);if(saved){pack=validatePack(JSON.parse(saved));render();}}catch{$('status').textContent='Saved snapshot could not be read. Import a valid snapshot to replace it.';}
