import test from 'node:test';
import assert from 'node:assert/strict';
import {newsResearchSummary} from '../dashboard-logic.js';
test('unknown news has no displayed default adaptive allocation',()=>{
 const text=newsResearchSummary({news_research:{mode:'SHADOW',status:'NEEDS_REVIEW',proposed_weights:null}});
 assert.match(text,/No adaptive weight proposed/);assert.doesNotMatch(text,/40%/);
});
test('shadow allocation is identified as experimental with no eligibility effects',()=>{
 const text=newsResearchSummary({news_research:{mode:'SHADOW',status:'ASSESSED',as_of:'2026-10-08T15:00:00Z',horizon:'INTRADAY',proposed_weights:{news:55,patterns:23,volume:10,options:7,risk_reward:5},importance:1,direction:'BEARISH',directional_support:'OPPOSED',dominant_event_id:'event-1',duplicates_removed:1}});
 assert.match(text,/news 55%/);assert.match(text,/BEARISH/);assert.match(text,/Rankings and eligibility unchanged/);
});

test("version 2 allocation policy is visible",()=>{
 const text=newsResearchSummary({news_research:{mode:"SHADOW",status:"ASSESSED",allocation_policy:"GRADUAL_2_5",proposed_weights:{news:42.5,patterns:35.5},importance:1}});
 assert.match(text,/GRADUAL_2_5/);assert.match(text,/news 42.5%/);assert.match(text,/patterns 35.5%/);
});
