import test from 'node:test';
import assert from 'node:assert/strict';
import {deliverVerifiedOptionAlert} from '../watch-alert-delivery.js';
import {sendDiscordVerifiedOptionAlert} from '../watch-discord.js';

const alert={key:'scan-one:b6864f13-709c-42ba-a6f9-f3dc2bdcbe83',link:'https://robinhood.com/options/example',text:'REVIEW TEST $10 call https://robinhood.com/options/example'};
const values=new Map();
const store={get:async key=>values.get(key),put:async(key,value)=>values.set(key,value)};
const env={WATCH_VERIFIED_ALERTS_ENABLED:'true',WATCH_QUOTE_PILOT_ENABLED:'true',DISCORD_WATCH_WEBHOOK_URL:'https://discord.com/api/webhooks/123/placeholder',PLAID_STORE:store};
test('a verified Discord alert is checkpointed after successful delivery',async()=>{
 values.clear();let sent=0;
 const send={discord:async()=>{sent++;return {status:'sent'}}};
 assert.deepEqual(await deliverVerifiedOptionAlert(alert,env,send),{status:'sent'});
 assert.deepEqual(await deliverVerifiedOptionAlert(alert,env,send),{status:'already-sent'});
 assert.equal(sent,1);
});
test('disabled switches or missing webhook never send',async()=>{
 values.clear();let sent=0;const send={discord:async()=>{sent++;return {status:'sent'}}};
 assert.deepEqual(await deliverVerifiedOptionAlert(alert,{...env,WATCH_VERIFIED_ALERTS_ENABLED:'false'},send),{status:'disabled'});
 assert.deepEqual(await deliverVerifiedOptionAlert(alert,{...env,DISCORD_WATCH_WEBHOOK_URL:null},send),{status:'not-configured'});
 assert.equal(sent,0);assert.equal(values.size,0);
});
test('delivery failures retain the alert for retry',async()=>{
 values.clear();let sent=0;
 assert.deepEqual(await deliverVerifiedOptionAlert(alert,env,{discord:async()=>{sent++;throw Error('network')}}),{status:'failed'});
 assert.equal(values.size,0);
 assert.deepEqual(await deliverVerifiedOptionAlert(alert,env,{discord:async()=>{sent++;return {status:'sent'}}}),{status:'sent'});
 assert.equal(sent,2);
});
test('Discord message disables mentions and rejects an invalid link',async()=>{
 await sendDiscordVerifiedOptionAlert(alert,env,async(url,options)=>{
  assert.match(url,/^https:\/\/discord.com\/api\/webhooks\//);
  assert.deepEqual(JSON.parse(options.body).allowed_mentions,{parse:[]});return {ok:true};
 });
 await assert.rejects(sendDiscordVerifiedOptionAlert({...alert,link:'https://evil.example/'},env,()=>{throw Error('network called')}),/Invalid verified option alert/);
});
