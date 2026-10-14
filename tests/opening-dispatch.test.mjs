import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const workflow=await readFile(new URL('../.github/workflows/shadow-validation-once.yml',import.meta.url),'utf8');
const script=workflow.split('script: |\n')[1].split('\n').map(line=>line.replace(/^ {12}/,'')).join('\n');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function run(stamp,active=false){
 const dispatched=[],github={rest:{actions:{listWorkflowRuns:async()=>({data:{workflow_runs:active?[{status:'in_progress'}]:[]}}),createWorkflowDispatch:async args=>dispatched.push(args)}}};
 class FixedDate extends Date{constructor(){super(stamp);}}
 await new AsyncFunction('github','context','core','Date',script)(github,{repo:{owner:'Carooch62',repo:'0dte-options-command-center'}},{notice(){}},FixedDate);
 return dispatched;
}
test('one-time dispatch starts after the completed opening bar and targets staging only',async()=>{
 assert.equal((await run('2026-10-15T13:35:00Z')).length,0);
 const dispatched=await run('2026-10-15T13:36:00Z');assert.equal(dispatched.length,1);assert.equal(dispatched[0].ref,'staging-algorithm');assert.equal(dispatched[0].workflow_id,'staging-scan.yml');
});
test('active runs, session close and future annual cron matches cannot trigger extra scans',async()=>{
 assert.equal((await run('2026-10-15T13:36:00Z',true)).length,0);
 assert.equal((await run('2026-10-15T20:00:00Z')).length,0);
 assert.equal((await run('2027-10-15T13:36:00Z')).length,0);
});
