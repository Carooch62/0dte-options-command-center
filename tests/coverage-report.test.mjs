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
