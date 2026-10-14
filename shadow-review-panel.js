import {buildReviewRows,packetQueue,validateQueue,outcomeSummary} from './shadow-review.js';
const $=id=>document.getElementById(id);
let queue=null,reviews=null,replay=null;
function render(){
 $('rows').replaceChildren();if(!queue)return;
 $('info').textContent=`Scan: ${queue.generated_at} · Captured: ${queue.captured_at} · Session: ${queue.market_session||'unknown'} · ${queue.coverage.included} included / ${queue.coverage.qualifying} eligible · Packet: ${queue.packet_id}`;
 for(const row of buildReviewRows(queue,reviews,replay)){
  const tr=document.createElement('tr');
  for(const [index,value] of [row.candidate_id,row.ask??'Unknown',row.review_status,row.replay_status,row.reasons.join('; ')].entries()){
   const td=document.createElement('td');td.textContent=String(value);td.setAttribute('data-label',['Contract','Research ask','Review','Replay','Evidence gaps / reasons'][index]);tr.append(td);
  }$('rows').append(tr);
 }
}
$('load').onclick=async()=>{
 $('load').disabled=true;queue=null;reviews=null;replay=null;render();$('info').textContent='';
 try{const r=await fetch('/data/staging-shadow-review-queue.json',{cache:'no-store'});if(!r.ok)throw Error('Staging queue unavailable. Use the Cloudflare-hosted page or import a saved packet.');queue=validateQueue(await r.json());$('status').textContent='Staging research queue loaded. Production rankings are unchanged. Check the original scan and capture times.';render();
 const o=await fetch('/data/staging-shadow-outcomes.json',{cache:'no-store'});if(o.ok)$('outcome-info').textContent=outcomeSummary(await o.json());
 }catch(e){$('status').textContent=e.message;}finally{$('load').disabled=false;}
};
for(const id of ['packet','reviews','replay','outcomes'])$(id).onchange=async e=>{
 try{const f=e.target.files[0];if(!f)return;if(f.size>10000000)throw Error('Maximum file size is 10 MB');const data=JSON.parse(await f.text());
 if(id==='packet'){queue=packetQueue(data);reviews=null;replay=null;}else if(id==='reviews'){if(!queue)throw Error('Load a packet first');buildReviewRows(queue,data,replay);reviews=data;}else if(id==='replay'){if(!queue)throw Error('Load a packet first');buildReviewRows(queue,reviews,data);replay=data;}else $('outcome-info').textContent=outcomeSummary(data);
 render();$('status').textContent='Imported data remains in this page session. Rankings unchanged.';
 }catch(e){if(id==='reviews')reviews=null;if(id==='replay')replay=null;if(id==='packet'){queue=null;$('info').textContent='';}if(id==='outcomes')$('outcome-info').textContent='No valid outcome report loaded.';render();$('status').textContent=e.message;}
};
