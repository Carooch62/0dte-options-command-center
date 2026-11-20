import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {projectRecoveryBatch,validateRecoveryBatch} from '../private-recovery.js';
import {projectCandidates,readSnapshot} from '../private-candidates.js';
import {writeRecoveryBatches} from '../scripts/write-recovery-batches.mjs';
const option=(dte=0,extra={})=>({expiry:dte?'2026-11-27':'2026-11-20',dte,side:'call',strike:100,bid:.19,ask:.20,volume:30,delta:0,greeks_verified:false,quote_valid:true,tight_spread:true,near_atm:true,expiry_verified:true,source:'Nasdaq public chain',...extra});
const source=(extra={})=>({generated_at:'2026-11-20T15:00:00Z',scan_id:'synthetic',market_session:'OPEN',candidates:[{ticker:'TEST',price:100,direction:'UP',options:[option()],expiry_groups:{week:{options:[option(7)]}}}],...extra});
test('recovery is separate, bounded public metadata; production projection stays empty',()=>{
 const s=source(),before=JSON.stringify(s);
 for(const window of ['today','week']){
  const b=projectRecoveryBatch(s,window);assert.equal(b.included_contracts,1);assert.equal(b.qualifying_contracts,0);assert.equal(b.eligibility_effect,'NONE');assert.equal(b.generated_at,s.generated_at);assert.deepEqual(validateRecoveryBatch(b,window),b);
  assert.throws(()=>validateRecoveryBatch(b,window==='today'?'week':'today'));
 }
 assert.equal(projectCandidates(s).included_contracts,0);assert.equal(JSON.stringify(s),before);
 const many=source({candidates:Array.from({length:15},(_,n)=>({ticker:'TEST'+n,price:100,direction:'UP',options:[option(0,{strike:99}),option(),option(0,{strike:101})]}))});
 const b=projectRecoveryBatch(many,'today');assert.equal(b.included_contracts,20);assert.equal(b.research_seed_contracts,45);assert.equal(b.omitted_contracts,25);
 for(const c of b.candidates)assert.ok(b.candidates.filter(x=>x.ticker===c.ticker).length<=2);
});
test('only delta is deferred; numeric quality, direction, expiry and source checks stay required',()=>{
 const exclusions=[{delta:.4,delta_verified:true},{source:'Private broker quote'},{ask:.31},{bid:0},{bid:.1},{volume:19},{strike:104},{side:'put'},{expiry:'2026-11-21'},{dte:7},{quote_valid:false},{tight_spread:false},{near_atm:false},{expiry_verified:false},{delta:'.4',greeks_verified:true}];
 for(const extra of exclusions){const s=source();s.candidates[0].options=[option(0,extra)];assert.equal(projectRecoveryBatch(s,'today').included_contracts,0,JSON.stringify(extra));}
 const s=source();s.candidates[0].options.push({...option(),bid:.18});assert.throws(()=>projectRecoveryBatch(s,'today'),/Conflicting/);
});
test('recovery cannot masquerade as eligible batch; injected private fields are dropped',async()=>{
 const b=projectRecoveryBatch(source(),'today');
 await assert.rejects(readSnapshot(Response.json(b)),/batch/);
 for(const extra of [{eligibility_effect:'PASS'},{qualifying_contracts:1},{included_contracts:2},{omitted_contracts:-1},{expiration_window:'month'}])assert.throws(()=>validateRecoveryBatch({...b,...extra},'today'));
 const injected=structuredClone(b);injected.account_number='SECRET';injected.candidates[0].holdings='SECRET';injected.candidates[0].options[0].broker_quote='SECRET';
 const sanitized=await readSnapshot(Response.json(injected),65536,x=>validateRecoveryBatch(x,'today'));
 assert.ok(!JSON.stringify(sanitized).includes('SECRET'));
});
test('both recovery files share one source clock and invalid input removes stale artifacts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'recovery-batch-'));
 try{
  await writeFile(join(dir,'market-dashboard.json'),JSON.stringify(source()));
  assert.equal((await writeRecoveryBatches(dir)).status,'RESEARCH_ONLY');
  for(const window of ['today','week'])assert.equal(JSON.parse(await readFile(join(dir,`quote-recovery-${window}.json`))).generated_at,source().generated_at);
  await writeFile(join(dir,'market-dashboard.json'),'bad');assert.equal((await writeRecoveryBatches(dir)).status,'UNAVAILABLE');
  for(const window of ['today','week'])await assert.rejects(readFile(join(dir,`quote-recovery-${window}.json`)));
 }finally{await rm(dir,{recursive:true,force:true});}
});
