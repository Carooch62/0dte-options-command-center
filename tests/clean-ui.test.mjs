import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../dashboard-clean-app.js',import.meta.url),'utf8');
test('clean saved view restores the view saved in the same UI',()=>{
 const storage=new Map(),control={value:'UP'},shortcuts={};
 const context={shortcuts,filterDefaults:{direction:'ALL'},$:()=>control,save:(k,v)=>{storage.set(k,v);return true;},read:(k,f)=>storage.get(k)??f,restoreFilters:v=>{control.value=v.direction;},applyFilters:()=>{}};
 vm.runInNewContext(source.split('\n').find(l=>l.startsWith('shortcuts.onclick=')),context);
 shortcuts.onclick({target:{dataset:{view:'save'}}});control.value='DOWN';
 shortcuts.onclick({target:{dataset:{view:'restore'}}});assert.equal(control.value,'UP');
});
test('clean filter restoration migrates the old all-states default once',()=>{
 const block=source.slice(source.indexOf('const storedFilters='),source.indexOf('const shortcuts=',source.indexOf('const storedFilters=')));
 let restored;const saved=[];
 const run=(filters,migrated)=>{
  vm.runInNewContext(block,{read:(key)=>key==='0dteCleanDashboardFilters'?filters:migrated,save:(key,value)=>saved.push([key,value]),restoreFilters:value=>restored=value});
 };
 run({askMax:'0.25',state:'ALL'},false);
 assert.equal(restored.askMax,'0.25');assert.equal(restored.state,'ACTIVE');
 assert.equal(saved[0][0],'0dteSkipDefaultMigrated');
 run({askMax:'0.25',state:'ALL'},true);
 assert.equal(restored.state,'ALL');
});
test('freshness warning updates during a focused entry-plan edit',()=>{
 const prefix=source.slice(source.indexOf('function render(){'),source.indexOf(' const all=',source.indexOf('function render(){')))+'\n}';
 let warning;const board={contains:()=>true},session={};
 const ctx={data:{generated_at:'old'},document:{activeElement:{matches:()=>true}},boardAnchor:()=>null,renderContractWatches:()=>{},minutes:()=>25,dataDownloadFailed:false,snapshotUsable:()=>false,$:id=>id==='board'?board:session,notice:(id,text)=>warning=text,time:()=> 'old',value:n=>String(n)};
 vm.runInNewContext(prefix+'\nrender();',ctx);assert.match(warning,/STALE \/ RESEARCH ONLY/);
});

test('production scanner freshness still updates while an entry-plan input has focus',()=>{
 const app=readFileSync(new URL('../dashboard-app.js',import.meta.url),'utf8');
 const prefix=app.slice(app.indexOf('function render(){'),app.indexOf(' const all=',app.indexOf('function render(){')))+'\n}';
 let warning;const board={contains:()=>true},session={};
 const ctx={data:{generated_at:'old'},document:{activeElement:{matches:()=>true}},boardAnchor:()=>null,minutes:()=>25,dataDownloadFailed:false,snapshotUsable:()=>false,$:id=>id==='board'?board:session,notice:(id,text)=>warning=text,time:()=> 'old',value:n=>String(n)};
 vm.runInNewContext(prefix+'\nrender();',ctx);assert.match(warning,/STALE \/ RESEARCH ONLY/);
});

test('current scanner layouts label source timestamps in Eastern rather than browser-local time',()=>{
 for(const file of ['dashboard-app.js','dashboard-clean-app.js']){
  const app=readFileSync(new URL('../'+file,import.meta.url),'utf8');
  const line=app.split('\n').find(l=>l.startsWith('const money='));
  const format=new Function('finite',line+';return time;')(()=>null);
  assert.match(format('2026-10-19T14:00:00Z'),/10:00:00 AM ET/);
  assert.match(format('2026-12-01T15:00:00Z'),/10:00:00 AM ET/);
  assert.equal(format('bad'),'Unknown');
 }
});

test('streamlined status legend explains all displayed scanner states without implying a live entry',()=>{
 const html=readFileSync(new URL('../dashboard_clean.html',import.meta.url),'utf8');
 const legend=html.slice(html.indexOf('<details id="statusLegend"'),html.indexOf('id="candidateBoard"'));
 assert.match(legend,/<details id="statusLegend">/);
 for(const state of ['WATCH','SECOND-WAVE','TRIGGERED','LEVEL CROSSED · UNQUALIFIED','CONFIRMED DELAYED','DECAYING','SKIP','NO RECORDED STATUS','STALE PRICE DATA','STALE SCAN','DATA UNAVAILABLE','MARKET CLOSED']){
  assert.ok(legend.includes(state),state);
 }
 assert.match(legend,/not a live option entry/);
 assert.match(legend,/not a live broker quote/i);
});

test('All stocks exposes skipped rows and collapsed summary names the actual state filter',()=>{
 const controls={onlyContracts:{value:'starred'},state:{value:'ACTIVE'}};let persisted=0,rendered=0;
 const ctx={$:id=>controls[id]||(controls[id]={}),persistFilters:()=>persisted++,render:()=>rendered++};
 vm.runInNewContext(source.split('\n').find(l=>l.startsWith("$('allStocks').onclick=")),ctx);
 controls.allStocks.onclick();
 assert.equal(controls.state.value,'ALL');assert.equal(controls.onlyContracts.value,'all');assert.equal(persisted,1);assert.equal(rendered,1);
 const summary=source.split('\n').find(l=>l.includes("$('filterSummary').textContent="));
 const output={};
 vm.runInNewContext(summary,{$:id=>id==='filterSummary'?output:id==='state'?{selectedOptions:[{textContent:'Watch states (default)'}]}:{value:'0.10'},changed:[],money:()=>'$0.10'});
 assert.match(output.textContent,/Watch states \(default\)/);assert.doesNotMatch(output.textContent,/All candidates/);
});
