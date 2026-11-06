import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduledWatchCheck,handleWatchService,verifiedAlertReadiness} from './watch-service.js';
const watch={ticker:'TEST',direction:'UP',contract_id:'TEST261106C00011000',expiry:'2026-11-06',side:'call',strike:11};
const old={scan_id:'old',generated_at:'2026-11-02T14:45:00Z',candidates:[{ticker:'TEST',direction:'UP',execution_state:'WATCH'}]};
const next={scan_id:'new',generated_at:'2026-11-02T14:50:00Z',candidates:[{ticker:'TEST',direction:'UP',execution_state:'TRIGGERED'}]};
const now=Date.parse('2026-11-02T14:51:00Z');
function setup(){const values=new Map([['contract-watch-list-v2',JSON.stringify({watches:[watch],revision:'r1'})],['contract-watch-checkpoint-v2',JSON.stringify({revision:'r1',previous:old})]]);const env={WATCH_ALERTS_ENABLED:'true',DISCORD_WATCH_WEBHOOK_URL:'https://discord.com/api/webhooks/123/placeholder',PLAID_STORE:{get:async k=>values.get(k)||null,put:async(k,v)=>{values.set(k,v)}}};return {env,get:()=>JSON.parse(values.get('contract-watch-checkpoint-v2')),values};}
test('disabled service never fetches or sends',async()=>{const {env}=setup();env.WATCH_ALERTS_ENABLED='false';assert.equal(await scheduledWatchCheck(env,now,()=>{throw Error('network called')}),'disabled');});
test('private watch route fails closed without configuration or Access assertion',async()=>{const request=new Request('https://example.com/private/watch');let r=await handleWatchService(request,{});assert.equal(r.status,503);const {env}=setup();Object.assign(env,{CF_ACCESS_AUD:'aud',CF_ACCESS_EMAIL:'user@example.com',CF_ACCESS_TEAM_DOMAIN:'team.cloudflareaccess.com'});r=await handleWatchService(request,env);assert.equal(r.status,401);});
test('successful scan sends once and checkpoints',async()=>{const {env,get}=setup();let sent=0;const fetcher=async url=>url.includes('raw.githubusercontent.com')?{ok:true,json:async()=>next}:(sent++,{ok:true});assert.equal(await scheduledWatchCheck(env,now,fetcher),'sent');assert.equal(sent,1);assert.equal(get().previous.scan_id,'new');assert.equal(await scheduledWatchCheck(env,now,fetcher),'unchanged');assert.equal(sent,1);});
test('failed Discord send keeps old scan for retry',async()=>{const {env,get,values}=setup();const fetcher=async url=>url.includes('raw.githubusercontent.com')?{ok:true,json:async()=>next}:{ok:false,status:429};await assert.rejects(scheduledWatchCheck(env,now,fetcher),/HTTP 429/);assert.equal(get().previous.scan_id,'old');assert.equal([...values.keys()].filter(k=>k.startsWith('contract-watch-delivered-v2:')).length,0);});
test('private watch list is never overwritten by scheduled checkpoint writes',async()=>{const {env,values}=setup();const fetcher=async url=>url.includes('raw.githubusercontent.com')?{ok:true,json:async()=>next}:{ok:true};await scheduledWatchCheck(env,now,fetcher);assert.equal(JSON.parse(values.get('contract-watch-list-v2')).revision,'r1');assert.equal([...values.keys()].filter(k=>k.startsWith('contract-watch-delivered-v2:')).length,1);});
test('legacy watch list requires a private sync before sending',async()=>{const {env,values}=setup();values.delete('contract-watch-list-v2');values.set('contract-watch-monitor-v1',JSON.stringify({watches:[watch],previous:old}));assert.equal(await scheduledWatchCheck(env,now,()=>{throw Error('network called')}),'needs-private-sync');});

test('verified-alert readiness reports missing prerequisites without exposing secrets',()=>{
 const {env}=setup();
 Object.assign(env,{FAST_SCAN_ENABLED:'true',SCAN_COORDINATOR:{},ROBINHOOD_CONNECTION_ENABLED:'true',WATCH_QUOTE_PILOT_ENABLED:'false',WATCH_VERIFIED_ALERTS_ENABLED:'false'});
 const state=verifiedAlertReadiness(env);
 assert.equal(state.live,false);
 assert.equal(state.requirements.scan_scheduler,true);
 assert.equal(state.requirements.discord_webhook,true);
 assert.equal(state.requirements.hosted_quote_permission,false);
 assert.equal(state.requirements.exact_contract_link,false);
 assert.deepEqual(state.missing,['hosted_quote_permission','exact_contract_link']);
 assert.doesNotMatch(JSON.stringify(state),/placeholder|TWILIO|Bearer/);
});
test('protected readiness route still requires an Access assertion',async()=>{
 const {env}=setup();
 Object.assign(env,{CF_ACCESS_AUD:'aud',CF_ACCESS_EMAIL:'user@example.com',CF_ACCESS_TEAM_DOMAIN:'team.cloudflareaccess.com'});
 const r=await handleWatchService(new Request('https://example.com/private/watch/readiness'),env);
 assert.equal(r.status,401);
});
