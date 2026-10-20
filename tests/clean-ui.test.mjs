import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../dashboard-clean-app.js',import.meta.url),'utf8');
test('clean saved view restores the view saved in the same UI',()=>{
 const storage=new Map(),control={value:'UP'},shortcuts={};
 const context={shortcuts,filterDefaults:{direction:'ALL'},$:()=>control,save:(k,v)=>{storage.set(k,v);return true;},read:(k,f)=>storage.get(k)??f,restoreFilters:v=>{control.value=v.direction;},persistFilters:()=>{},render:()=>{}};
 vm.runInNewContext(source.split('\n').find(l=>l.startsWith('shortcuts.onclick=')),context);
 shortcuts.onclick({target:{dataset:{view:'save'}}});control.value='DOWN';
 shortcuts.onclick({target:{dataset:{view:'restore'}}});assert.equal(control.value,'UP');
});
test('clean filter restoration uses its own saved preferences',()=>{
 let key,restored;vm.runInNewContext(source.split('\n').find(l=>l.startsWith('restoreFilters(read(')),{read:k=>{key=k;return {askMax:'0.25'};},restoreFilters:v=>restored=v});
 assert.equal(key,'0dteCleanDashboardFilters');assert.equal(restored.askMax,'0.25');
});
test('freshness warning updates during a focused entry-plan edit',()=>{
 const prefix=source.slice(source.indexOf('function render(){'),source.indexOf(' const all=',source.indexOf('function render(){')))+'\n}';
 let warning;const board={contains:()=>true},session={};
 const ctx={data:{generated_at:'old'},document:{activeElement:{matches:()=>true}},boardAnchor:()=>null,minutes:()=>25,dataDownloadFailed:false,snapshotUsable:()=>false,$:id=>id==='board'?board:session,notice:(id,text)=>warning=text,time:()=> 'old',value:n=>String(n)};
 vm.runInNewContext(prefix+'\nrender();',ctx);assert.match(warning,/STALE \/ RESEARCH ONLY/);
});

test('production scanner freshness still updates while an entry-plan input has focus',()=>{
 const app=readFileSync(new URL('../dashboard-app.js',import.meta.url),'utf8');
 const prefix=app.slice(app.indexOf('function render(){'),app.indexOf(' const all=',app.indexOf('function render(){')))+'\n}';
 let warning;const board={contains:()=>true},session={};
 const ctx={data:{generated_at:'old'},document:{activeElement:{matches:()=>true}},boardAnchor:()=>null,minutes:()=>25,dataDownloadFailed:false,snapshotUsable:()=>false,$:id=>id==='board'?board:session,notice:(id,text)=>warning=text,time:()=> 'old',value:n=>String(n)};
 vm.runInNewContext(prefix+'\nrender();',ctx);assert.match(warning,/STALE \/ RESEARCH ONLY/);
});
