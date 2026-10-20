import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {candidateQuotes} from '../candidate-quotes.js';
import {validateRobinhoodPack} from '../robinhood-review.js';
import {quoteGuidance,appendQuoteEvidence,quoteEvidenceInput,scannerFromEvidencePacket,validationTiming} from '../quote-evidence.js';
import {SESSION_KEY,sessionPayload,restoreSession} from '../quote-session.js';
import {quoteRequestTiming} from '../quote-timing.js';
import {captureWindows} from '../quote-evidence.js';
import {requestJSON,safeRequestAttempts} from '../private-request.js';
const source=(await readFile(new URL('../candidate-quotes-panel.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
async function harness(responses=[],storage=new Map(),prime=true,consent=()=>true){
 const nodes=new Map(),node=()=>({children:[],disabled:false,textContent:'',append(x){this.children.push(x);},replaceChildren(){this.children=[];}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};let tick;
 const calls=[];const fetch=async(...args)=>{calls.push(args);return responses.shift();};
 const sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 new Function('document','fetch','setInterval','candidateQuotes','validateRobinhoodPack','quoteGuidance','appendQuoteEvidence','quoteEvidenceInput','scannerFromEvidencePacket','validationTiming','SESSION_KEY','sessionPayload','restoreSession','sessionStorage','confirm','quoteRequestTiming','requestJSON','safeRequestAttempts','captureWindows',source)({getElementById:get,createElement:node},fetch,fn=>tick=fn,candidateQuotes,validateRobinhoodPack,quoteGuidance,appendQuoteEvidence,quoteEvidenceInput,scannerFromEvidencePacket,validationTiming,SESSION_KEY,sessionPayload,restoreSession,sessionStorage,consent,quoteRequestTiming,(url,options,ms)=>requestJSON(url,options,ms,fetch),safeRequestAttempts,captureWindows);
 const load=async(id,data)=>get(id).onchange({target:{files:[{size:100,text:async()=>JSON.stringify(data)}]}});
 const id='bbdbf613-f3e0-4f68-9cc7-fc090ca84e24';const now=new Date().toISOString();
 if(prime){await load('scanner',{candidates:[{ticker:'SPY',options:[{strike:778,side:'call',expiry:'2026-10-12'}]}]});
 await load('research',{format:'robinhood-research-v1',retrieved_at:now,accounts:[],bars:[],observations:[{instrument:{id,chain_symbol:'SPY',strike_price:778,type:'call',expiration_date:'2026-10-12',trade_value_multiplier:100,state:'active',tradability:'tradable',sellout_datetime:'2099-01-01T00:00:00Z'},quote:{instrument_id:id,bid_price:'.80',ask_price:'.81',updated_at:now},received_at:now}]});
 }return {get,load,tick,calls,storage};
}
test('imports render a matching quote and invalid scanner clears the table',async()=>{
 const h=await harness();assert.equal(h.get('rows').children.length,1);assert.equal(h.get('refresh').disabled,false);
 await h.load('scanner',{wrong:true});h.tick();assert.equal(h.get('rows').children.length,0);assert.equal(h.get('refresh').disabled,true);
});
test('staging denial clears old prices and permits a later retry',async()=>{
 const h=await harness([Response.json({error:'Private routes disabled in staging'},{status:403})]);await h.get('refresh').onclick();assert.match(h.get('status').textContent,/access was denied/);assert.equal(h.get('rows').children[0].children[1].textContent,'Unknown');assert.equal(h.get('refresh').disabled,false);assert.equal(h.calls[0][1].cache,'no-store');
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
test('staging validation loader preserves the frozen contract cohort and clears earlier mapping',async()=>{
 const p={format:'shadow-evidence-v1',packet_id:'a'.repeat(64),scan_id:'staging-test',generated_at:'2026-10-15T13:36:00Z',captured_at:'2026-10-15T13:37:00Z',market_session:'OPEN',candidates:[{candidate_id:'TEST',ticker:'TEST',contract:{contract_id:'TEST',strike:100,side:'put',expiry:'2026-10-16'}}]};
 const h=await harness([Response.json(p)]);await h.get('load-validation').onclick();assert.equal(h.calls[0][0],'/data/staging-shadow-evidence-latest.json');assert.match(h.get('snapshot-info').textContent,/STAGING VALIDATION/);assert.equal(h.get('refresh').disabled,true);assert.match(h.get('rows').children[0].children[0].textContent,/TEST/);
});
test('network failures clear quotes and preserve retry without assuming expired authorization',async()=>{
 const h=await harness([Promise.reject(new TypeError('Failed to fetch'))]);await h.get('refresh').onclick();assert.match(h.get('status').textContent,/network and retry/);assert.equal(h.get('rows').children[0].children[1].textContent,'Unknown');assert.equal(h.get('refresh').disabled,false);assert.match(h.get('rows').children[0].children[3].textContent,/Unknown/);
});
test('metadata resolution checks returned identities before automatic refresh',async()=>{
 const h=await harness([Response.json({results:[{contract:{ticker:'QQQ',strike:778,side:'call',expiry:'2026-10-12'},status:'EXACT_METADATA_MATCH',instrument:{}}]})]);await h.get('resolve').onclick();assert.match(h.get('status').textContent,/Unexpected contract/);assert.equal(h.calls.length,1);assert.equal(h.get('refresh').disabled,true);
});
test('resolved metadata triggers quotes, preserves unresolved contracts, and evaluates live ask',async()=>{
 const id='bbdbf613-f3e0-4f68-9cc7-fc090ca84e24',now=new Date().toISOString(),c={ticker:'SPY',strike:778,side:'call',expiry:'2026-10-12'};
 const h=await harness([Response.json({results:[{contract:c,status:'EXACT_METADATA_MATCH',instrument:{id,chain_symbol:'SPY',strike_price:778,type:'call',expiration_date:c.expiry,state:'active',tradability:'tradable',trade_value_multiplier:100,sellout_datetime:'2099-01-01T00:00:00Z'}}]}),Response.json({received_at:now,observations:[{quote:{instrument_id:id,bid_price:'.29',ask_price:'.30',updated_at:now}}]})]);
 await h.get('resolve').onclick();assert.deepEqual(h.calls.map(x=>x[0]),['/private/plaid/robinhood/resolve','/private/plaid/robinhood/quotes']);assert.equal(h.get('rows').children[0].children[3].textContent,'Within $0.30');
});
test('reload restores history and mapping without fetching or resetting timestamps',async()=>{
 const id='bbdbf613-f3e0-4f68-9cc7-fc090ca84e24',now=new Date().toISOString();
 const h=await harness([Response.json({received_at:now,observations:[{quote:{instrument_id:id,bid_price:'.29',ask_price:'.30',updated_at:now}}]})]);
 await h.get('refresh').onclick();const saved=JSON.parse(h.storage.get(SESSION_KEY));
 assert.equal(saved.history.length,1);
 const resumed=await harness([],h.storage,false,()=>false);
 assert.match(resumed.get('session-info').textContent,/Restored/);assert.equal(resumed.calls.length,0);assert.equal(resumed.get('refresh').disabled,false);
 await resumed.get('load-validation').onclick();assert.equal(resumed.calls.length,0);assert.equal(JSON.parse(h.storage.get(SESSION_KEY)).history[0].received_at,now);
 await resumed.get('clear-session').onclick();assert.ok(h.storage.has(SESSION_KEY));
 const cleared=await harness([],h.storage,false);await cleared.get('clear-session').onclick();assert.equal(h.storage.has(SESSION_KEY),false);
});
test('fresh-only filter hides above-limit quotes without losing refresh mappings',async()=>{
 const h=await harness();h.get('verified-only').checked=true;h.get('verified-only').onchange();assert.equal(h.get('rows').children.length,0);assert.equal(h.get('refresh').disabled,false);assert.match(h.get('quote-summary').textContent,/1 fresh quotes above limit/);
});
test('blocked tab storage does not prevent quote rendering and warns to export',async()=>{
 const storage={get(){throw Error('blocked');},set(){throw Error('quota');},delete(){}};
 const h=await harness([],storage);assert.equal(h.get('rows').children.length,1);assert.equal(h.get('refresh').disabled,false);assert.match(h.get('session-info').textContent,/unavailable.*Export/);
});
test('request timings survive export and reload while provider clocks remain unchanged',async()=>{
 const id='bbdbf613-f3e0-4f68-9cc7-fc090ca84e24',received=new Date().toISOString(),observed=new Date(Date.parse(received)-1000).toISOString();
 const h=await harness([Response.json({received_at:received,request_timing:{setup_ms:40,quote_ms:20,worker_ms:65,access_token:'secret'},observations:[{quote:{instrument_id:id,bid_price:'.29',ask_price:'.30',updated_at:observed}}]})]);
 await h.get('refresh').onclick();
 const saved=JSON.parse(h.storage.get(SESSION_KEY)),q=saved.history[0];
 assert.equal(q.observed_at,observed);assert.equal(q.received_at,received);
 assert.equal(q.request_timing.setup_ms,40);assert.equal(q.request_timing.quote_ms,20);assert.equal(q.request_timing.worker_ms,65);assert.ok(q.request_timing.browser_ms>=0);
 assert.ok(!JSON.stringify(saved).includes('secret'));assert.match(h.get('status').textContent,/Refresh request:/);
 const exported=quoteEvidenceInput(saved.scanner,saved.history,received);assert.deepEqual(exported.observations[0].request_timing,q.request_timing);
 const resumed=await harness([],h.storage,false);assert.equal(resumed.calls.length,0);
 assert.deepEqual(JSON.parse(h.storage.get(SESSION_KEY)).history[0],q);
});





test('empty current batch disables matching and explains how to proceed',async()=>{
 const h=await harness([Response.json({snapshot:{generated_at:new Date().toISOString(),candidates:[],included_contracts:0,qualifying_contracts:0}})],new Map(),false);
 await h.get('load-current').onclick();
 assert.equal(h.get('resolve').disabled,true);
 assert.equal(h.get('refresh').disabled,true);
 assert.match(h.get('resolve-help').textContent,/no candidates/);
 assert.match(h.get('connection-state').textContent,/Private service reached/);
 assert.equal(h.calls.length,1);
});

test('private sign-in failure is visible beside connection and request controls',async()=>{
 const h=await harness([new Response('<html>Sign in</html>',{status:200,headers:{'content-type':'text/html'}})],new Map(),false);
 await h.get('load-current').onclick();
 assert.match(h.get('connection-state').textContent,/Private sign-in required/);
 assert.match(h.get('status').textContent,/sign in/);
 assert.equal(h.get('resolve').disabled,true);
 assert.equal(h.get('load-current').disabled,false);
});
test('failed batch request exports diagnostics before matching and retries only on tap',async()=>{
 const h=await harness([Promise.reject(new TypeError('offline')),Response.json({snapshot:{generated_at:new Date().toISOString(),candidates:[],included_contracts:0,qualifying_contracts:0}})],new Map(),false);
 await h.get('load-current').onclick();assert.equal(h.calls.length,1);assert.equal(h.get('resolve').disabled,true);assert.equal(h.get('export-evidence').disabled,false);assert.equal(h.get('retry-request').disabled,false);
 const saved=JSON.parse(h.storage.get(SESSION_KEY));assert.equal(saved.requests[0].code,'NETWORK');assert.equal(saved.scanner,null);
 await h.get('retry-request').onclick();assert.equal(h.calls.length,2);assert.equal(h.get('retry-request').disabled,true);assert.match(h.get('last-success').textContent,/candidates/);assert.equal(JSON.parse(h.storage.get(SESSION_KEY)).requests.length,2);
});
test('active authorization survives a separately reported batch-service failure',async()=>{
 const h=await harness([Response.json({connected:true,expires_at:'2026-10-22T18:47:28Z'}),Response.json({},{status:502})],new Map(),false);
 await h.get('check-connection').onclick();await h.get('load-current').onclick();
 assert.match(h.get('authorization-state').textContent,/Authorized until/);assert.match(h.get('connection-state').textContent,/Scanner batch could not be loaded/);assert.doesNotMatch(h.get('status').textContent,/reconnect/i);
 assert.deepEqual(JSON.parse(h.storage.get(SESSION_KEY)).requests.map(x=>x.code),['SUCCESS','SERVICE']);
});
test('a failed replacement load retains the original batch and captured evidence',async()=>{
 const id='bbdbf613-f3e0-4f68-9cc7-fc090ca84e24',now=new Date().toISOString();
 const h=await harness([Response.json({received_at:now,observations:[{quote:{instrument_id:id,bid_price:'.29',ask_price:'.30',updated_at:now}}]}),Response.json({},{status:502})]);
 await h.get('refresh').onclick();const before=JSON.parse(h.storage.get(SESSION_KEY));await h.get('load-current').onclick();const after=JSON.parse(h.storage.get(SESSION_KEY));
 assert.deepEqual(after.history,before.history);assert.deepEqual(after.scanner,before.scanner);assert.equal(h.get('refresh').disabled,false);
});
