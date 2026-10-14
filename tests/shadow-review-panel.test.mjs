import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildReviewRows,packetQueue,validateQueue,outcomeSummary} from '../shadow-review.js';
const source=(await readFile(new URL('../shadow-review-panel.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
function harness(responses=[]){
 const nodes=new Map(),node=()=>({children:[],textContent:'',disabled:false,replaceChildren(){this.children=[];},append(x){this.children.push(x);},setAttribute(){}}),get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
 const calls=[];new Function('document','fetch','buildReviewRows','packetQueue','validateQueue','outcomeSummary',source)({getElementById:get,createElement:node},async url=>{calls.push(url);return responses.shift();},buildReviewRows,packetQueue,validateQueue,outcomeSummary);return {get,calls};
}
const queue={format:'shadow-review-queue-v1',packet_id:'a'.repeat(64),generated_at:'2026-10-14T15:00:00Z',captured_at:'2026-10-14T15:01:00Z',coverage:{included:1,qualifying:1},candidates:[{candidate_id:'TEST',evidence_gaps:['Missing bars']}]};
test('loads same-origin staging queue and missing outcome counts',async()=>{
 const h=harness([Response.json({environment:'staging'}),Response.json(queue),Response.json({format:'shadow-outcomes-v1',results:[]})]);await h.get('load').onclick();assert.equal(h.get('rows').children.length,1);assert.match(h.get('info').textContent,/2026-10-14T15:00/);assert.match(h.get('outcome-info').textContent,/0 decision records/);
});
test('production cannot silently load staging data',async()=>{
 const h=harness([Response.json({environment:'production'})]);await h.get('load').onclick();assert.equal(h.calls.length,1);assert.match(h.get('status').textContent,/staging page/);assert.equal(h.get('load').disabled,false);
});
