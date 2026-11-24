import test from 'node:test';
import assert from 'node:assert/strict';
import {RobinhoodCoordinator,privateStorageOwner} from '../robinhood-live.js';

test('storage identity survives coordinator restart and a corrected login email without reading tokens',async()=>{
 const values=new Map();let queue=Promise.resolve();
 const state={storage:{get:async k=>values.get(k),put:async(k,v)=>values.set(k,v)},blockConcurrencyWhile:fn=>{const r=queue.then(fn);queue=r.catch(()=>{});return r;}};
 const legacyReads=[];
 const original={CF_ACCESS_EMAIL:'OLD@example.test',PLAID_STORE:{get:async k=>{legacyReads.push(k);return null;}}};
 const first=new RobinhoodCoordinator(state,original);
 const internal=(owner,path)=>owner.fetch(new Request('https://internal'+path,{method:'POST'}));
 assert.deepEqual(await (await internal(first,'/storage-owner-ready')).json(),{ready:false});
 assert.equal(values.size,0);
 const pinned=await (await internal(first,'/storage-owner')).json();
 assert.deepEqual(await (await internal(first,'/storage-owner-ready')).json(),{ready:true});
 assert.equal(pinned.email,'old@example.test');assert.deepEqual(legacyReads,[]);
 const corrected={...original,CF_ACCESS_EMAIL:'corrected@example.test'};
 const restarted=new RobinhoodCoordinator(state,corrected);
 corrected.ROBINHOOD_COORDINATOR={idFromName:name=>{assert.equal(name,'private-robinhood-owner');return name;},get:()=>({fetch:url=>internal(restarted,new URL(url).pathname)})};
 assert.equal(await privateStorageOwner(corrected),'old@example.test');
 assert.deepEqual(await (await internal(restarted,'/token')).json(),{connection:null,authorization_present:false,renewal_supported:false});
 assert.deepEqual(legacyReads,['robinhood-live:connection:old@example.test']);
 assert.equal(values.get('storage-owner-email-v1'),'old@example.test');
});

test('corrupt persisted mapping fails closed instead of selecting a new owner',async()=>{
 const state={storage:{get:async()=>'',put:async()=>{throw Error('Must not replace mapping');}},blockConcurrencyWhile:fn=>fn()};
 const owner=new RobinhoodCoordinator(state,{CF_ACCESS_EMAIL:'new@example.test'});
 await assert.rejects(owner.fetch(new Request('https://internal/storage-owner')),/mapping unavailable/);
});
