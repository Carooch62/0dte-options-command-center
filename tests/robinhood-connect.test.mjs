import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../robinhood-connect.js',import.meta.url),'utf8');
async function page(responses){
 const elements=new Map();
 const node=()=>({disabled:false,textContent:'',value:'',children:[],replaceChildren(){this.children=[];this.textContent='';},append(x){this.children.push(x);}});
 const document={getElementById(id){if(!elements.has(id))elements.set(id,node());return elements.get(id);},createElement:node};
 const calls=[];
 const fetch=async(url,options)=>{calls.push({url,options});const next=responses.shift();assert.ok(next,'unexpected request');return typeof next==='function'?next():next;};
 await new (Object.getPrototypeOf(async function(){}).constructor)('document','fetch','window',source)(document,fetch,{});
 const get=id=>document.getElementById('rh-live-'+id);
 get('kind').value='equity';get('symbols').value='SPY';
 return {get,calls};
}
const connected=()=>Response.json({connected:true,expires_at:'2026-10-16T19:52:08Z'});
const quote=bid=>Response.json({source:'Robinhood MCP',received_at:'2026-10-12T15:05:28Z',observations:[{quote:{symbol:'SPY',bid_price:bid,ask_price:'778'},clocks:{},book_status:'AVAILABLE'}]});
test('repeat refresh replaces results and requests uncached data',async()=>{
 const {get,calls}=await page([connected(),quote('777'),quote('777.50')]);
 await get('test').onclick();await get('test').onclick();
 assert.equal(get('results').children.length,2);assert.match(get('results').children[1].textContent,/777.50/);
 assert.equal(calls.length,3);assert.ok(calls.every(x=>x.options.cache==='no-store'));assert.equal(get('test').disabled,false);
});
test('authorization rejection removes old quotes and enables reconnect',async()=>{
 const {get}=await page([connected(),quote('777'),Response.json({code:'RECONNECT_REQUIRED',error:'Reconnect'},{status:409})]);
 await get('test').onclick();await get('test').onclick();
 assert.equal(get('results').children.length,0);assert.equal(get('test').disabled,true);assert.equal(get('connect').disabled,false);
});
test('HTML sign-in response gives actionable error and prevents further quote requests',async()=>{
 const {get}=await page([connected(),new Response('<html>Sign in</html>',{headers:{'content-type':'text/html'}})]);
 await get('test').onclick();assert.match(get('status').textContent,/hosted workers.dev/);assert.equal(get('test').disabled,true);
});
test('transient failure clears results but permits retry',async()=>{
 const {get}=await page([connected(),quote('777'),Response.json({error:'Unavailable'},{status:502})]);
 await get('test').onclick();await get('test').onclick();assert.equal(get('results').children.length,0);assert.equal(get('test').disabled,false);
});
test('expired status enables reconnect and prevents quote requests',async()=>{
 const {get}=await page([Response.json({connected:false,expires_at:'2026-10-10T00:00:00Z',status:'RECONNECT_REQUIRED'})]);
 assert.equal(get('connect').disabled,false);assert.equal(get('test').disabled,true);assert.match(get('status').textContent,/expired/);
});
