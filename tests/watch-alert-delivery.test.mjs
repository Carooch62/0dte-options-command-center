import test from 'node:test';
import assert from 'node:assert/strict';
import {deliverVerifiedOptionAlert} from '../watch-alert-delivery.js';
import {sendDiscordVerifiedOptionAlert} from '../watch-discord.js';

const alert={key:'scan-one:b6864f13-709c-42ba-a6f9-f3dc2bdcbe83',link:'https://robinhood.com/options/example',text:'REVIEW TEST $10 call https://robinhood.com/options/example'};
const values=new Map();
const store={get:async key=>values.get(key),put:async(key,value)=>values.set(key,value)};
const env={WATCH_VERIFIED_ALERTS_ENABLED:'true',WATCH_QUOTE_PILOT_ENABLED:'true',DISCORD_WATCH_WEBHOOK_URL:'https://discord.com/api/webhooks/123/placeholder',WATCH_SMS_ENABLED:'true',TWILIO_ACCOUNT_SID:'AC'+'1'.repeat(32),TWILIO_API_KEY_SID:'SK'+'2'.repeat(32),TWILIO_API_KEY_SECRET:'test-secret',TWILIO_FROM_NUMBER:'+13155550100',WATCH_SMS_TO_NUMBER:'+13155550101',PLAID_STORE:store};
test('separate delivery markers prevent repeated sends on retries',async()=>{
 values.clear();let discord=0,sms=0;
 const send={discord:async()=>{discord++;return {status:'sent'}},sms:async()=>{sms++;throw Error('sms unavailable')}};
 assert.deepEqual(await deliverVerifiedOptionAlert(alert,env,send),{status:'checked',discord:'sent',sms:'failed'});
 assert.deepEqual(await deliverVerifiedOptionAlert(alert,env,{...send,sms:async()=>{sms++;return {status:'sent'}}}),{status:'checked',discord:'already-sent',sms:'sent'});
 assert.equal(discord,1);assert.equal(sms,2);
 assert.deepEqual(await deliverVerifiedOptionAlert(alert,env,send),{status:'checked',discord:'already-sent',sms:'already-sent'});
});
test('switches and destinations default to no delivery',async()=>{
 values.clear();let calls=0;const sender=async()=>{calls++;return {status:'sent'}};
 assert.deepEqual(await deliverVerifiedOptionAlert(alert,{...env,WATCH_VERIFIED_ALERTS_ENABLED:'false'},{discord:sender,sms:sender}),{status:'disabled'});
 assert.deepEqual(await deliverVerifiedOptionAlert(alert,{...env,DISCORD_WATCH_WEBHOOK_URL:null,WATCH_SMS_ENABLED:'false'},{discord:sender,sms:sender}),{status:'checked',discord:'not-configured',sms:'not-configured'});
 assert.equal(calls,0);assert.equal(values.size,0);
});
test('Discord payload cannot mention users and rejects an invalid link',async()=>{
 await sendDiscordVerifiedOptionAlert(alert,env,async(url,options)=>{
  assert.match(url,/^https:\/\/discord.com\/api\/webhooks\//);
  assert.deepEqual(JSON.parse(options.body).allowed_mentions,{parse:[]});return {ok:true};
 });
 await assert.rejects(sendDiscordVerifiedOptionAlert({...alert,link:'https://evil.example/'},env,()=>{throw Error('network called')}),/Invalid verified option alert/);
});
