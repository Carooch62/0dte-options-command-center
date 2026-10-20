import test from 'node:test';
import assert from 'node:assert/strict';
import {MarketSessionCache} from '../market-session.js';
test('warm setup avoids negotiation but expires at TTL and before authorization',async()=>{
 let now=1000,calls=0;const cache=new MarketSessionCache({ttlMs:100,maxEntries:2,now:()=>now});
 const init=async()=>{calls++;return {session:'private-session',access_token:'must-not-retain'};};
 assert.equal((await cache.get('token-hash:options',100000,init)).reused,false);
 const warm=await cache.get('token-hash:options',100000,init);assert.equal(warm.reused,true);assert.deepEqual(warm.value,{session:'private-session'});assert.equal(calls,1);
 now=1100;assert.equal((await cache.get('token-hash:options',100000,init)).reused,false);assert.equal(calls,2);
 await assert.rejects(cache.get('token-hash:options',now+15000,init),/expiry/);assert.equal(calls,2);
});
test('keys isolate tokens and operations; invalidated sessions initialize again',async()=>{
 let calls=0;const cache=new MarketSessionCache({now:()=>0});
 const init=async()=>({session:'session-'+(++calls)});
 for(const key of ['token-a:quotes','token-b:quotes','token-a:metadata'])assert.equal((await cache.get(key,100000,init)).reused,false);
 assert.equal((await cache.get('token-a:quotes',100000,init)).reused,true);
 cache.drop('token-a:quotes');assert.equal((await cache.get('token-a:quotes',100000,init)).reused,false);
 cache.dropPrefix('token-a:');assert.equal((await cache.get('token-a:metadata',100000,init)).reused,false);
 assert.equal((await cache.get('token-b:quotes',100000,init)).reused,true);
});
test('cache is bounded, failed setup is not retained and stateless providers are not reused',async()=>{
 const cache=new MarketSessionCache({maxEntries:2,now:()=>0}),init=async()=>({session:'s'});
 for(const key of ['a','b','c'])await cache.get(key,100000,init);
 assert.equal((await cache.get('a',100000,init)).reused,false);
 await assert.rejects(cache.get('failed',100000,async()=>{throw Error('setup failed');}));
 assert.equal((await cache.get('failed',100000,init)).reused,false);
 for(let n=0;n<2;n++)assert.equal((await cache.get('stateless',100000,async()=>({session:null}))).reused,false);
 assert.throws(()=>new MarketSessionCache({maxEntries:0}));
});
