import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspect,classify} from '../scripts/cloudflare-build-diagnostics.mjs';
test('denied API never discloses provider body and uses GET only',async()=>{
  const result=await inspect({token:'private-token',account:'a'.repeat(32),fetcher:async(url,options)=>{assert.equal(options.method,'GET');assert.equal(options.redirect,'error');return {ok:false,status:403,json(){throw Error('must not read');}};}});
  assert.equal(result.acceptance,'INCOMPLETE');assert.equal(result.outcomes[0].status,'HTTP_403');assert.ok(!JSON.stringify(result).includes('private-token'));
});
test('log classification emits fixed categories only',()=>{assert.deepEqual(classify(['private-token npm ERR authentication error']),['AUTHORIZATION','DEPENDENCY']);});
test('successful bounded reads omit settings and raw log secrets',async()=>{
 const responses=[[{id:'0dte-options-command-center',tag:'abc'}],{previews_enabled:true,secret:'DO_NOT_EMIT'},[{build_uuid:'a'.repeat(8)+'-aaaa-aaaa-aaaa-'+ 'a'.repeat(12),build_outcome:'fail'}],{lines:['DO_NOT_EMIT npm ERR'],truncated:true}];
 const result=await inspect({token:'private-token',account:'a'.repeat(32),fetcher:async()=>({ok:true,json:async()=>({success:true,result:responses.shift()})})});
 assert.equal(result.acceptance,'READ_ACCESS_CHECKED');assert.equal(result.builds[0].logsTruncated,true);assert.ok(!JSON.stringify(result).includes('DO_NOT_EMIT'));
});
test('explicit historical IDs are read even when absent from recent history',async()=>{
 const id='c2a4779d-51c6-40ce-811e-f783f28ca357',paths=[];
 const responses=[[{id:'0dte-options-command-center',tag:'abc'}],{previews_enabled:true},[],{lines:['command not found PRIVATE'],truncated:false}];
 const result=await inspect({token:'private-token',account:'a'.repeat(32),buildIds:[id],fetcher:async(url)=>{paths.push(url);return {ok:true,json:async()=>({success:true,result:responses.shift()})};}});
 assert.ok(paths.at(-1).endsWith(`/builds/${id}/logs`));assert.equal(result.builds[0].outcome,'UNKNOWN');assert.deepEqual(result.builds[0].categories,['MISSING_COMMAND']);assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
test('invalid build ID rejected before making any request',async()=>{
 await assert.rejects(inspect({token:'private-token',account:'a'.repeat(32),buildIds:['../../tokens'],fetcher:()=>{throw Error('must not fetch');}}),/Invalid build IDs/);
});
