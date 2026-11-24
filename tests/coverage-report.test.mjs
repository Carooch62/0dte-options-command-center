import test from 'node:test';
import assert from 'node:assert/strict';
import {coverageReport,boardAvailability} from '../coverage-report.js';

test('reports attempted coverage and limits missed-candidate conclusions', () => {
  assert.deepEqual(coverageReport({chains_attempted: 76, chains_not_attempted: 130}), {
    summary: 'Option-chain checks: 76/206 (36.9%).', incomplete: true,
  });
  assert.equal(coverageReport({chains_attempted: 10, chains_not_attempted: 0}).incomplete, true);
  assert.equal(coverageReport({}).summary, 'Option-chain coverage unknown.');
  assert.equal(coverageReport({chains_attempted: 10, chains_not_attempted: -1}).incomplete, true);
});

test('attempted failures and unknown chains remain incomplete even at full coverage', () => {
  for (const status of ['SOURCE_FAILURE','EMPTY_UNVERIFIED','UNKNOWN']) {
    assert.equal(coverageReport({chains_attempted: 10, chains_not_attempted: 0, chain_status_counts:{SUCCESS:9,[status]:1}}).incomplete,true);
  }
  assert.equal(coverageReport({chains_attempted:10,chains_not_attempted:0,chain_status_counts:{NO_EXPIRATION_TODAY:10}}).incomplete,false);
});

test('source gaps identify missing stocks and bounded failed symbols without inferring missing identities', async () => {
  const {sourceGaps}=await import('../coverage-report.js');
  assert.equal(sourceGaps({stocks_received:200,stocks_configured:205},[{ticker:'XLU',chain_status:'SOURCE_FAILURE'},{ticker:'IWM',chain_status:'SUCCESS'}]),'Missing stock rows: 5/205. Failed option sources: XLU.');
  assert.equal(sourceGaps({},[]),'');
  assert.match(sourceGaps({},Array.from({length:14},(_,i)=>({ticker:'T'+i,chain_status:'SOURCE_FAILURE'}))),/\(\+2 more\)/);
});

test('empty board distinguishes missing delta data, no chains and filter exclusions', () => {
  const unverified={side:'call',delta:0,greeks_verified:false};
  assert.match(boardAvailability([{options:[unverified]},{options:[]}],0),/2 stock rows loaded.*None of the 1 returned contracts has verified delta/);
  assert.match(boardAvailability([{options:[]}],0),/No option contracts were returned/);
  assert.match(boardAvailability([],0),/availability is unknown/);
  const verified={side:'call',delta:.4,delta_verified:true};
  assert.match(boardAvailability([{options:[verified]}],0),/do not pass all selected filters/);
  assert.doesNotMatch(boardAvailability([{options:[verified]}],1),/blocked|missing provider/);
  for(const o of [{...verified,delta:0},{...verified,delta:2},{...verified,delta_verified:false,greeks_verified:true}])assert.match(boardAvailability([{options:[o]}],0),/None of the 1 returned/);
});

test('verified delta coverage does not imply quote freshness or invent legacy counts', async()=>{
 const {sourceGaps}=await import('../coverage-report.js');
 assert.match(sourceGaps({same_day_contract_observations:20,same_day_verified_delta_observations:0}),/Verified delta: 0\/20/);
 assert.match(sourceGaps({same_day_contract_observations:20,same_day_verified_delta_observations:5}),/freshness and entry checks remain separate/);
 assert.equal(sourceGaps({same_day_contract_observations:2,same_day_verified_delta_observations:3}),'');
 assert.equal(sourceGaps({}),'');
});


test('full attempts need reconciled numeric status counts before coverage is complete',()=>{
 for(const counts of [null,{}, {SUCCESS:9},{SUCCESS:11},{SUCCESS:'10'},{SUCCESS:10,UNKNOWN:-1},{SUCCESS:10,UNKNOWN:NaN},['SUCCESS']])
  assert.equal(coverageReport({chains_attempted:10,chains_not_attempted:0,chain_status_counts:counts}).incomplete,true);
 assert.equal(coverageReport({chains_attempted:10,chains_not_attempted:0,chain_status_counts:{SUCCESS:9,NO_EXPIRATION_TODAY:1}}).incomplete,false);
 for(const attempted of ['10',true,null])assert.equal(coverageReport({chains_attempted:attempted,chains_not_attempted:0,chain_status_counts:{SUCCESS:10}}).summary,'Option-chain coverage unknown.');
});
