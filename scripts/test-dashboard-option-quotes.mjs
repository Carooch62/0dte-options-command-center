import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const files=new Set(['dashboard_liquid.html','dashboard-clean-app.js','dashboard-option-quotes.js','dashboard-quote-validation.js','quote-poller.js','dashboard-position-plans.js','coverage-report.js','dashboard-logic.js','dashboard-delivery.js','dashboard-mobile.css','dashboard-workspace.css','connection-ui.css','trade-review.js','signal-checklist.js','refresh-progress.js','contract-watch.js','trade-exit-assistant.js','exit-benchmarks.js','candidate-quotes.js','private-request.js','robinhood-review.js','quote-timing.js']);
const origin='https://0dte-options-command-center.h69htk56cq.workers.dev',stamp='2026-11-19T18:00:00Z',id='22222222-2222-4222-8222-222222222222';
const option={contract_id:'TEST261120C00100000',expiry:'2026-11-20',side:'call',strike:100,bid:.19,ask:.20,delta:.4,delta_verified:true,quote_valid:true,delta_ok:true,tight_spread:true,near_atm:true,expiry_verified:true,volume:100,spread:.01,spread_pct:5,distance_pct:1};
const contract={ticker:'TEST',contract_id:option.contract_id,expiry:option.expiry,side:option.side,strike:option.strike};
const fixture={generated_at:stamp,scan_id:'synthetic-private',market_session:'OPEN',session_open_at:'2026-11-19T14:30:00Z',session_close_at:'2026-11-19T21:00:00Z',coverage:{},candidates:[{ticker:'TEST',price:100,direction:'UP',score:1,execution_state:'WATCH',bar_end:stamp,options:[option],eligible_contracts:[option],preferred_contracts:[option],news_items:[],chain_status:'SUCCESS'}]};
const browser=await chromium.launch({headless:true});
try{for(const width of [390,1280]){
 const page=await browser.newPage({viewport:{width,height:844},timezoneId:'America/New_York'}),errors=[],calls=[];let failure=false,wrong=false,quoteTime=stamp,autoClock=false;let remotePlans=[],positionCalls=[];
 await page.addInitScript(({origin,contract,stamp})=>{if(location.origin===origin)localStorage.setItem('0dteJournal',JSON.stringify([{id:'synthetic-fill',ticker:contract.ticker,contract:contract.contract_id,expiry:contract.expiry,entry:.18,qty:1,fees:0,exit:null,time:stamp,lossReview:.14,target:.27}]));},{origin,contract,stamp});
 page.on('dialog',d=>d.accept(d.message().toLowerCase().includes('fees')?'0':'0.25'));
 page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date(stamp)});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url()),path=url.pathname.slice(1);
  if(path.startsWith('private/plaid/robinhood/position-plans')){
   if(route.request().method()==='GET')return route.fulfill({json:{ok:true,plans:remotePlans,poll_seconds:300,enabled:true,discord_configured:true,last_check:null}});
   const body=route.request().postDataJSON();positionCalls.push({path,body});
   if(path.endsWith('/test'))return route.fulfill({json:{ok:true,test_id:'synthetic-test'}});
   if(path.endsWith('/pause')){remotePlans=remotePlans.map(p=>p.id===body.id?{...p,active:false,revision:p.revision+1}:p);return route.fulfill({json:{ok:true,plan:remotePlans.find(p=>p.id===body.id)}});}
   assert.equal(body.plan.confirmed,true);if(body.plan.active){assert.equal(body.delivery_test_id,'synthetic-test');assert.equal(body.delivery_confirmed,true);}
   const plan={...body.plan,revision:body.expected_revision+1};remotePlans=[plan];return route.fulfill({json:{ok:true,plan}});
  }
  if(path==='private/plaid/robinhood/resolve'){
   calls.push('resolve');return route.fulfill({json:{results:[{status:'EXACT_METADATA_MATCH',contract,instrument:{id,chain_symbol:'TEST',strike_price:wrong?101:100,type:'call',expiration_date:option.expiry,state:'active',tradability:'tradable',trade_value_multiplier:100,sellout_datetime:'2026-11-20T20:45:00Z'}}]}});
  }
  if(path==='private/plaid/robinhood/quotes'){
   calls.push('quotes');assert.deepEqual(route.request().postDataJSON(),{kind:'option',instrument_ids:[id]});return route.fulfill(failure?{status:401,json:{error:'synthetic sign in'}}:{json:{received_at:await page.evaluate(()=>new Date().toISOString()),observations:[{quote:{instrument_id:id,bid_price:'.19',ask_price:'.20',updated_at:autoClock?await page.evaluate(()=>new Date().toISOString()):quoteTime}}]}});
  }
  if(path.startsWith('data/')||path.includes('/data/'))return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:path.endsWith('market-dashboard-today.json')?{...fixture,delivery_window:'today'}:path.endsWith('market-dashboard.json')?fixture:{status:'SUCCESS'}});
  if(path==='health')return route.fulfill({json:{ok:true,latestRun:null}});
  if(!files.has(path))return route.abort();
  return route.fulfill({contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html',body:await readFile(new URL('../'+path,import.meta.url))});
 });
 // Public dashboard links hand off identity, never request private data cross-origin.
 await page.goto('https://carooch62.github.io/dashboard_liquid.html');
 const link=page.locator('#board .purchase-action [data-rh-quote]');try{await link.waitFor();}catch(e){console.log({errors,board:await page.locator('#board').innerText()});throw e;}
 const href=await link.getAttribute('href');assert.ok(href.startsWith(origin+'/dashboard_liquid.html'));assert.deepEqual(calls,[]);
 // Private dashboard is still the real rendered UI; hash handoff does not auto-fetch.
 await page.goto(href);await page.locator('#privateOptionQuote').waitFor({state:'visible'});assert.deepEqual(calls,[]);
 await page.getByRole('button',{name:'Refresh Robinhood quote',exact:true}).click();
 await page.locator('#privateOptionQuote [role=status]').filter({hasText:'FRESH QUOTE · CHECKS PASSED'}).waitFor();
 assert.match(await page.locator('#privateOptionQuote [data-quote-fills]').innerText(),/Recorded entry \$0.180/);
 assert.match(await page.locator('#privateOptionQuote [data-quote-fills]').innerText(),/profit-review \$0.270/);
 assert.deepEqual(calls,['resolve','quotes']);assert.match(await page.locator('#privateOptionQuote tbody').innerText(),/0.190.*0.200.*0.195/s);
 assert.equal(await page.locator('#privateOptionQuote a').getAttribute('href'),'candidate-quotes.html');
 await page.getByText('Private quote validation',{exact:true}).click();
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Export private quote validation',exact:true}).click();const exportPath=await (await downloaded).path();const evidence=JSON.parse(await readFile(exportPath,'utf8'));assert.equal(evidence.passing_open_quotes,1);assert.equal(evidence.token_renewal_status,'NOT_VERIFIED');assert.ok(!JSON.stringify(evidence).includes('bid_price'));
 await page.clock.fastForward(61000);await page.locator('#privateOptionQuote [role=status]').filter({hasText:'STALE QUOTE'}).waitFor();assert.deepEqual(calls,['resolve','quotes']);
 failure=true;await page.getByRole('button',{name:'Refresh Robinhood quote',exact:true}).click();
 await page.locator('#privateOptionQuote [role=status]').filter({hasText:'sign-in required'}).waitFor();assert.equal(await page.locator('#privateOptionQuote tbody').count(),0);
 const signIn=page.locator('#privateOptionQuote').getByRole('link',{name:'Sign in to private quotes',exact:true});
 assert.equal(await signIn.getAttribute('target'),'_blank');const destination=new URL(await signIn.getAttribute('href'),origin);assert.equal(destination.pathname,'/private/plaid/robinhood/sign-in');assert.match(destination.searchParams.get('return_to'),/rh-quote=/);
 assert.equal(await page.locator('#privateOptionQuote details').first().evaluate(el=>el.open),false);
 failure=false;wrong=true;const before=calls.filter(x=>x==='quotes').length;
 await page.getByRole('button',{name:'Refresh Robinhood quote',exact:true}).click();
 await page.locator('#privateOptionQuote [role=status]').filter({hasText:'Exact Robinhood contract match unavailable'}).waitFor();assert.equal(calls.filter(x=>x==='quotes').length,before);
 wrong=false;quoteTime=await page.evaluate(()=>new Date().toISOString());
 await page.getByRole('button',{name:'Refresh Robinhood quote',exact:true}).click();
 await page.locator('#privateOptionQuote [role=status]').filter({hasText:'FRESH QUOTE · CHECKS PASSED'}).waitFor();
 await page.locator('[data-position-monitor] > summary').click();await page.getByRole('button',{name:'Load private exit plans',exact:true}).click();
 await page.getByRole('button',{name:'Send TEST ONLY exit notification',exact:true}).click();
 await page.locator('[data-position-monitor] [role=status]').filter({hasText:'TEST ONLY was accepted'}).waitFor();
 const form=page.locator('[data-position-monitor] form');await form.locator('[name=confirmed]').check();await form.locator('[name=delivery]').check();await form.locator('[name=active]').check();
 await form.locator('[name=loss]').fill('0.12');await form.locator('[name=profit]').fill('0.30');await form.getByRole('button',{name:'Save reviewed private exit plan',exact:true}).click();
 await page.locator('[data-position-monitor] [role=status]').filter({hasText:'Private plan enabled'}).waitFor();assert.equal(remotePlans[0].active,true);assert.equal(remotePlans[0].profit,.30);
 await form.locator('[name=profit]').fill('0.32');
 autoClock=true;await page.locator('[data-quote-auto]').check();await page.clock.fastForward(61000);
 await page.locator('[data-auto-status]').filter({hasText:'3/5 successful responses'}).waitFor();const afterAuto=calls.length;assert.equal(await form.locator('[name=profit]').inputValue(),'0.32');
 await page.locator('#cleanJournal').evaluate(el=>el.open=true);await page.locator('#journal [data-close]').click();await page.locator('[data-position-monitor]').getByText(/PAUSED · revision/).waitFor();assert.equal(remotePlans[0].active,false);assert.equal(positionCalls.filter(c=>c.path.endsWith('/pause')).length,1);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await page.clock.fastForward(61000);assert.equal(calls.length,afterAuto);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
 await page.getByRole('button',{name:'Close quote',exact:true}).click();await page.clock.fastForward(61000);assert.equal(calls.length,afterAuto);assert.ok(await page.locator('#privateOptionQuote').isHidden());
 assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log(`${width}px private option quote handoff, identity, aging, failure, retry and close passed`);await page.close();
}}finally{await browser.close();}
