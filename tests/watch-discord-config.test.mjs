import assert from 'node:assert/strict';
import test from 'node:test';
import {configuredDiscordWebhook,discordWebhookStatus,removeDiscordWebhook,storeDiscordWebhook,validDiscordWebhook} from '../watch-discord-config.js';
import {sendDiscordTestMessage} from '../watch-discord.js';
import {handleWatchService,verifiedAlertReadiness} from '../watch-service.js';
import {discordSetupPage} from '../watch-discord-setup-page.js';

const webhook='https://discord.com/api/webhooks/1234/test_token';
const makeEnv=()=>{
 const values=new Map();
 const env={PLAID_ENCRYPTION_KEY:btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
  PLAID_STORE:{get:async key=>values.get(key)||null,put:async(key,value)=>values.set(key,value),delete:async key=>values.delete(key)}};
 return {env,values};
};

test('only exact HTTPS Discord webhook URLs can be saved',()=>{
 assert.equal(validDiscordWebhook(webhook),true);
 for(const url of ['http://discord.com/api/webhooks/1234/token','https://discord.com.evil.test/api/webhooks/1234/token',
  'https://discord.com@evil.test/api/webhooks/1234/token',
  'https://discord.com/api/webhooks/1234/token?debug=1','https://discord.com/api/webhooks/1234/token#fragment'])
  assert.equal(validDiscordWebhook(url),false);
});

test('owner webhook stays encrypted in KV and is never returned by status',async()=>{
 const {env,values}=makeEnv();
 await storeDiscordWebhook(env,webhook);
 assert.ok(values.size===1);
 assert.doesNotMatch([...values.values()][0],/test_token|discord\.com/);
 assert.equal(await configuredDiscordWebhook(env),webhook);
 const status=await discordWebhookStatus(env);
 assert.deepEqual(status,{configured:true,managed_in:'private-setup'});
 assert.doesNotMatch(JSON.stringify(status),/test_token/);
 assert.equal(verifiedAlertReadiness(env,status.configured).requirements.discord_webhook,true);
 await removeDiscordWebhook(env);
 assert.equal(await configuredDiscordWebhook(env),null);
});

test('the encrypted webhook can be used to send a labeled test only',async()=>{
 const {env}=makeEnv();await storeDiscordWebhook(env,webhook);
 let sent=0;
 await sendDiscordTestMessage(env,async(url,options)=>{
  sent++;assert.equal(url,webhook);
  const payload=JSON.parse(options.body);
  assert.match(payload.content,/^TEST ONLY/);
  assert.deepEqual(payload.allowed_mentions,{parse:[]});
  return {ok:true};
 });
 assert.equal(sent,1);
});

test('setup page has a restrictive CSP and does not render saved secrets',async()=>{
 const page=discordSetupPage();
 assert.match(page.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
 assert.match(page.headers.get('Content-Security-Policy'),/connect-src 'self'/);
 assert.doesNotMatch(await page.text(),/test_token/);
});

test('only an Access-authenticated owner can install or remove the webhook',async()=>{
 const {env,values}=makeEnv();
 Object.assign(env,{CF_ACCESS_TEAM_DOMAIN:'owner.cloudflareaccess.com',CF_ACCESS_AUD:'owner-audience',CF_ACCESS_EMAIL:'owner@example.com'});
 const origin='https://owner.example',url=origin+'/private/watch/webhook';
 const unauthenticated=await handleWatchService(new Request(url,{method:'PUT',headers:{Origin:origin,'X-Requested-With':'ContractWatch','Content-Type':'application/json'},body:JSON.stringify({webhook_url:webhook})}),env);
 assert.equal(unauthenticated.status,401);
 assert.equal(values.size,0);

 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const publicKey=await crypto.subtle.exportKey('jwk',pair.publicKey);publicKey.kid='watch-test';
 const enc=value=>btoa(JSON.stringify(value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const header=enc({alg:'RS256',kid:'watch-test'}),payload=enc({iss:'https://owner.cloudflareaccess.com',aud:['owner-audience'],email:'owner@example.com',exp:Math.floor(Date.now()/1000)+300});
 const signed=header+'.'+payload;
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(signed));
 const token=signed+'.'+btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async target=>{
  assert.equal(String(target),'https://owner.cloudflareaccess.com/cdn-cgi/access/certs');
  return Response.json({keys:[publicKey]});
 };
 try {
  const request=(path,method='GET',options={})=>new Request(origin+path,{method,headers:{'Cf-Access-Jwt-Assertion':token,...options.headers},...(options.body?{body:JSON.stringify(options.body)}:{})});
  const page=await handleWatchService(request('/private/watch/setup'),env);
  assert.equal(page.status,200);assert.match(await page.text(),/Discord alert setup/);
  const wrongOrigin=await handleWatchService(request('/private/watch/webhook','PUT',{headers:{Origin:'https://other.example','X-Requested-With':'ContractWatch'},body:{webhook_url:webhook}}),env);
  assert.equal(wrongOrigin.status,403);
  assert.equal(values.size,0);
  const saved=await handleWatchService(request('/private/watch/webhook','PUT',{headers:{Origin:origin,'X-Requested-With':'ContractWatch'},body:{webhook_url:webhook}}),env);
  assert.equal(saved.status,200);assert.equal(values.size,1);
  assert.doesNotMatch(JSON.stringify(await saved.json()),/test_token/);
  const status=await handleWatchService(request('/private/watch/webhook'),env);
  assert.deepEqual(await status.json(),{ok:true,configured:true,managed_in:'private-setup'});
  const removed=await handleWatchService(request('/private/watch/webhook','DELETE',{headers:{Origin:origin,'X-Requested-With':'ContractWatch'}}),env);
  assert.equal(removed.status,200);assert.equal(values.size,0);
 }finally{globalThis.fetch=originalFetch;}
});
