import test from 'node:test';
import assert from 'node:assert/strict';
import {requestJSON,safeRequestAttempts} from '../private-request.js';
import {sessionPayload,restoreSession} from '../quote-session.js';
test('timeout covers a stalled fetch and a stalled response body, without automatic retry',async()=>{
 for(const body of [false,true]){let calls=0,signal;
 await assert.rejects(requestJSON('/test',{},10,async(_,o)=>{calls++;signal=o.signal;if(!body)return new Promise(()=>{});return {ok:true,status:200,headers:new Headers({'content-type':'application/json'}),json:()=>new Promise(()=>{})};}),e=>e.code==='TIMEOUT');
 assert.equal(calls,1);assert.equal(signal.aborted,true);
 }
});
test('failure types distinguish network, private sign-in, authorization and service errors',async()=>{
 const cases=[new TypeError('offline'),new Response('login',{headers:{'content-type':'text/html'}}),Response.json({}, {status:401}),Response.json({}, {status:409}),Response.json({error:'sensitive detail'},{status:502}),new Response('gateway',{status:502}),Response.json({status:'SETUP_REQUIRED'},{status:503})];
 for(const [i,code] of ['NETWORK','SIGN_IN','SIGN_IN','AUTHORIZATION','SERVICE','SERVICE','SETUP'].entries())await assert.rejects(requestJSON('/test',{},100,async()=>{if(cases[i] instanceof Error)throw cases[i];return cases[i];}),e=>e.code===code&&!e.message.includes('sensitive'));
});
test('diagnostics retain failures without a batch and discard arbitrary private content',()=>{
 const now=Date.now(),stamp=new Date(now).toISOString(),attempt={operation:'candidates',code:'NETWORK',started_at:stamp,finished_at:stamp,browser_ms:12,http_status:null,access_token:'secret',body:'secret'};
 const safe=safeRequestAttempts([attempt,{...attempt,operation:'disconnect'}]);assert.equal(safe.length,1);assert.ok(!JSON.stringify(safe).includes('secret'));
 const p=sessionPayload(null,[],[],'none',now,[attempt]);const restored=restoreSession(JSON.stringify(p),now);assert.equal(restored.scanner,null);assert.equal(restored.requests[0].code,'NETWORK');
});
test('Access redirects are detected before fetch follows a cross-origin sign-in page',async()=>{
 for(const response of [{type:'opaqueredirect',status:0,ok:false,headers:new Headers()},new Response(null,{status:302,headers:{Location:'https://login.example/secret'}})]){
  let calls=0;
  await assert.rejects(requestJSON('/private/test',{redirect:'follow'},100,async(_,options)=>{
   calls++;assert.equal(options.redirect,'manual');assert.equal(options.credentials,'same-origin');return response;
  }),e=>e.code==='SIGN_IN'&&!e.message.includes('secret'));
  assert.equal(calls,1);
 }
});
