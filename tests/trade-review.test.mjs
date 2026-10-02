import test from 'node:test';import assert from 'node:assert/strict';
import {entryReadiness,trendSummary,observePremiums,premiumChange,positionEstimate,reentryProblem,positionAlerts,validPlan} from '../trade-review.js';
const now=Date.parse('2026-10-01T18:00:00Z'),stamp='2026-10-01T17:59:00Z';
const data={generated_at:stamp,market_session:'OPEN',session_open_at:'2026-10-01T13:30:00Z',session_close_at:'2026-10-01T20:00:00Z'};
test('quality does not turn WATCH into an entry signal; stale triggers stay historical',()=>{
 assert.match(entryReadiness({execution_state:'WATCH',bar_end:stamp},data,now),/WAITING/);
 assert.match(entryReadiness({execution_state:'TRIGGERED',bar_end:stamp},data,now),/VERIFY ENTRY/);
 assert.match(entryReadiness({execution_state:'TRIGGERED',setup_qualified:false,bar_end:stamp},data,now),/SETUP NOT QUALIFIED/);
 assert.match(entryReadiness({execution_state:'TRIGGERED',bar_end:stamp},data,now+600000),/HISTORICAL/);
});
test('premium baseline survives reload, ignores older scans, and separates expirations',()=>{
 const row=ask=>[{ticker:'DKNG',eligible_contracts:[{expiry:'2026-10-02',side:'put',strike:19,ask}]}];
 const a=observePremiums({},row(.19),stamp),b=observePremiums(a,row(.27),'2026-10-01T18:06:00Z');
 const v=Object.values(b)[0];assert.equal(v.firstAsk,.19);assert(Math.abs(premiumChange(v)-42.105263)<.0001);
 assert.deepEqual(observePremiums(b,row(.1),stamp),b);
 assert.equal(Object.keys(observePremiums(b,[{ticker:'DKNG',eligible_contracts:[{expiry:'2026-10-09',side:'put',strike:19,ask:.2}]}],stamp)).length,2);
});
test('unknown bid never becomes zero; mark and bid estimates remain distinct',()=>{
 const t={entry:.27,qty:1,fees:.04,mark:.13};assert.equal(positionEstimate(t,'bid'),null);assert(Math.abs(positionEstimate(t,'mark')+14.04)<1e-9);
 assert.equal(positionEstimate({...t,bid:.1},'bid'),-17.04);
});
test('re-entry confirmation must follow exit and precede actual fill',()=>{
 const old={ticker:'DKNG',contract:'10/2 19 P',exit:.48,time:stamp,closedAt:'2026-10-01T18:00:00Z'};
 const t={...old,exit:null,time:'2026-10-01T18:23:00Z',entryReason:'New break'};
 assert(reentryProblem(t,[old]));assert(reentryProblem({...t,confirmationAt:stamp},[old]));
 assert.equal(reentryProblem({...t,confirmationAt:'2026-10-01T18:22:00Z'},[old]),null);
 assert(reentryProblem({...t,confirmationAt:'2026-10-01T18:24:00Z'},[old]));
});
test('manual risk reminders are based on entered bid and expiration, closed trades excluded',()=>{
 const t={exit:null,expiry:'2026-10-01',bid:.1,lossReview:.12};assert.equal(positionAlerts(t,now).length,2);assert.equal(positionAlerts({...t,exit:.1},now).length,0);assert.equal(positionAlerts({...t,bid:null},now).length,1);
});
test('legacy backups remain valid, malformed optional values rejected',()=>{
 assert(validPlan({}));assert(!validPlan({bid:'oops'}));assert(!validPlan({expiry:'2026-02-30'}));assert(!validPlan({confirmationAt:'bad'}));
});
test('daily context handles old snapshots, missing horizons and historical source failures',()=>{
 const old=trendSummary({});assert.equal(old.alignment,'UNKNOWN');assert(old.periods.every(p=>p.change===null));
 const row={trend_context:{status:'READY',alignment:'AGAINST_TREND',as_of:'2026-10-01',periods:{week:{change_pct:-2,direction:'DOWN',highs:'FALLING',lows:'FALLING'}}}};
 assert.equal(trendSummary(row).alignment,'AGAINST_TREND');assert.equal(trendSummary(row).periods[0].change,-2);
 assert.equal(trendSummary({...row,trend_context:{...row.trend_context,status:'SOURCE_FAILURE'}}).alignment,'UNKNOWN');
});
