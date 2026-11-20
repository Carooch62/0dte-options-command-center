import test from 'node:test';
import assert from 'node:assert/strict';
import {coverageReport} from '../coverage-report.js';

test('reports attempted coverage and limits missed-candidate conclusions', () => {
  assert.deepEqual(coverageReport({chains_attempted: 76, chains_not_attempted: 130}), {
    summary: 'Option-chain checks: 76/206 (36.9%).', incomplete: true,
  });
  assert.equal(coverageReport({chains_attempted: 10, chains_not_attempted: 0}).incomplete, false);
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
