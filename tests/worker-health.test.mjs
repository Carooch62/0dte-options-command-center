import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

test('health exposes an unfinished run without a runner even without request ID',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('/jobs')?{jobs:[{name:'scan',runner_name:'',steps:[]}]}:{workflow_runs:[{id:12,status:'queued',created_at:'2026-10-05T19:26:38Z'}]}),{status:200});
 try{
  const response=await worker.fetch(new Request('https://example.test/health'),{GITHUB_TOKEN:'test'});
  const {latestRun}=await response.json();
  assert.equal(latestRun.waitingForRunner,true);
  assert.match(latestRun.publicationNote,/scheduled requests are skipped/);
 }finally{globalThis.fetch=original;}
});

test('failed run without steps is distinguished from a scanner source error',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('/jobs')?{jobs:[{name:'scan',runner_name:'',steps:[]}]}:{workflow_runs:[{id:12,status:'completed',conclusion:'failure',created_at:'2026-10-05T19:26:38Z'}]}),{status:200});
 try{
  const {latestRun}=await (await worker.fetch(new Request('https://example.test/health'),{GITHUB_TOKEN:'test'})).json();
  assert.equal(latestRun.waitingForRunner,false);
  assert.match(latestRun.publicationNote,/without an assigned runner/);
 }finally{globalThis.fetch=original;}
});
