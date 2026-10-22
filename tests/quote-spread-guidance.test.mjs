import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteGuidance} from '../quote-evidence.js';

test('wide spread guidance explains both limits without granting eligibility',()=>{
 const row={reasons:['WIDE_SPREAD'],spread:.4,spread_pct:190.47619,ask:.41,premium_status:'UNKNOWN'};
 const before=JSON.stringify(row),text=quoteGuidance(row);
 assert.match(text,/\$0.400 \/ 190.5% of midpoint/);
 assert.match(text,/limits: \$0.10 and 30% of midpoint/);
 assert.match(text,/Both limits must pass/);
 assert.match(text,/Live ask is also above \$0.30/);
 assert.equal(JSON.stringify(row),before);
});
test('cheap wide books still fail; absent spread diagnostics stay unknown',()=>{
 assert.doesNotMatch(quoteGuidance({reasons:['WIDE_SPREAD'],spread:.03,spread_pct:31.58,ask:.11}),/also above/);
 assert.doesNotMatch(quoteGuidance({reasons:['WIDE_SPREAD']}),/NaN|limits:/);
 assert.match(quoteGuidance({reasons:['STALE_QUOTE','WIDE_SPREAD'],spread:.03,spread_pct:31.58}),/31.6%/);
});
