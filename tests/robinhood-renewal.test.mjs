import test from 'node:test';
import assert from 'node:assert/strict';
import {RobinhoodCoordinator} from '../robinhood-live.js';
const rawKey=Buffer.alloc(32,17);
async function seal(value){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await crypto.subtle.importKey('raw',rawKey,'AES-GCM',false,['encrypt']);
 const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('robinhood-live-v1')},key,new TextEncoder().encode(JSON.stringify(value)));
 return Buffer.from(iv).toString('base64url')+'.'+Buffer.from(bytes).toString('base64url');
}
async function harness(run){
 const values=new Map(),legacy=new Map();let queue=Promise.resolve();
 const state={storage:{get:async k=>values.get(k),put:async(k,v)=>values.set(k,v)},blockConcurrencyWhile:fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;}};
 const env={PLAID_ENCRYPTION_KEY:rawKey.toString('base64'),CF_ACCESS_EMAIL:'me@example.com',ROBINHOOD_CLIENT_ID:'client',PLAID_STORE:{get:async k=>legacy.get(k)||null,delete:async k=>legacy.delete(k)}};
 const owner=new RobinhoodCoordinator(state,env);
 const request=async(path,body)=>{const response=await owner.fetch(new Request('https://internal'+path,{method:'POST',body:JSON.stringify(body||{})}));return response.json();};
 await request('/save',{sealed:await seal({access_token:'old-access',refresh_token:'old-refresh',expires_at:Date.now()+1000})});
 const original=globalThis.fetch;
 try{await run({values,legacy,request,setFetch:fn=>globalThis.fetch=fn,owner});}finally{globalThis.fetch=original;}
}
test('concurrent callers rotate once; encrypted replacement survives a later read',async()=>harness(async({request,values,setFetch})=>{
 let calls=0;setFetch(async(url,options)=>{
  calls++;assert.equal(options.body.get('grant_type'),'refresh_token');assert.equal(options.body.get('refresh_token'),'old-refresh');
  return Response.json({access_token:'new-access',refresh_token:'new-refresh',expires_in:3600,token_type:'Bearer'});
 });
 const results=await Promise.all([request('/token'),request('/token'),request('/token')]);
 assert.equal(calls,1);assert.ok(results.every(r=>r.connection.access_token==='new-access'));
 assert.equal((await request('/token')).connection.refresh_token,'new-refresh');
 assert.doesNotMatch(JSON.stringify([...values.values()]),/new-access|new-refresh/);
}));
test('uncertain rotation never reuses the old refresh token automatically',async()=>harness(async({request,setFetch})=>{
 let calls=0;setFetch(async()=>{calls++;throw Error('network outcome unknown');});
 assert.equal((await request('/token')).connection,null);
 assert.equal((await request('/token')).connection,null);assert.equal(calls,1);
}));
test('throttling persists cooldown, and disconnect cannot resurrect legacy credentials',async()=>harness(async({request,setFetch,legacy})=>{
 let calls=0;setFetch(async()=>{calls++;return new Response(null,{status:429,headers:{'Retry-After':'120'}});});
 assert.equal((await request('/token')).connection,null);assert.equal((await request('/token')).connection,null);assert.equal(calls,1);
 await request('/disconnect');
 legacy.set('robinhood-live:connection:me@example.com',await seal({access_token:'stale',expires_at:Date.now()+3600000}));
 assert.equal((await request('/token')).connection,null);
}));
test('a missing rotated refresh token fails closed',async()=>harness(async({request,setFetch})=>{
 let calls=0;setFetch(async()=>{calls++;return Response.json({access_token:'new',expires_in:3600,token_type:'Bearer'});});
 assert.equal((await request('/token')).connection,null);assert.equal((await request('/token')).connection,null);assert.equal(calls,1);
}));
test('simultaneous pilot ticks share one execution',async()=>harness(async({owner})=>{
 let runs=0,release;const pending=new Promise(resolve=>{release=resolve;});
 owner.runPilot=async()=>{runs++;await pending;return {status:'checked'};};
 const a=owner.fetch(new Request('https://internal/pilot')),b=owner.fetch(new Request('https://internal/pilot'));
 release();assert.deepEqual(await (await a).json(),{status:'checked'});await b;assert.equal(runs,1);
}));
test('pilot throttling increases persistent cooldown and suppresses provider calls',async()=>harness(async({owner,values,setFetch})=>{
 owner.env.WATCH_QUOTE_PILOT_ENABLED='true';
 let calls=0;setFetch(async()=>{calls++;throw Object.assign(Error('throttled'),{status:429,retry_ms:60000});});
 assert.equal((await owner.runPilot()).status,'throttled');
 assert.ok(values.get('pilot_retry_after')>=Date.now()+299000);
 assert.equal((await owner.runPilot()).status,'throttled');assert.equal(calls,1);
 values.set('pilot_retry_after',0);
 await owner.runPilot();assert.equal(calls,2);assert.equal(values.get('pilot_throttles'),2);
 assert.ok(values.get('pilot_retry_after')>=Date.now()+599000);
}));
