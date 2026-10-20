import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('staging freshness warning updates while an entry-plan input is focused',()=>{
 const source=readFileSync(new URL('../dashboard-app.js',import.meta.url),'utf8');
 const prefix=source.slice(source.indexOf('function render(){'),source.indexOf(' const all=',source.indexOf('function render(){')))+'\n}';
 let warning;const board={contains:()=>true},session={};
 const ctx={data:{generated_at:'old'},document:{activeElement:{matches:()=>true}},boardAnchor:()=>null,minutes:()=>25,dataDownloadFailed:false,snapshotUsable:()=>false,$:id=>id==='board'?board:session,notice:(id,text)=>warning=text,time:()=> 'old',value:n=>String(n)};
 vm.runInNewContext(prefix+'\nrender();',ctx);assert.match(warning,/STALE \/ RESEARCH ONLY/);
});
