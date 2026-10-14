import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {candidateQuotes} from '../candidate-quotes.js';
import {validateRobinhoodPack} from '../robinhood-review.js';
const source=(await readFile(new URL('../candidate-quotes-panel.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
async function harness(responses=[]){
 const nodes=new Map(),node=()=>({children:[],disabled:false,textContent:'',append(x){this.children.push(x);},replaceChildren(){this.children=[];}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};let tick;
 const calls=[];const fetch=async(...args)=>{calls.push(args);return responses.shift();};
 new Function('document','fetch','setInterval','candidateQuotes','validateRobinhoodPack',source)({getElementById:get,createElement:node},fetch,fn=>tick=fn,candidateQuotes,validateRobinhoodPack);
 const load=async(id,data)=>get(id).onchange({target:{files:[{size:100,text:async()=>JSON.stringify(data)}]}});
 const id='bbdbf613-f3e0-4f68-9cc7-fc090ca84e24';const now=new Date().toISOString();
 await load('scanner',{candidates:[{ticker:'SPY',options:[{strike:778,side:'call',expiry:'2026-10-12'}]}]});
 await load('research',{format:'robinhood-research-v1',retrieved_at:now,accounts:[],bars:[],observations:[{instrument:{id,chain_symbol:'SPY',strike_price:778,type:'call',expiration_date:'2026-10-12',trade_value_multiplier:100,state:'active',tradability:'tradable',sellout_datetime:'2099-01-01T00:00:00Z'},quote:{instrument_id:id,bid_price:'.80',ask_price:'.81',updated_at:now},received_at:now}]});
 return {get,load,tick,calls};
}
test('imports render a matching quote and invalid scanner clears the table',async()=>{
 const h=await harness();assert.equal(h.get('rows').children.length,1);assert.equal(h.get('refresh').disabled,false);
 await h.load('scanner',{wrong:true});h.tick();assert.equal(h.get('rows').children.length,0);assert.equal(h.get('refresh').disabled,true);
});
test('staging denial clears old prices and permits a later retry',async()=>{
 const h=await harness([Response.json({error:'Private routes disabled in staging'},{status:403})]);await h.get('refresh').onclick();assert.match(h.get('status').textContent,/staging/);assert.equal(h.get('rows').children[0].children[1].textContent,'Unknown');assert.equal(h.get('refresh').disabled,false);assert.equal(h.calls[0][1].cache,'no-store');
});
test('partial response preserves missing contract mapping for retry, but clears its price',async()=>{
 const h=await harness([Response.json({received_at:new Date().toISOString(),observations:[]})]);await h.get('refresh').onclick();assert.match(h.get('status').textContent,/Missing contracts: 1/);assert.equal(h.get('refresh').disabled,false);assert.equal(h.get('rows').children[0].children[1].textContent,'Unknown');
});
test('unexpected quote ID is rejected without retaining previous price',async()=>{
 const h=await harness([Response.json({observations:[{quote:{instrument_id:'wrong'}}]})]);await h.get('refresh').onclick();assert.match(h.get('status').textContent,/Unexpected quote identity/);assert.equal(h.get('rows').children[0].children[1].textContent,'Unknown');
});
test('loader checks environment before data and displays source timestamp',async()=>{
 const h=await harness([Response.json({environment:'staging'}),Response.json({generated_at:'2026-10-12T14:00:00Z',candidates:[]})]);await h.get('load-scanner').onclick();assert.deepEqual(h.calls.map(x=>x[0]),['/health','/data/candidate-snapshot.json']);assert.match(h.get('snapshot-info').textContent,/Staging.*2026-10-12/);
});
test('production loader rejection clears prior snapshot without fetching data',async()=>{
 const h=await harness([Response.json({environment:'production'})]);await h.get('load-scanner').onclick();assert.equal(h.calls.length,1);assert.equal(h.get('rows').children.length,0);assert.match(h.get('status').textContent,/requires the staging/);
});

test('private current loader clears previous mapping and reports current source',async()=>{
 const h=await harness([Response.json({snapshot:{generated_at:'2026-10-14T14:00:00Z',candidates:[],included_contracts:0,qualifying_contracts:0}})]);await h.get('load-current').onclick();assert.match(h.get('snapshot-info').textContent,/Production/);assert.equal(h.calls[0][0],'/private/plaid/robinhood/candidates');assert.equal(h.get('refresh').disabled,true);
});
test('network failures clear quotes, preserve retry and explain sign-in recovery',async()=>{
 const h=await harness([Promise.reject(new TypeError('Failed to fetch'))]);await h.get('refresh').onclick();assert.match(h.get('status').textContent,/sign in.*retry/);assert.equal(h.get('rows').children[0].children[1].textContent,'Unknown');assert.equal(h.get('refresh').disabled,false);assert.equal(h.get('rows').children[0].children[3].textContent,'UNKNOWN');
});
test('metadata resolution checks returned identities before automatic refresh',async()=>{
 const h=await harness([Response.json({results:[{contract:{ticker:'QQQ',strike:778,side:'call',expiry:'2026-10-12'},status:'EXACT_METADATA_MATCH',instrument:{}}]})]);await h.get('resolve').onclick();assert.match(h.get('status').textContent,/Unexpected contract/);assert.equal(h.calls.length,1);assert.equal(h.get('refresh').disabled,true);
});
test('resolved metadata triggers quotes, preserves unresolved contracts, and evaluates live ask',async()=>{
 const id='bbdbf613-f3e0-4f68-9cc7-fc090ca84e24',now=new Date().toISOString(),c={ticker:'SPY',strike:778,side:'call',expiry:'2026-10-12'};
 const h=await harness([Response.json({results:[{contract:c,status:'EXACT_METADATA_MATCH',instrument:{id,chain_symbol:'SPY',strike_price:778,type:'call',expiration_date:c.expiry,state:'active',tradability:'tradable',trade_value_multiplier:100,sellout_datetime:'2099-01-01T00:00:00Z'}}]}),Response.json({received_at:now,observations:[{quote:{instrument_id:id,bid_price:'.29',ask_price:'.30',updated_at:now}}]})]);
 await h.get('resolve').onclick();assert.deepEqual(h.calls.map(x=>x[0]),['/private/plaid/robinhood/resolve','/private/plaid/robinhood/quotes']);assert.equal(h.get('rows').children[0].children[3].textContent,'WITHIN_LIMIT');
});
