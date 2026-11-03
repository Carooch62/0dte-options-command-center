import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduledWatchCheck} from './watch-service.js';
const watch={ticker:'TEST',direction:'UP',contract_id:'TEST261106C00011000',expiry:'2026-11-06',side:'call',strike:11};
const old={scan_id:'old',generated_at:'2026-11-02T14:45:00Z',candidates:[{ticker:'TEST',direction:'UP',execution_state:'WATCH'}]};
const next={scan_id:'new',generated_at:'2026-11-02T14:50:00Z',candidates:[{ticker:'TEST',direction:'UP',execution_state:'TRIGGERED'}]};
const now=Date.parse('2026-11-02T14:51:00Z');
function setup(){let state={watches:[watch],previous:old,deliveredKeys:[]};const env={WATCH_ALERTS_ENABLED:'true',DISCORD_WATCH_WEBHOOK_URL:'https://discord.com/api/webhooks/123/placeholder',PLAID_STORE:{get:async()=>JSON.stringify(state),put:async(k,v)=>{state=JSON.parse(v)}}};return {env,get:()=>state};}
test('disabled service never fetches or sends',async()=>{const {env}=setup();env.WATCH_ALERTS_ENABLED='false';assert.equal(await scheduledWatchCheck(env,now,()=>{throw Error('network called')}),'disabled');});
test('successful scan sends once and checkpoints',async()=>{const {env,get}=setup();let sent=0;const fetcher=async url=>url.includes('raw.githubusercontent.com')?{ok:true,json:async()=>next}:(sent++,{ok:true});assert.equal(await scheduledWatchCheck(env,now,fetcher),'sent');assert.equal(sent,1);assert.equal(get().previous.scan_id,'new');assert.equal(await scheduledWatchCheck(env,now,fetcher),'unchanged');assert.equal(sent,1);});
test('failed Discord send keeps old scan for retry',async()=>{const {env,get}=setup();const fetcher=async url=>url.includes('raw.githubusercontent.com')?{ok:true,json:async()=>next}:{ok:false,status:429};await assert.rejects(scheduledWatchCheck(env,now,fetcher),/HTTP 429/);assert.equal(get().previous.scan_id,'old');assert.deepEqual(get().deliveredKeys,[]);});
