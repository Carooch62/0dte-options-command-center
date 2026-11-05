import test from 'node:test';
import assert from 'node:assert/strict';
import {smsOptionText,sendTwilioOptionSms} from '../watch-sms.js';
const alert={ticker:'TEST',side:'call',strike:10,expiry:'2026-11-05',bid:.24,ask:.26,observed_at:'2026-11-05T15:31:00Z',link:'https://robinhood.com/options/example'};
const env={TWILIO_ACCOUNT_SID:'AC'+'1'.repeat(32),TWILIO_API_KEY_SID:'SK'+'2'.repeat(32),TWILIO_API_KEY_SECRET:'test-secret',TWILIO_FROM_NUMBER:'+13155550100',WATCH_SMS_TO_NUMBER:'+13155550101'};
test('SMS includes exact contract, quote and link with bounded size',()=>{
 const text=smsOptionText(alert);
 assert.match(text,/TEST \$10 CALL 2026-11-05/);
 assert.match(text,/ask \$0.26/);assert.match(text,/robinhood.com\/options\/example/);
 assert.ok(text.length<=300);
 assert.throws(()=>smsOptionText({...alert,link:'https://robinhood.com/options/'+ 'a'.repeat(300)}),/cost limit/);
 assert.throws(()=>smsOptionText({...alert,link:'https://evil.example/options/example'}),/Invalid SMS alert/);
});
test('no secrets means no network; provider request uses account-scoped endpoint',async()=>{
 assert.deepEqual(await sendTwilioOptionSms(alert,{},()=>{throw Error('network')}),{status:'not-configured'});
 let calls=0;
 assert.deepEqual(await sendTwilioOptionSms(alert,env,async(url,request)=>{
  calls++;assert.match(url,/^https:\/\/api.twilio.com\/2010-04-01\/Accounts\/AC/);
  assert.equal(request.body.get('To'),env.WATCH_SMS_TO_NUMBER);
  assert.equal(request.body.get('Body'),smsOptionText(alert));
  return {status:201};
 }),{status:'sent'});assert.equal(calls,1);
 await assert.rejects(sendTwilioOptionSms(alert,env,async()=>({status:429})),/rejected/);
});
