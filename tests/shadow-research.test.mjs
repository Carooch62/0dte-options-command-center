import test from 'node:test';
import assert from 'node:assert/strict';
import {handleShadowResearch} from '../shadow-research.js';
test('reader uses fixed staging branch, checks isolation marker, never falls back',async()=>{
 const calls=[],fetcher=async url=>{calls.push(url);return calls.length===1?Response.json({environment:'staging'}):Response.json({format:'test'});};
 const r=await handleShadowResearch(new Request('https://example.com/data/staging-shadow-review-queue.json'),fetcher);
 assert.equal(r.status,200);assert.ok(calls.every(url=>url.includes('/staging-algorithm/data/')));assert.ok(calls[1].includes('/shadow-review-queue.json'));assert.equal(r.headers.get('Cache-Control'),'no-store');
});
test('missing marker and unpublished data stay unavailable',async()=>{
 const r=await handleShadowResearch(new Request('https://example.com/data/staging-shadow-outcomes.json'),async()=>Response.json({environment:'production'}));assert.equal(r.status,503);
 let n=0;const missing=await handleShadowResearch(new Request('https://example.com/data/staging-shadow-outcomes.json'),async()=>++n===1?Response.json({environment:'staging'}):new Response('missing',{status:404}));assert.equal(missing.status,404);
});
test('read-only allowlist rejects writes and ignores arbitrary paths',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('unexpected fetch');};
 assert.equal(await handleShadowResearch(new Request('https://example.com/data/staging-shadow-accounts.json'),fetcher),null);
 assert.equal((await handleShadowResearch(new Request('https://example.com/data/staging-shadow-outcomes.json',{method:'POST'}),fetcher)).status,405);assert.equal(calls,0);
});
