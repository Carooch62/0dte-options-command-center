import test from 'node:test';
import assert from 'node:assert/strict';
import {accessCheck,verifyAccess} from '../plaid-sync.js';
import {handleRobinhood} from '../robinhood-live.js';
const env={CF_ACCESS_TEAM_DOMAIN:'synthetic.cloudflareaccess.com',CF_ACCESS_AUD:'synthetic-audience',CF_ACCESS_EMAIL:'synthetic@example.test'};
const now=Date.parse('2026-11-24T16:00:00Z');
const request=token=>new Request('https://example.workers.dev/private/plaid/robinhood/sign-in',{headers:token?{'Cf-Access-Jwt-Assertion':token}:{}});

test('diagnostic distinguishes absent header from configuration and malformed assertions without private storage',async()=>{
 assert.equal(await accessCheck(request(),env,now),'ASSERTION_MISSING');
 for(const change of [{CF_ACCESS_TEAM_DOMAIN:'https://synthetic.cloudflareaccess.com'},{CF_ACCESS_AUD:''},{CF_ACCESS_EMAIL:undefined}])assert.equal(await accessCheck(request(),{...env,...change},now),'CONFIGURATION_INVALID');
 for(const token of ['not-a-jwt','a.b.c','x'.repeat(10001)])assert.equal(await accessCheck(request(token),env,now),'ASSERTION_MALFORMED');
 const guarded={...env,PLAID_STORE:{get(){throw Error('Must not read private storage');}}};
 const r=await handleRobinhood(request(),guarded);
 assert.equal(r.status,401);assert.equal(r.headers.get('Cache-Control'),'no-store');
 assert.deepEqual(await r.json(),{ok:false,error:'Private sign in required',access_check:'ASSERTION_MISSING'});
 const ordinary=await handleRobinhood(new Request('https://example.workers.dev/private/plaid/robinhood/status'),guarded);
 assert.deepEqual(await ordinary.json(),{ok:false,error:'Private sign in required'});
});

test('only valid signed claims authenticate; failure categories contain no token, claim or configuration values',async()=>{
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'synthetic-key'};
 const claims={iss:'https://'+env.CF_ACCESS_TEAM_DOMAIN,aud:[env.CF_ACCESS_AUD],email:env.CF_ACCESS_EMAIL,exp:now/1000+600};
 const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const token=async changes=>{
  const content=b64({alg:'RS256',kid:jwk.kid})+'.'+b64({...claims,...changes});
  return content+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(content))).toString('base64url');
 };
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({keys:[jwk]});};
 try{
  const valid=await token({});
  assert.equal(await accessCheck(request(valid),env,now),'ASSERTION_VERIFIED');
  assert.equal(await verifyAccess(request(valid),env,now),true);
  for(const [change,category] of [[{iss:'https://other.example.test'},'ISSUER_REJECTED'],[{aud:['wrong']},'AUDIENCE_REJECTED'],[{email:'other@example.test'},'OWNER_REJECTED'],[{exp:now/1000},'TIME_REJECTED'],[{nbf:now/1000+1},'TIME_REJECTED']]){
   const before=calls,bad=await token(change),result=await accessCheck(request(bad),env,now);
   assert.equal(result,'CLAIMS_REJECTED');assert.equal(calls,before);
   assert.equal(await verifyAccess(request(bad),env,now),false);
   assert.equal(await accessCheck(request(bad),env,now,true),category);
   const forged=bad.split('.').slice(0,2).join('.')+'.'+Buffer.alloc(256).toString('base64url');
   assert.equal(await accessCheck(request(forged),env,now,true),'SIGNATURE_REJECTED');
  }
  const badSignature=valid.split('.').slice(0,2).join('.')+'.'+Buffer.alloc(256).toString('base64url');
  assert.equal(await accessCheck(request(badSignature),env,now),'SIGNATURE_REJECTED');
  globalThis.fetch=async()=>Response.json({keys:[]});
  assert.equal(await accessCheck(request(valid),env,now),'SIGNING_KEY_UNAVAILABLE');
  globalThis.fetch=async()=>new Response(null,{status:503});
  assert.equal(await accessCheck(request(valid),env,now),'KEY_SERVICE_UNAVAILABLE');
  globalThis.fetch=async()=>{throw Error('private upstream details');};
  const response=await handleRobinhood(request(await token({exp:Date.now()/1000+600})),env),text=await response.text();
  assert.equal(response.status,401);assert.match(text,/KEY_SERVICE_UNAVAILABLE/);
  for(const secret of [...Object.values(env),'private upstream details',valid])assert.ok(!text.includes(secret));
 }finally{globalThis.fetch=original;}
});
