import test from 'node:test';
import assert from 'node:assert/strict';
import {handleRobinhood,quoteRequest,quoteAge,normalizeQuotes,rpc} from '../robinhood-live.js';
import worker from '../worker.js';
import {marketSessions} from '../market-session.js';
const host='https://example.workers.dev';
const request=(path,method='GET',headers={},body)=>new Request(`${host}/private/plaid/robinhood/${path}`,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
const base={ROBINHOOD_CONNECTION_ENABLED:'true',ROBINHOOD_CLIENT_ID:'client-test',ROBINHOOD_REDIRECT_URI:host+'/private/plaid/robinhood/callback',PLAID_ENCRYPTION_KEY:Buffer.alloc(32,17).toString('base64'),CF_ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com',CF_ACCESS_AUD:'aud',CF_ACCESS_EMAIL:'me@example.com'};
async function harness(run){
 marketSessions.clear();
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='test';
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const a=enc({alg:'RS256',kid:'test'}),b=enc({iss:'https://test.cloudflareaccess.com',aud:['aud'],email:base.CF_ACCESS_EMAIL,exp:Date.now()/1000+600});
 const sig=Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(`${a}.${b}`))).toString('base64url');
 const auth={'Cf-Access-Jwt-Assertion':`${a}.${b}.${sig}`,Origin:host,'X-Requested-With':'RobinhoodQuotes'};
 const store=new Map(),env={...base,PLAID_STORE:{get:async key=>store.get(key)||null,put:async(key,value)=>store.set(key,value),delete:async key=>store.delete(key)}};
 const original=globalThis.fetch,calls=[];
 let upstream=async()=>{throw Error('Unexpected provider call')};
 globalThis.fetch=async(url,options)=>{if(String(url).endsWith('/cdn-cgi/access/certs'))return new Response(JSON.stringify({keys:[jwk]}));calls.push({url,options});return upstream(url,options);};
 try{await run({env,auth,store,calls,setUpstream:fn=>upstream=fn});}finally{globalThis.fetch=original;}
}
test('anonymous private routes fail closed and never fall through to assets',async()=>{
 assert.equal((await handleRobinhood(request('quotes'),base)).status,401);
 assert.equal((await worker.fetch(request('status'),{ASSETS:{fetch(){throw Error('Asset fallback')}}})).status,401);
});
test('activation gate prevents provider calls and credential access',async()=>harness(async({env,auth,calls})=>{
 assert.equal((await handleRobinhood(request('status','GET',auth),{...env,ROBINHOOD_CONNECTION_ENABLED:'false'})).status,503);
 assert.equal(calls.length,0);
}));
test('cross-origin mutation and non-fixed callback configuration are rejected',async()=>harness(async({env,auth,calls})=>{
 assert.equal((await handleRobinhood(request('connect','POST',{...auth,Origin:'https://evil.test'}),env)).status,403);
 assert.equal((await handleRobinhood(request('status','GET',auth),{...env,ROBINHOOD_REDIRECT_URI:'https://evil.test/callback'})).status,503);
 assert.equal(calls.length,0);
}));
test('OAuth is PKCE protected, state-bound, encrypted and sanitized',async()=>harness(async({env,auth,store,calls,setUpstream})=>{
 const start=await handleRobinhood(request('connect','POST',auth,{}),env),body=await start.json(),url=new URL(body.authorization_url);
 assert.equal(url.origin,'https://robinhood.com');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('code_challenge').length,43);
 const cookie=start.headers.get('Set-Cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Lax/);assert.ok(!cookie.includes('verifier'));assert.equal(calls.length,0);
 const callback=new URL(env.ROBINHOOD_REDIRECT_URI);callback.search=new URLSearchParams({code:'test-code',state:url.searchParams.get('state'),iss:'https://agent.robinhood.com/mcp/trading'});
 const withCookie={...auth,Cookie:cookie.split(';')[0]};
 setUpstream(async(endpoint,options)=>{assert.equal(endpoint,'https://api.robinhood.com/oauth2/token/');const form=options.body;assert.equal(form.get('code_verifier').length,43);assert.equal(form.get('redirect_uri'),env.ROBINHOOD_REDIRECT_URI);return Response.json({access_token:'private-access-token',refresh_token:'unused-refresh-token',token_type:'Bearer',expires_in:3600});});
 const result=await handleRobinhood(new Request(callback,{headers:withCookie}),env);assert.equal(result.status,303);assert.match(result.headers.get('Set-Cookie'),/Max-Age=0/);
 assert.equal(store.size,1);assert.ok(![...store.values()][0].includes('private-access-token'));
 const status=await handleRobinhood(request('status','GET',auth),env),statusText=await status.text();assert.ok(statusText.includes('CONNECTED_UNVERIFIED'));assert.ok(!statusText.includes('token'));
 const bad=new URL(callback);bad.searchParams.set('state','wrong');assert.equal((await handleRobinhood(new Request(bad,{headers:withCookie}),env)).status,400);assert.equal(calls.length,1);
 const missingIssuer=new URL(callback);missingIssuer.searchParams.delete('iss');assert.equal((await handleRobinhood(new Request(missingIssuer,{headers:withCookie}),env)).status,400);
 await handleRobinhood(request('disconnect','POST',auth,{}),env);assert.equal(store.size,0);
}));
test('quote request restricts batch size, identity and operation; cannot place orders',async()=>{
 assert.deepEqual(quoteRequest({kind:'equity',symbols:['JD','JD']}),{name:'get_equity_quotes',arguments:{symbols:['JD']}});
 for(const body of [{kind:'order',symbols:['JD']},{kind:'equity',symbols:['JD',null]},{kind:'equity',symbols:Array(21).fill('JD')},{kind:'option',instrument_ids:['fake']}])assert.throws(()=>quoteRequest(body));
 await assert.rejects(rpc('secret','tools/call',{name:'place_option_order'}),/Market-data/);
 await assert.rejects(rpc('secret','accounts/list'),/Market-data/);
});
test('timestamp freshness never substitutes receipt time for provider time',()=>{
 const now=Date.parse('2026-10-08T14:00:00Z');
 assert.equal(quoteAge(null,now).freshness,'UNKNOWN');assert.equal(quoteAge('2026-10-08T14:01:00Z',now).freshness,'UNKNOWN');
 assert.equal(quoteAge('2026-10-08T13:58:00Z',now).freshness,'STALE_REFRESH');assert.equal(quoteAge('2026-10-08T13:59:59Z',now).age_seconds,1);
});
test('stock bid, ask and trade clocks stay separate; close dates retained; unrelated data excluded',()=>{
 const now=Date.parse('2026-10-08T14:00:00Z'),operation=quoteRequest({kind:'equity',symbols:['JD','AAL']});
 const data=normalizeQuotes({results:[{quote:{symbol:'JD',bid_price:'0',ask_price:'27.10',venue_bid_time:'2026-10-08T13:58:00Z',venue_ask_time:'2026-10-08T13:59:59Z',account_number:'PRIVATE'},close:{symbol:'JD',price:'27.03',date:'2026-10-07',source:'sip-close',interpolated:false}}]},operation,now);
 assert.equal(data.observations[0].quote.bid_price,null);assert.equal(data.observations[0].clocks.bid.freshness,'STALE_REFRESH');assert.equal(data.observations[0].clocks.ask.age_seconds,1);assert.equal(data.observations[0].official_close.date,'2026-10-07');assert.equal(data.observations[0].quote.account_number,undefined);assert.deepEqual(data.missing,['AAL']);
 assert.throws(()=>normalizeQuotes({results:[{quote:{symbol:'BULL'}}]},operation,now),/identity/);
 assert.throws(()=>normalizeQuotes({results:[{quote:{symbol:'JD'}},{quote:{symbol:'JD'}}]},operation,now),/identity/);
});
test('option refresh clock and crossed book are reported without declaring verified latency',()=>{
 const id='f7eca220-0433-41ad-be23-fd44f0a53773',operation=quoteRequest({kind:'option',instrument_ids:[id]}),now=Date.parse('2026-10-08T14:00:00Z');
 const result=normalizeQuotes({results:[{quote:{instrument_id:id,bid_price:'.30',ask_price:'.20',updated_at:'2026-10-08T13:59:58Z',delta:'.4'}}]},operation,now);
 assert.equal(result.observations[0].clocks.refresh.age_seconds,2);assert.equal(result.observations[0].book_status,'CROSSED');
});
test('authenticated quote path measures setup and retrieval without changing freshness claims',async t=>harness(async({env,auth,calls,setUpstream})=>{
 let elapsed=0;t.mock.method(performance,'now',()=>elapsed);
 const started=await handleRobinhood(request('connect','POST',auth,{}),env),target=new URL((await started.json()).authorization_url);
 const cb=new URL(env.ROBINHOOD_REDIRECT_URI);cb.search=new URLSearchParams({code:'code',state:target.searchParams.get('state'),iss:'https://agent.robinhood.com/mcp/trading'});
 setUpstream(async()=>Response.json({access_token:'secret',token_type:'Bearer',expires_in:3600}));
 await handleRobinhood(new Request(cb,{headers:{...auth,Cookie:started.headers.get('Set-Cookie').split(';')[0]}}),env);
 const methods=[];
 const upstream=async(url,options)=>{
  assert.equal(url,'https://agent.robinhood.com/mcp/trading');assert.equal(options.headers.Authorization,'Bearer secret');
  const body=JSON.parse(options.body);methods.push(body.method);
  elapsed+=({'initialize':10,'notifications/initialized':20,'tools/list':30,'tools/call':40})[body.method];
  if(body.method==='initialize')return Response.json({jsonrpc:'2.0',id:body.id,result:{protocolVersion:'2025-03-26'}},{headers:{'Mcp-Session-Id':'session'}});
  assert.equal(options.headers['Mcp-Session-Id'],'session');
  if(body.method==='notifications/initialized')return new Response(null,{status:202});
  if(body.method==='tools/list')return Response.json({jsonrpc:'2.0',id:body.id,result:{tools:[{name:'place_option_order'},{name:'get_equity_quotes'}]}});
  assert.equal(body.params.name,'get_equity_quotes');
  return new Response(`event: message\ndata: ${JSON.stringify({jsonrpc:'2.0',id:body.id,result:{structuredContent:{data:{results:[{quote:{symbol:'JD',bid_price:'27.00',ask_price:'27.02',venue_bid_time:new Date().toISOString(),venue_ask_time:new Date().toISOString(),account_number:'never-return'}}]}}}})}\n\n`,{headers:{'Content-Type':'text/event-stream'}});
 };setUpstream(upstream);
 const result=await handleRobinhood(request('quotes','POST',auth,{kind:'equity',symbols:['JD']}),env),text=await result.text();
 assert.equal(result.status,200);assert.ok(!text.includes('secret'));assert.ok(!text.includes('never-return'));assert.equal(JSON.parse(text).latency_verified,false);assert.equal(JSON.parse(text).scanner_feed,'DELAYED_RESEARCH');
 assert.deepEqual(methods,['initialize','notifications/initialized','tools/list','tools/call']);
 assert.deepEqual(JSON.parse(text).request_timing,{setup_ms:60,quote_ms:40,worker_ms:100,setup_reused:false,setup_mode:'session',setup_cache_status:'miss'});
 const second=await handleRobinhood(request('quotes','POST',auth,{kind:'equity',symbols:['JD']}),env),secondData=await second.json();
 assert.equal(second.status,200);assert.deepEqual(methods,['initialize','notifications/initialized','tools/list','tools/call','tools/call']);
 assert.deepEqual(secondData.request_timing,{setup_ms:0,quote_ms:40,worker_ms:40,setup_reused:true,setup_mode:'session',setup_cache_status:'hit'});
 assert.equal(secondData.latency_verified,false);
 setUpstream(async()=>new Response(null,{status:503}));
 const failed=await handleRobinhood(request('quotes','POST',auth,{kind:'equity',symbols:['JD']}),env);
 assert.equal(failed.status,502);
 setUpstream(upstream);const beforeRecovery=methods.length;
 const recovered=await handleRobinhood(request('quotes','POST',auth,{kind:'equity',symbols:['JD']}),env),recoveredData=await recovered.json();
 assert.equal(recovered.status,200);assert.equal(recoveredData.request_timing.setup_reused,false);
 assert.deepEqual(methods.slice(beforeRecovery),['initialize','notifications/initialized','tools/list','tools/call']);
 await handleRobinhood(request('disconnect','POST',auth,{}),env);
 const beforeDenied=methods.length;
 assert.equal((await handleRobinhood(request('quotes','POST',auth,{kind:'equity',symbols:['JD']}),env)).status,409);
 assert.equal(methods.length,beforeDenied);
 assert.equal(result.headers.get('Cache-Control'),'no-store');
}));

test('candidate and metadata routes require Access and reject cross-origin and invalid contracts',async()=>harness(async({env,auth,calls})=>{
 assert.equal((await handleRobinhood(request('candidates'),env)).status,401);
 assert.equal((await handleRobinhood(request('resolve','POST',{...auth,Origin:'https://evil.test'},{contracts:[]}),env)).status,403);
 assert.equal((await handleRobinhood(request('resolve','POST',auth,{contracts:[{ticker:'SPY',strike:772,side:'order',expiry:'2026-10-16'}]}),env)).status,400);
 assert.equal(calls.length,0);
}));
test('stateless provider setup is reused, protocols are explicit, and a failure evicts without automatic retry',async()=>harness(async({env,auth,setUpstream})=>{
 const start=await handleRobinhood(request('connect','POST',auth,{}),env),target=new URL((await start.json()).authorization_url);
 const callback=new URL(env.ROBINHOOD_REDIRECT_URI);callback.search=new URLSearchParams({code:'code',state:target.searchParams.get('state'),iss:'https://agent.robinhood.com/mcp/trading'});
 setUpstream(async()=>Response.json({access_token:'stateless-secret',token_type:'Bearer',expires_in:3600}));
 await handleRobinhood(new Request(callback,{headers:{...auth,Cookie:start.headers.get('Set-Cookie').split(';')[0]}}),env);
 const methods=[];let fail=false;
 setUpstream(async(_,options)=>{
  const body=JSON.parse(options.body);methods.push(body.method);
  assert.equal(options.headers['Mcp-Session-Id'],undefined);
  if(body.method==='initialize')return Response.json({result:{protocolVersion:'2025-03-26'}});
  assert.equal(options.headers['MCP-Protocol-Version'],'2025-03-26');
  if(body.method==='notifications/initialized')return new Response(null,{status:202});
  if(body.method==='tools/list')return Response.json({result:{tools:[{name:'get_equity_quotes'}]}});
  if(fail)return new Response(null,{status:503});
  return Response.json({result:{structuredContent:{data:{results:[{quote:{symbol:'JD',bid_price:'1',ask_price:'1.01',venue_bid_time:new Date().toISOString(),venue_ask_time:new Date().toISOString()}}]}}}});
 });
 const get=()=>handleRobinhood(request('quotes','POST',auth,{kind:'equity',symbols:['JD']}),env);
 const first=await (await get()).json();assert.equal(first.request_timing.setup_mode,'stateless');assert.equal(first.request_timing.setup_reused,false);
 const second=await (await get()).json();assert.equal(second.request_timing.setup_reused,true);assert.equal(second.request_timing.setup_cache_status,'hit');
 assert.deepEqual(methods,['initialize','notifications/initialized','tools/list','tools/call','tools/call']);
 assert.equal(second.latency_verified,false);assert.ok(!JSON.stringify(second).includes('stateless-secret'));
 fail=true;assert.equal((await get()).status,502);assert.equal(methods.length,6);
 fail=false;const recovered=await (await get()).json();assert.equal(recovered.request_timing.setup_reused,false);
 assert.deepEqual(methods.slice(6),['initialize','notifications/initialized','tools/list','tools/call']);
}));
test('private scanner route projects the fixed main source without needing stored broker credentials',async()=>harness(async({env,auth,setUpstream})=>{
 setUpstream(async(url)=>{assert.match(url,/^https:\/\/raw.githubusercontent.com\/Carooch62\/0dte-options-command-center\/main\/data\/candidate-quote-batch.json\?v=\d+$/);return Response.json({format:'candidate-identities-v1',selection_policy:'published-research-screens-v1',max_per_ticker:2,generated_at:'2026-10-14T14:00:00Z',included_contracts:1,total_contracts:1,qualifying_contracts:1,omitted_contracts:0,candidates:[{ticker:'SPY',options:[{strike:772,side:'put',expiry:'2026-10-16',scanner_ask:.2}]}]});});
 const r=await handleRobinhood(request('candidates','GET',auth),env);assert.equal(r.status,200);assert.equal((await r.json()).snapshot.included_contracts,1);assert.equal(r.headers.get('Cache-Control'),'no-store');
}));
test('authenticated metadata path discovers only read-only tools and sanitizes exact match',async()=>harness(async({env,auth,setUpstream})=>{
 const started=await handleRobinhood(request('connect','POST',auth,{}),env),target=new URL((await started.json()).authorization_url);
 const cb=new URL(env.ROBINHOOD_REDIRECT_URI);cb.search=new URLSearchParams({code:'code',state:target.searchParams.get('state'),iss:'https://agent.robinhood.com/mcp/trading'});
 setUpstream(async()=>Response.json({access_token:'secret',token_type:'Bearer',expires_in:3600}));
 await handleRobinhood(new Request(cb,{headers:{...auth,Cookie:started.headers.get('Set-Cookie').split(';')[0]}}),env);
 const chain='11111111-1111-1111-1111-111111111111',id='22222222-2222-2222-2222-222222222222';const operations=[];
 setUpstream(async(url,options)=>{
  const b=JSON.parse(options.body);if(b.method==='initialize')return Response.json({result:{protocolVersion:'2025-03-26'}});
  if(b.method==='notifications/initialized')return new Response(null,{status:202});
  if(b.method==='tools/list')return Response.json({result:{tools:[{name:'get_option_chains'},{name:'get_option_instruments'},{name:'place_option_order'}]}});
  operations.push(b.params.name);
  const data=b.params.name==='get_option_chains'?{chains:[{id:chain,expiration_dates:['2026-10-16']}]}:{instruments:[{id,chain_id:chain,chain_symbol:'SPY',expiration_date:'2026-10-16',strike_price:'772',type:'put',state:'active',tradability:'tradable',trade_value_multiplier:'100',sellout_datetime:'2026-10-16T19:45:00Z',account_number:'PRIVATE'}]};
  return Response.json({result:{structuredContent:{data}}});
 });
 const r=await handleRobinhood(request('resolve','POST',auth,{contracts:[{ticker:'SPY',strike:772,side:'put',expiry:'2026-10-16'}]}),env),text=await r.text();assert.equal(r.status,200);assert.ok(!text.includes('PRIVATE'));assert.ok(!text.includes('secret'));assert.equal(JSON.parse(text).results[0].status,'EXACT_METADATA_MATCH');assert.deepEqual(operations,['get_option_chains','get_option_instruments']);
}));

