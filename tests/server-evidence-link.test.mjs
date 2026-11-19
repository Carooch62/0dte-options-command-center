import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceExportLink} from '../server-evidence-link.js';
test('UTC date produces a fixed same-origin private export link',()=>{
 assert.deepEqual(evidenceExportLink('2026-11-18'),{href:'/private/plaid/robinhood/evidence?day=2026-11-18',label:'Export server quote evidence · 2026-11-18 UTC'});
});
test('invalid dates and path injection never produce export links',()=>{
 for(const value of ['',null,'2026-02-30','2026-13-01','2026-1-01','2026-11-18&day=other','https://example.com'])assert.throws(()=>evidenceExportLink(value));
});
