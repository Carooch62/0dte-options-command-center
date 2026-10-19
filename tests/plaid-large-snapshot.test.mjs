import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduledPlaidSync} from '../plaid-sync.js';

test('large provider snapshot encrypts and round-trips without an argument-stack overflow',async()=>{
 const secret=Buffer.alloc(32,17),key=await crypto.subtle.importKey('raw',secret,'AES-GCM',false,['encrypt','decrypt']);
 const seal=async value=>{const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(value)));return JSON.stringify({iv:Buffer.from(iv).toString('base64'),value:Buffer.from(encrypted).toString('base64')});};
 const store=new Map([['connection',await seal({access_token:'synthetic-token',item_id:'synthetic-item'})],['snapshot','previous snapshot'],['sync-error','previous failure']]);
 const env={PLAID_CLIENT_ID:'synthetic',PLAID_SECRET:'synthetic',PLAID_ENV:'sandbox',PLAID_ENCRYPTION_KEY:secret.toString('base64'),CF_ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com',CF_ACCESS_AUD:'test',CF_ACCESS_EMAIL:'me@example.com',PLAID_STORE:{get:async k=>store.get(k)||null,put:async(k,v)=>store.set(k,v),delete:async k=>store.delete(k)}};
 const transactions=Array.from({length:150},(_,i)=>({investment_transaction_id:'synthetic-'+i,name:'Synthetic \u2603 \u{1f9ea} '.repeat(250),quantity:1}));
 const original=globalThis.fetch;
 globalThis.fetch=async url=>Response.json(String(url).endsWith('/investments/holdings/get')?{accounts:[],holdings:[],securities:[]}:{investment_transactions:transactions,total_investment_transactions:transactions.length,securities:[]});
 try{
  assert.equal(await scheduledPlaidSync(env),'updated',store.get('sync-error'));
  assert.equal(store.has('sync-error'),false);
  const saved=JSON.parse(store.get('snapshot'));
  assert.ok(Buffer.from(saved.value,'base64').length>500000);
  const decoded=JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(saved.iv,'base64')},key,Buffer.from(saved.value,'base64'))));
  assert.deepEqual(decoded.transactions,transactions);
  assert.equal(decoded.coverage.complete,true);
  assert.ok(!store.get('snapshot').includes('Synthetic'));
  const good=store.get('snapshot');globalThis.fetch=async()=>{throw Error('Synthetic provider unavailable');};
  assert.equal(await scheduledPlaidSync(env),'failed');
  assert.equal(store.get('snapshot'),good);
 }finally{globalThis.fetch=original;}
});
