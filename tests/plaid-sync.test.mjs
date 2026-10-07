import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePlaid,scheduledPlaidSync,verifyAccess} from '../plaid-sync.js';
import worker from '../worker.js';

const request=(path,method='GET',headers={})=>new Request(`https://example.workers.dev/private/plaid/${path}`,{method,headers});
const configured={PLAID_CLIENT_ID:'id',PLAID_SECRET:'secret',PLAID_STORE:{},PLAID_ENCRYPTION_KEY:'test',PLAID_ENV:'sandbox',CF_ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com',CF_ACCESS_AUD:'aud',CF_ACCESS_EMAIL:'me@example.com'};

test('fails closed when secrets or storage are missing',async()=>{
 const r=await handlePlaid(request('snapshot'),{});
 assert.equal(r.status,503);
 assert.equal(await scheduledPlaidSync({}),'unconfigured');
});
test('rejects a missing Access assertion before reading storage',async()=>{
 const r=await handlePlaid(request('snapshot'),configured);
 assert.equal(r.status,401);
 assert.equal(await verifyAccess(request('snapshot'),configured),false);
});
test('rejects a forged or malformed assertion',async()=>{
 const r=request('snapshot','GET',{'Cf-Access-Jwt-Assertion':'not-a-jwt'});
 assert.equal(await verifyAccess(r,configured),false);
});
test('Worker routes private requests through the guarded handler',async()=>{
 const r=await worker.fetch(request('snapshot'),{ASSETS:{fetch(){throw Error('Unprotected asset route')}}});
 assert.equal(r.status,503);
});
test('valid signed Access claim passes; cross-origin mutation is rejected',async()=>{
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='testing-key';
 const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const h=b64({alg:'RS256',kid:jwk.kid}),p=b64({iss:'https://test.cloudflareaccess.com',aud:['aud'],email:'me@example.com',exp:Math.floor(Date.now()/1000)+600});
 const sig=Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(`${h}.${p}`))).toString('base64url');
 const token=`${h}.${p}.${sig}`,original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}));
 try{
  const env={...configured,PLAID_ENCRYPTION_KEY:Buffer.alloc(32,17).toString('base64'),PLAID_STORE:{get:async()=>null}};
  const auth={'Cf-Access-Jwt-Assertion':token};
  assert.equal(await verifyAccess(request('status','GET',auth),env),true);
  const result=await handlePlaid(request('link-token','POST',{...auth,Origin:'https://evil.test','X-Requested-With':'BrokerageReview'}),env);
  assert.equal(result.status,403);
 }finally{globalThis.fetch=original;}
});
