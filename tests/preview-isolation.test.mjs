import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker,{scheduledScan} from '../worker.js';
test('preview denies every private route and scan dispatch even with credentials present',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('Unexpected network request');};
 const env={APP_ENV:'preview',GITHUB_TOKEN:'synthetic',PLAID_STORE:{get(){throw Error('Unexpected storage access');}}};
 try{
 for(const path of ['/private/plaid/status','/private/plaid/robinhood/quotes','/private/plaid/robinhood/connect','/refresh']){
  const r=await worker.fetch(new Request('https://example.test'+path,{method:'POST'}),env);assert.equal(r.status,403);
 }
 assert.equal(await scheduledScan(env,new Date('2026-10-16T15:00:00Z')),'preview-disabled');
 await worker.scheduled({scheduledTime:Date.parse('2026-10-16T15:31:00Z')},env);
 const health=await (await worker.fetch(new Request('https://example.test/health'),env)).json();assert.equal(health.environment,'preview');
 assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});
test('preview serves browser assets without private storage',async()=>{
 const r=await worker.fetch(new Request('https://example.test/candidate-quotes'),{APP_ENV:'preview',ASSETS:{fetch:async()=>new Response('preview interface')}});
 assert.equal(await r.text(),'preview interface');
});
test('preview config excludes production KV and cron settings',async()=>{
 const text=await readFile(new URL('../wrangler.toml',import.meta.url),'utf8');
 const preview=text.split('[previews]')[1];assert.ok(preview);assert.match(preview,/kv_namespaces = \[\]/);assert.match(preview,/APP_ENV = "preview"/);
 assert.ok(!preview.includes('c141007029b0432abe871df0e27c3bdf'));assert.ok(!preview.includes('crons'));
});
