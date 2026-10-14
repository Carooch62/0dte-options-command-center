import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCandidates,contractRequest,resolveContracts,readSnapshot} from '../private-candidates.js';
const c={ticker:'SPY',expiry:'2026-10-16',strike:772,side:'put'},chain='11111111-1111-1111-1111-111111111111',id='22222222-2222-2222-2222-222222222222';
const instrument=()=>({id,chain_id:chain,chain_symbol:c.ticker,expiration_date:c.expiry,strike_price:'772.0000',type:'put',state:'active',tradability:'tradable',trade_value_multiplier:'100',sellout_datetime:'2026-10-16T19:45:00Z',account_number:'never-return'});
const provider=(items=[instrument()],next)=>async(name,args)=>name==='get_option_chains'?{chains:[{id:chain,expiration_dates:[c.expiry]}]}:{instruments:items,next};
test('private projection deduplicates, filters research asks, bounds globally, preserves scan time and scores',()=>{
 const snapshot={generated_at:'2026-10-14T14:02:44Z',candidates:[{ticker:'SPY',score:99,options:Array.from({length:25},(_,n)=>({...c,strike:700+n,ask:.30})),expiry_groups:{x:{options:[{...c,strike:700,ask:.30},{...c,strike:800,ask:.31},{...c,strike:900,ask:null}]}}}]};
 const before=JSON.stringify(snapshot),p=projectCandidates(snapshot);
 assert.equal(p.included_contracts,20);assert.equal(p.total_contracts,25);assert.equal(p.omitted_contracts,5);assert.equal(p.scanned_contracts,27);assert.equal(p.generated_at,snapshot.generated_at);assert.equal(JSON.stringify(snapshot),before);assert.equal(p.candidates[0].score,undefined);
});
test('invalid/zero/nonfinite asks and malformed identities are excluded; invalid snapshot is rejected',()=>{
 const p=projectCandidates({generated_at:'2026-10-14T14:00:00Z',candidates:[{ticker:'SPY',options:[...[-1,0,null,'Infinity',''].map(ask=>({...c,ask})),{...c,ask:.20,expiry:'2026-02-30'}]}]});assert.equal(p.included_contracts,0);assert.throws(()=>projectCandidates({candidates:[]}));
});
test('bounded snapshot reader rejects both announced and streamed oversize',async()=>{
 await assert.rejects(readSnapshot(new Response('abc',{headers:{'Content-Length':'30'}}),2),/limit/);
 await assert.rejects(readSnapshot(new Response('abc'),2),/limit/);
});
test('contract requests reject excessive, duplicate, invalid dates and arbitrary operations',()=>{
 assert.deepEqual(contractRequest({contracts:[c]}),[c]);
 for(const body of [{contracts:[]},{contracts:Array(21).fill(c)},{contracts:[c,c]},{contracts:[{...c,expiry:'2026-02-30'}]},{contracts:[{...c,side:'order'}]}])assert.throws(()=>contractRequest(body));
});
test('exact metadata is sanitized and all chains for an expiration are queried',async()=>{
 const calls=[];const call=async(name,args)=>{calls.push({name,args});return provider()(name,args);};
 const r=await resolveContracts([c],call);assert.equal(r[0].status,'EXACT_METADATA_MATCH');assert.equal(r[0].instrument.account_number,undefined);assert.equal(calls[1].args.chain_id,chain);assert.equal(calls[1].args.strike_price,'772');
 const second='33333333-3333-3333-3333-333333333333';
 const ambiguous=await resolveContracts([c],async(name,args)=>name==='get_option_chains'?{chains:[chain,second].map(id=>({id,expiration_dates:[c.expiry]}))}:{instruments:[{...instrument(),id:args.chain_id,chain_id:args.chain_id}]});
 assert.equal(ambiguous[0].status,'AMBIGUOUS_CONTRACT');assert.equal(ambiguous[0].instrument,null);
});
test('missing, malformed, mismatched and incomplete metadata never produce a mapping',async()=>{
 assert.equal((await resolveContracts([c],provider([])))[0].status,'NO_CONTRACT_MATCH');
 for(const key of ['chain_symbol','chain_id','expiration_date','type','strike_price','id']){const i=instrument();i[key]='wrong';await assert.rejects(resolveContracts([c],provider([i])),/identity/);}
 assert.equal((await resolveContracts([c],provider([instrument()],'repeat')))[0].status,'INCOMPLETE_METADATA');
});
test('compact round trip preserves timestamps and refuses malformed coverage and large batches',async()=>{
 const source={generated_at:'2026-10-14T14:00:00Z',candidates:[{ticker:'SPY',options:[{...c,ask:.20}]}]},p=projectCandidates(source);
 assert.deepEqual(await readSnapshot(Response.json(p)),p);
 await assert.rejects(readSnapshot(Response.json({...p,included_contracts:3})),/coverage/);
 await assert.rejects(readSnapshot(Response.json({...p,candidates:Array(21).fill(p.candidates[0])})),/batch/);
});
test('generation removes obsolete batches when retained snapshot is unreadable without failing the scan',async()=>{
 const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {writeCandidateBatch}=await import('../scripts/write-candidate-batch.mjs');
 const dir=await mkdtemp(join(tmpdir(),'candidate-batch-'));
 try{await writeFile(join(dir,'market-dashboard.json'),JSON.stringify({generated_at:'2026-10-14T14:00:00Z',candidates:[{ticker:'SPY',options:[{...c,ask:.2}]}]}));assert.equal((await writeCandidateBatch(dir)).status,'AVAILABLE');assert.equal(JSON.parse(await readFile(join(dir,'candidate-quote-batch.json'),'utf8')).generated_at,'2026-10-14T14:00:00Z');await writeFile(join(dir,'market-dashboard.json'),'bad');assert.equal((await writeCandidateBatch(dir)).status,'UNAVAILABLE');await assert.rejects(readFile(join(dir,'candidate-quote-batch.json')));}finally{await rm(dir,{recursive:true,force:true});}
});
