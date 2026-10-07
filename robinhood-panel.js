import {validateRobinhoodPack,robinhoodResearch,mergeObservations} from './robinhood-review.js?v=20261007-rh';
const $=id=>document.getElementById(id),esc=x=>String(x??'Unknown').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let current=null;
const table=(headers,rows)=>'<div class="scroll"><table><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+esc(c)+'</td>').join('')+'</tr>').join('')+'</table></div>';
function render(){
 if(!current)return;
 const d=robinhoodResearch(current),r=d.orders;
 $('rh-status').textContent=`Collected ${current.retrieved_at}. Imported snapshot; no automatic Robinhood connection on this website. ${r.fills.length} executions; ${r.round_trips.length} matched round trips; ${r.unmatched.length} unmatched executions. Fees/net P/L unknown. Coverage: ${current.accounts.map(a=>a.coverage_note||'unknown').join('; ')}`;
 $('rh-quotes').innerHTML=table(['Contract / selection','Bid / ask','Spread','Delta / theta','Delta range match','Quote refreshed / collected','Status','Force-close time'],d.quotes.map(q=>[q.contract+' / '+q.selection,`${q.bid??'—'} / ${q.ask??'—'}`,q.spread===null?'Unknown':q.spread.toFixed(4),`${q.delta??'—'} / ${q.theta??'—'}`,`1–14 days: ${q.delta_1_14_day_match??'N/A'}; swing: ${q.swing_delta_match??'N/A'}`,`${q.quote_updated_at} / ${q.received_at}`,q.flags.join('; ')||'Recent snapshot; check execution price',q.sellout_datetime]));
 $('rh-fills').innerHTML=table(['Contract','Action','Contracts / price','Actual execution time','Order source'],r.fills.map(f=>[`${f.ticker} ${f.strike} ${f.side} ${f.expiry}`,`${f.action} to ${f.position_effect}`,`${f.qty} / ${f.price}`,f.filled_at,f.placed_agent]))+table(['Round trip','Gross P/L','Net P/L','Exit source'],r.round_trips.map(t=>[`${t.ticker} ${t.strike} ${t.side}`,t.gross.toFixed(2),'Unknown fees',t.exit_source]))+r.issues.map(x=>'<p>'+esc(x)+'</p>').join('');
 $('rh-bars').innerHTML=table(['Underlying','Sampled move','Approx. VWAP','Volume burst / acceleration','Last bar start'],d.underlyings.map(b=>[b.symbol,b.signed_move_pct?.toFixed(2)+'%',b.approximate_bar_vwap?.toFixed(4),`${b.volume_burst?.toFixed(2)??'—'} / ${b.volume_acceleration?.toFixed(2)??'—'}`,b.last_bar||b.status]));
 $('rh-export').disabled=false;
}
$('rh-file').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>10000000)throw Error('File exceeds 10 MB');const next=validateRobinhoodPack(JSON.parse(await f.text()));const candidate={...next,observations:mergeObservations(current?.observations||[],next.observations)};robinhoodResearch(candidate);current=candidate;render();}catch(e){$('rh-status').textContent='Import failed: '+e.message;}};
$('rh-clear').onclick=()=>{current=null;for(const id of ['rh-quotes','rh-fills','rh-bars'])$(id).textContent='';$('rh-status').textContent='Private Robinhood review cleared.';$('rh-file').value='';$('rh-export').disabled=true;};
$('rh-export').onclick=()=>{if(!current)return;const u=URL.createObjectURL(new Blob([JSON.stringify(robinhoodResearch(current),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='private-robinhood-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
setInterval(()=>{if(current)render();},30000);
