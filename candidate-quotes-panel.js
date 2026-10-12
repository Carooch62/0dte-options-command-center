import {candidateQuotes} from './candidate-quotes.js';
import {validateRobinhoodPack} from './robinhood-review.js';
const $=id=>document.getElementById(id);
let scanner=null,observations=[],busy=false,scannerSource='No snapshot';
function render(){
 $('load-scanner').disabled=busy;
 const generated=Date.parse(scanner?.generated_at),age=(Date.now()-generated)/60000;
 $('snapshot-info').textContent=scanner?`${scannerSource} · Generated: ${scanner.generated_at||'unknown'} · Age: ${Number.isFinite(age)&&age>=0?age.toFixed(1)+' minutes':'unknown'} · Snapshot freshness is separate from quote freshness.`:'No scanner snapshot loaded.';
 $('scanner').disabled=busy;$('research').disabled=busy;
 $('rows').replaceChildren();if(!scanner){$('refresh').disabled=true;return [];}
 const rows=candidateQuotes(scanner,observations);
 for(const row of rows){const tr=document.createElement('tr');for(const value of [row.contract,row.bid===undefined?'Unknown':`${row.bid} / ${row.ask}`,Number.isFinite(row.age_seconds)?row.age_seconds.toFixed(1):'Unknown',`${row.status}${row.reasons.length?': '+row.reasons.join(', '):''}`]){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('rows').append(tr);}
 $('refresh').disabled=busy||!rows.some(r=>r.instrument_id);return rows;
}
for(const id of ['scanner','research'])$(id).onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>10000000)throw Error('Maximum file size is 10 MB');const data=JSON.parse(await f.text());if(id==='scanner'){if(!Array.isArray(data.candidates))throw Error('Expected scanner candidates');candidateQuotes(data,[]);scanner=data;scannerSource='Imported file; environment unverified';}else observations=validateRobinhoodPack(data).observations;render();$('status').textContent='Snapshot checks updated. No scanner rankings changed.';}catch(e){if(id==='scanner')scanner=null;else observations=[];render();$('refresh').disabled=true;$('status').textContent=e.message;}};
$('load-scanner').onclick=async()=>{
 if(busy)return;busy=true;scanner=null;render();
 try{
 const read=async path=>{const r=await fetch(path,{cache:'no-store',credentials:'same-origin'});if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error('Staging snapshot unavailable. Import a JSON snapshot instead.');return r.json();};
 const health=await read('/health');if(health.environment!=='staging')throw Error('This loader requires the staging environment. Import a snapshot instead.');
 const data=await read('/data/market-dashboard.json');candidateQuotes(data,[]);
 if(!Number.isFinite(Date.parse(data.generated_at)))throw Error('Snapshot generation timestamp is missing or invalid.');
 scanner=data;scannerSource='Staging · same-origin scanner data';$('status').textContent='Staging snapshot loaded. Review its generation time before using candidates.';
 }catch(e){$('status').textContent=e.message;}finally{busy=false;render();}
};
$('refresh').onclick=async()=>{
 if(busy)return;
 busy=true;const rows=render(),ids=[...new Set(rows.map(r=>r.instrument_id).filter(Boolean))];
 if(ids.length>20){busy=false;render();$('status').textContent='More than 20 matches. Import a smaller candidate snapshot.';return;}
 const prior=observations;observations=[];render();$('status').textContent='Fetching matched quotes…';
 try{const response=await fetch('/private/plaid/robinhood/quotes',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Requested-With':'RobinhoodQuotes'},body:JSON.stringify({kind:'option',instrument_ids:ids})});
 if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Open the hosted brokerage page, sign in, then retry.');const data=await response.json();if(!response.ok)throw Error(data.error||'Quote request failed');
 const seen=new Set();observations=data.observations.map(x=>{const id=x.quote.instrument_id;if(!ids.includes(id)||seen.has(id))throw Error('Unexpected quote identity');seen.add(id);const old=prior.find(p=>p.instrument.id===id);return {instrument:old.instrument,quote:x.quote,received_at:data.received_at};});
 observations.push(...prior.filter(x=>!seen.has(x.instrument.id)).map(x=>({...x,quote:{instrument_id:x.instrument.id},received_at:null})));
 $('status').textContent=`Received ${data.received_at}. Missing contracts: ${ids.filter(id=>!seen.has(id)).length}.`;
 }catch(e){observations=prior.map(x=>({...x,quote:{instrument_id:x.instrument.id},received_at:null}));$('status').textContent=e.message;}finally{busy=false;render();}
};
setInterval(render,1000);
