import assert from 'node:assert/strict';
import test from 'node:test';
import worker,{ScanCoordinator} from '../worker.js';

test('manual and scheduled requests share one dispatch reservation until GitHub lists the run',async t=>{
  const storage=new Map();
  let sequence=Promise.resolve();
  const state={
    storage:{get:async key=>storage.get(key),put:async(key,value)=>storage.set(key,value),delete:async key=>storage.delete(key)},
    blockConcurrencyWhile(callback){
      const work=sequence.then(callback);
      sequence=work.catch(()=>{});
      return work;
    }
  };
  const coordinator=new ScanCoordinator(state,{GITHUB_TOKEN:'fixture'});
  let runs=[];
  const requests=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(url.includes('/runs?'))return Response.json({workflow_runs:runs});
    requests.push(JSON.parse(options.body).inputs);
    return new Response(null,{status:204});
  });
  const request=async(id,scheduled=false)=>{
    const response=await coordinator.fetch(new Request('https://coordinator/dispatch',{
      method:'POST',body:JSON.stringify({id,scheduled,mode:'manual'})
    }));
    return response.json();
  };
  assert.deepEqual(await Promise.all([request('manual-first'),request('scheduled-next',true)]),[{status:'dispatched'},{status:'already-running',activeRequestId:'manual-first'}]);
  assert.equal((await request('manual-first')).status,'already-requested');
  runs=[{display_title:'Scan manual-first (manual)',status:'in_progress'}];
  const refresh=await worker.fetch(new Request('https://example.org/refresh',{
    method:'POST',headers:{Origin:'https://carooch62.github.io','Content-Type':'application/json'},
    body:JSON.stringify({request_id:'manual-next'})
  }),{GITHUB_TOKEN:'fixture',SCAN_COORDINATOR:{idFromName:()=>0,get:()=>({fetch:(url,options)=>coordinator.fetch(new Request(url,options))})}});
  assert.equal(refresh.status,409);
  const conflict=await refresh.json();
  assert.equal(conflict.status,'ALREADY_RUNNING');
  assert.equal(conflict.active_request_id,'manual-first');
  assert.equal(requests.length,1);
  runs[0].status='completed';
  assert.equal((await request('manual-next')).status,'dispatched');
  assert.equal(requests.length,2);
});

test('an ambiguous GitHub response suppresses an immediate duplicate dispatch',async t=>{
  const storage=new Map();
  const coordinator=new ScanCoordinator({
    storage:{get:async key=>storage.get(key),put:async(key,value)=>storage.set(key,value),delete:async key=>storage.delete(key)},
    blockConcurrencyWhile:callback=>callback()
  },{GITHUB_TOKEN:'fixture'});
  let posts=0;
  t.mock.method(globalThis,'fetch',async url=>{
    if(url.includes('/runs?'))return Response.json({workflow_runs:[]});
    posts++;
    throw Error('network timeout');
  });
  const request=id=>coordinator.fetch(new Request('https://coordinator/dispatch',{
    method:'POST',body:JSON.stringify({id,scheduled:false,mode:'manual'})
  }));
  assert.equal((await request('manual-first')).status,502);
  assert.equal((await (await request('manual-second')).json()).status,'already-running');
  assert.equal(posts,1);
});
