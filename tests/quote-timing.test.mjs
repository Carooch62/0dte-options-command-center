import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteRequestTiming} from '../quote-timing.js';
test('timing accepts bounded numeric durations and excludes unrelated private fields',()=>{
 assert.deepEqual(quoteRequestTiming({setup_ms:1.4,quote_ms:2.6,worker_ms:7,browser_ms:9,access_token:'secret',session:'private'}),{setup_ms:1,quote_ms:3,worker_ms:7,browser_ms:9});
 for(const value of [null,[],true,'secret'])assert.deepEqual(quoteRequestTiming(value),{});
 assert.deepEqual(quoteRequestTiming({setup_ms:-1,quote_ms:Infinity,worker_ms:'5',browser_ms:600001}),{});
 assert.deepEqual(quoteRequestTiming({setup_ms:0,browser_ms:600000}),{setup_ms:0,browser_ms:600000});
});

test('setup reuse flag is a strict optional boolean; historical exports remain unknown',()=>{
 assert.deepEqual(quoteRequestTiming({setup_ms:2,setup_reused:true,session:'private'}),{setup_ms:2,setup_reused:true});
 assert.deepEqual(quoteRequestTiming({setup_reused:false}),{setup_reused:false});
 assert.deepEqual(quoteRequestTiming({setup_reused:'true'}),{});
 assert.equal(Object.hasOwn(quoteRequestTiming({setup_ms:2}),'setup_reused'),false);
});
test('setup diagnostics accept only named modes and cache states without identifiers',()=>{
 assert.deepEqual(quoteRequestTiming({setup_mode:'stateless',setup_cache_status:'hit',session:'SECRET'}),{setup_mode:'stateless',setup_cache_status:'hit'});
 assert.deepEqual(quoteRequestTiming({setup_mode:'secret-token',setup_cache_status:'private-session'}),{});
});
