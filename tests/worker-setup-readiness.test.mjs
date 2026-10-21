import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectWorkerBindings,REQUIRED_BINDINGS} from '../scripts/worker-setup-readiness.mjs';
const complete=()=>({bindings:REQUIRED_BINDINGS.map(name=>({name}))});
test('transient empty or malformed deployment metadata is retried before readiness is decided',async()=>{
 const responses=[{}, {bindings:null},complete()],waits=[];
 const result=await inspectWorkerBindings(async()=>responses.shift(),async ms=>waits.push(ms));
 assert.deepEqual(result,{missing:[],attempts:3});assert.deepEqual(waits,[1000,2000]);
});
test('persistently missing prerequisites never become ready and inspection stays bounded',async()=>{
 let reads=0;const waits=[];
 const result=await inspectWorkerBindings(async()=>{reads++;return {bindings:[{name:'PLAID_STORE'},null,{name:23}]};},async ms=>waits.push(ms));
 assert.equal(reads,5);assert.equal(result.attempts,5);assert.deepEqual(result.missing,REQUIRED_BINDINGS.filter(name=>name!=='PLAID_STORE'));assert.deepEqual(waits,[1000,2000,4000,8000]);
});
test('ready metadata needs no wait and upstream errors are not converted into missing bindings',async()=>{
 assert.deepEqual(await inspectWorkerBindings(async()=>complete(),async()=>assert.fail('unexpected wait')),{missing:[],attempts:1});
 await assert.rejects(inspectWorkerBindings(async()=>{throw Error('API unavailable');},async()=>{}),/API unavailable/);
});
