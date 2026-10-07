import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePlaid,scheduledPlaidSync,verifyAccess} from './plaid-sync.js';

const request=(path,method='GET',headers={})=>new Request(`https://example.workers.dev/private/plaid/${path}`,{method,headers});
const configured={PLAID_CLIENT_ID:'id',PLAID_SECRET:'secret',PLAID_STORE:{},PLAID_ENCRYPTION_KEY:'test',CF_ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com',CF_ACCESS_AUD:'aud',CF_ACCESS_EMAIL:'me@example.com'};

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
