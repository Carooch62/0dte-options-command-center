import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

test('staging refuses refresh and private routes even if production secrets were supplied',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('unexpected network');};
 try{
  for(const path of ['/refresh','/private/plaid/status','/private/plaid/robinhood/status']){
   const r=await worker.fetch(new Request('https://preview.example'+path,{method:'POST'}),{APP_ENV:'staging',GITHUB_TOKEN:'test'});
   assert.equal(r.status,403);
  }
  await worker.scheduled({scheduledTime:Date.now()},{APP_ENV:'staging',GITHUB_TOKEN:'test'});
  assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});
test('staging data comes exclusively from staging branch; failure never falls back to production',async()=>{
 const original=globalThis.fetch;const urls=[];
 globalThis.fetch=async url=>{urls.push(String(url));return String(url).includes('staging-environment.json')?Response.json({environment:'staging'}):new Response('missing',{status:404});};
 try{
  const r=await worker.fetch(new Request('https://preview.example/data/market-dashboard.json'),{APP_ENV:'staging'});
  assert.equal(r.status,404);assert.equal(urls.length,2);assert.match(urls[0],/\/staging-algorithm\/data\//);
 }finally{globalThis.fetch=original;}
});

test('staging rejects inherited data until its isolated pipeline initializes',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response('missing',{status:404});};
 try{
  const r=await worker.fetch(new Request('https://preview.example/data/market-dashboard.json'),{APP_ENV:'staging'});
  assert.equal(r.status,503);assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
