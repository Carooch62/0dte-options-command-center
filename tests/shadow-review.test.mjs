import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReviewRows,validateQueue,outcomeSummary} from '../shadow-review.js';
const queue=()=>({format:'shadow-review-queue-v1',packet_id:'a'.repeat(64),generated_at:'2026-10-14T15:00:00Z',captured_at:'2026-10-14T15:01:00Z',coverage:{included:1,qualifying:1},candidates:[{candidate_id:'TEST',evidence_gaps:['QUOTE_CLOCK_UNKNOWN']}]});
test('raw review does not claim validated scoring and late reviews are explicit',()=>{
 const q=queue(),r=buildReviewRows(q,{packet_id:q.packet_id,records:[{candidate_id:'TEST',evidence_set_id:q.packet_id,as_of:q.captured_at,reviewed_at:'2026-10-14T15:02:00Z'}]},null)[0];
 assert.equal(r.review_status,'REVIEW_SUPPLIED_UNVALIDATED');assert.ok(r.reasons.includes('REVIEW_AFTER_CUTOFF'));assert.equal(r.replay_status,'NOT_RUN');
});
test('replay must match packet and exact cutoff; withholding reasons stay visible',()=>{
 const q=queue(),report={packet_id:q.packet_id,as_of:q.captured_at,scored:[],withheld:[{candidate_id:'TEST',reasons:['NEWS:UNKNOWN']}]};
 assert.equal(buildReviewRows(q,null,report)[0].replay_status,'WITHHELD');assert.throws(()=>buildReviewRows(q,null,{...report,packet_id:'b'.repeat(64)}));
});
test('duplicate identities rejected and outcomes distinguish missing from measured',()=>{
 const q=queue();q.candidates.push({...q.candidates[0]});assert.throws(()=>validateQueue(q));
 assert.match(outcomeSummary({format:'shadow-outcomes-v1',results:[{windows:[{status:'WITHHELD_ENTRY_QUOTE'}]}]}),/0 quote-based windows.*1 withheld/);
});
test('later prospective cutoff is displayed and cannot precede capture',()=>{
 const q=queue(),cutoff='2026-10-14T15:03:00Z',corpus={packet_id:q.packet_id,as_of:cutoff,records:[{candidate_id:'TEST',evidence_set_id:q.packet_id,as_of:cutoff,reviewed_at:'2026-10-14T15:02:00Z'}]};
 const rows=buildReviewRows(q,corpus,{packet_id:q.packet_id,as_of:cutoff,scored:[{candidate_id:'TEST'}],withheld:[]});
 assert.ok(rows[0].reasons.some(x=>x.includes('Later declared decision cutoff')));assert.ok(!rows[0].reasons.includes('REVIEW_AFTER_CUTOFF'));
 assert.throws(()=>buildReviewRows(q,{...corpus,as_of:'2026-10-14T14:59:00Z'},null));
});
test('fixed score contributions are displayed only when weights and totals agree',()=>{
 const q=queue(),components=Object.fromEntries(Object.entries({news:40,patterns:38,volume:10,options:7,risk_reward:5}).map(([k,w])=>[k,{score:50,weight_pct:w,contribution:w/2}]));
 const r={packet_id:q.packet_id,as_of:q.captured_at,scored:[{candidate_id:'TEST',reference_score:50,reference_components:components}],withheld:[]};
 const row=buildReviewRows(q,null,r)[0];assert.equal(row.fixed_score,50);assert.match(row.fixed_components,/news 20.00 \(40%\)/);
 components.news.contribution=40;assert.throws(()=>buildReviewRows(q,null,r),/contributions/);
 components.news.contribution=20;r.scored[0].reference_score=99;assert.throws(()=>buildReviewRows(q,null,r),/does not match/);
});
