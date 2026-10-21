// Local-only browser QA with synthetic responses; no brokerage requests.
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
await mkdir('test-results/mobile',{recursive:true});
import assert from 'node:assert/strict';
const server=createServer(async(req,res)=>{try{const path=req.url==='/'?'candidate-quotes.html':req.url.slice(1).split('?')[0];if(!['private-request.js','candidate-quotes.html','candidate-quotes-panel.js','candidate-quotes.js','robinhood-review.js','quote-evidence.js','quote-session.js','quote-timing.js','connection-ui.css','brokerage.html','dashboard-broker.js','dashboard-broker-logic.js','brokerage-history.js','execution-evidence.js','robinhood-panel.js','robinhood-connect.js'].includes(path)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');res.end(await readFile(new URL('../'+path,import.meta.url)));}catch{res.writeHead(500);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const width of [390,430]){
 const context=await browser.newContext({viewport:{width,height:844}});
 await context.tracing.start({screenshots:true,snapshots:true});
 const page=await context.newPage();await page.clock.install();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 await page.route('**/health',r=>r.fulfill({json:{environment:'staging'}}));
 await page.route('**/data/candidate-snapshot.json',r=>r.fulfill({json:{generated_at:'2026-10-12T14:00:00Z',candidates:[{ticker:'TEST',options:[{contract_id:'SYNTHETIC-LONG-CONTRACT-NAME-261012C00100000',strike:100,side:'call',expiry:'2026-10-12'}]}]}}));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 let followedSignIn=0;
 await page.route('https://private-sign-in.invalid/**',r=>{followedSignIn++;return r.abort();});
 await page.route('**/private/plaid/robinhood/status',r=>r.fulfill({status:302,headers:{Location:'https://private-sign-in.invalid/login'}}));
 await page.locator('#check-connection').click();
 await page.locator('#status').filter({hasText:'Private sign-in required.'}).waitFor();
 assert.equal(followedSignIn,0,'private fetch must not follow the cross-origin Access redirect');
 assert.ok(await page.locator('#private-sign-in').isVisible());
 assert.ok(await page.locator('#retry-request').isEnabled());
 assert.equal(await page.locator('link[href="./connection-ui.css"]').count(),1);
 assert.equal(await page.locator('.project-nav a').count(),3);
 assert.equal(await page.locator('.project-nav a[aria-current=page]').innerText(),'Quotes');
 assert.equal(await page.locator('.project-nav').evaluate(el=>getComputedStyle(el).display),'flex');
 await page.getByText('Snapshot imports and staging fallback',{exact:true}).click();
 await page.getByRole('button',{name:'Load staging scanner snapshot',exact:true}).click();
 await page.getByText('Contract metadata has not been matched.',{exact:false}).waitFor();
 assert.match(await page.locator('#snapshot-info').innerText(),/Staging.*2026-10-12T14:00:00Z/);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow');
 for(const button of await page.locator('button').all()){const box=await button.boundingBox();assert.ok(box.height>=44);assert.ok(box.x>=0&&box.x+box.width<=width);}
 await page.screenshot({path:`test-results/mobile/${width}-loaded.png`,fullPage:true});
 await page.route('**/health',r=>r.fulfill({json:{environment:'production'}}));
 await page.getByRole('button',{name:'Load staging scanner snapshot',exact:true}).click();
 await page.getByText('This loader requires the staging environment.',{exact:false}).waitFor();
 assert.equal(await page.locator('#rows tr').count(),1,'failed staging load must preserve the prior cohort');
 // Validate the automatic private workflow using sanitized synthetic responses.
 const now=await page.evaluate(()=>new Date().toISOString()),id='22222222-2222-2222-2222-222222222222',contract={ticker:'TEST',strike:100,side:'call',expiry:'2099-01-01'};
 await page.route('**/private/plaid/robinhood/candidates',r=>r.fulfill({json:{snapshot:{generated_at:now,included_contracts:1,total_contracts:1,qualifying_contracts:1,omitted_contracts:0,candidates:[{ticker:'TEST',options:[{...contract,contract_id:'TEST20990101C00100000'}]}]}}}));
 await page.route('**/private/plaid/robinhood/resolve',r=>r.fulfill({json:{results:[{contract,status:'EXACT_METADATA_MATCH',instrument:{id,chain_symbol:'TEST',strike_price:100,type:'call',expiration_date:'2099-01-01',state:'active',tradability:'tradable',trade_value_multiplier:100,sellout_datetime:'2099-01-01T19:45:00Z'}}]}}));
 await page.route('**/private/plaid/robinhood/quotes',async r=>r.fulfill({json:{received_at:await page.evaluate(()=>new Date().toISOString()),request_timing:{setup_ms:60,quote_ms:40,worker_ms:105},observations:[{quote:{instrument_id:id,bid_price:'.30',ask_price:'.31',updated_at:now}}]}}));
 await page.route('**/data/staging-shadow-evidence-latest.json',r=>r.fulfill({json:{format:'shadow-evidence-v1',packet_id:'a'.repeat(64),scan_id:'staging-test',generated_at:now,captured_at:now,market_session:'OPEN',candidates:[{candidate_id:'TEST20990101C00100000',ticker:'TEST',contract:{contract_id:'TEST20990101C00100000',strike:100,side:'call',expiry:'2099-01-01'}}]}}));
 await page.getByRole('button',{name:'Load staging validation batch',exact:true}).click();
 await page.getByText('Loaded 1 staging contracts',{exact:false}).waitFor();
 assert.match(await page.locator('#snapshot-info').innerText(),/STAGING VALIDATION/);
 await page.getByRole('button',{name:'Load current $0.30 scanner batch',exact:true}).click();
 await page.getByText('Loaded 1 contracts',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Match contracts and fetch live quotes',exact:true}).click();
 await page.getByText('Above $0.30 · outside budget',{exact:true}).waitFor();
 await page.getByText('Live ask is above $0.30.',{exact:false}).waitFor();
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'Export private quote observations',exact:true}).click();
 const download=await downloadPromise,exported=JSON.parse(await readFile(await download.path(),'utf8'));
 assert.equal(exported.entries.length,1);
 assert.match(await page.locator('#validation-clock').innerText(),/5-min:.*10-min:.*15-min:/);assert.equal(exported.entries[0].quote.ask,.31);
 assert.deepEqual(exported.validation_policy.horizons_minutes,[5,10,15]);
 assert.equal(exported.observations[0].request_timing.setup_ms,60);
 assert.equal(exported.observations[0].request_timing.quote_ms,40);
 assert.equal(exported.observations[0].request_timing.worker_ms,105);
 assert.ok(exported.observations[0].request_timing.browser_ms>=0);
 assert.equal(exported.observations[0].observed_at,now);
 assert.equal(exported.observations[0].metadata_multiplier,100);
 assert.deepEqual(exported.observations[0].quote_check_reasons,[]);
 await page.reload();await page.getByText('Restored this tab’s session',{exact:false}).first().waitFor();
 assert.ok(await page.getByRole('button',{name:'Refresh matched option quotes',exact:true}).isEnabled());
 await page.locator('#verified-only').check();assert.equal(await page.locator('#rows tr').count(),0);await page.locator('#verified-only').uncheck();
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Load staging validation batch',exact:true}).click();
 assert.equal(await page.locator('#rows tr').count(),1);
 assert.equal(exported.entries[0].decision_at,exported.entries[0].quote.received_at);
 assert.ok(!JSON.stringify(exported).includes('account_id'));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'private results overflow');
 assert.equal(await page.locator('td[data-label="$0.30 live ask"]').innerText(),'Above $0.30 · outside budget');
 await page.screenshot({path:`test-results/mobile/${width}-private-live.png`,fullPage:true});
 await page.route('**/private/plaid/robinhood/quotes',async r=>r.fulfill({json:{received_at:await page.evaluate(()=>new Date().toISOString()),observations:[{quote:{instrument_id:id,bid_price:'.02',ask_price:'.03',updated_at:now}}]}}));
 await page.getByRole('button',{name:'Refresh matched option quotes',exact:true}).click();
 await page.getByText('The spread exceeds the quote-check limit.',{exact:false}).waitFor();
 await page.reload();await page.getByText('Restored this tab’s session',{exact:false}).first().waitFor();
 const wideDownload=page.waitForEvent('download');
 await page.getByRole('button',{name:'Export private quote observations',exact:true}).click();
 const wide=JSON.parse(await readFile(await (await wideDownload).path(),'utf8'));
 const failed=wide.observations.at(-1);
 assert.equal(failed.metadata_multiplier,100);assert.equal(failed.multiplier,null);
 assert.deepEqual(failed.quote_check_reasons,['WIDE_SPREAD']);
 assert.equal(wide.entries.length,1); // Failed refresh cannot replace the earlier passing entry.
 await page.route('**/private/plaid/robinhood/quotes',r=>r.fulfill({status:401,json:{error:'Private sign in required'}}));
 await page.getByRole('button',{name:'Refresh matched option quotes',exact:true}).click();
 await page.locator('#status').filter({hasText:'Private sign-in required.'}).waitFor();
 assert.match(await page.locator('#connection-state').innerText(),/Private sign-in required/);
 assert.equal(await page.locator('td[data-label="Bid / ask"]').innerText(),'Unknown');
 assert.ok(await page.getByRole('button',{name:'Refresh matched option quotes',exact:true}).isEnabled());
 assert.ok(await page.getByRole('link',{name:'Open private sign-in and connection setup',exact:true}).isVisible());
 await page.clock.setSystemTime(new Date(Date.parse(exported.entries[0].decision_at)+5*60000+1000));
 await page.clock.runFor(1000);
 await page.getByText('Capture countdowns by contract',{exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('capture-windows').textContent.includes('REFRESH NOW'));
 assert.match(await page.locator('#validation-clock').innerText(),/closes in/);
 await page.clock.setSystemTime(new Date(Date.parse(exported.entries[0].decision_at)+6*60000+1000));
 await page.clock.runFor(1000);
 await page.waitForFunction(()=>document.getElementById('capture-windows').textContent.includes('MISSING'));
 assert.match(await page.locator('#capture-windows').innerText(),/MISSING/);
 await page.route('**/private/plaid/robinhood/candidates',r=>r.abort('failed'));
 page.once('dialog',d=>d.accept());await page.locator('#load-current').click();
 await page.locator('#status').filter({hasText:'Check your network and retry'}).waitFor();
 assert.ok(await page.locator('#retry-request').isEnabled());
 assert.ok(await page.locator('#export-evidence').isEnabled());
 assert.equal(await page.locator('#rows tr').count(),1,'failed batch replacement must preserve cohort');
 const historyBefore=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('private-quote-session-v1')).history);
 page.once('dialog',d=>d.accept());
 await page.locator('#scanner').setInputFiles({name:'invalid-snapshot.json',mimeType:'application/json',buffer:Buffer.from('{"wrong":true}')});
 await page.locator('#status').filter({hasText:'Expected scanner candidates'}).waitFor();
 assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('private-quote-session-v1')).history),historyBefore);
 assert.equal(await page.locator('#rows tr').count(),1,'invalid file replacement must preserve cohort');
 console.log(`${width}px: loader, capture countdown, failure recovery, evidence preservation, no overflow passed`);
 assert.deepEqual(errors,[]);
 }finally{await page.screenshot({path:`test-results/mobile/${width}-final.png`,fullPage:true});await writeFile(`test-results/mobile/${width}-errors.json`,JSON.stringify(errors));await context.tracing.stop({path:`test-results/mobile/${width}-trace.zip`});await context.close();}
 }
 // Connection states use synthetic data only; never reach real providers.
 for(const width of [390,430,1280]){
 const context=await browser.newContext({viewport:{width,height:900}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.request().url().includes('scan-history')?r.fulfill({json:[]}):r.abort());
 let mode='connected';
 await page.route('**/private/plaid/status',r=>r.fulfill({json:{connected:mode==='connected'}}));
 await page.route('**/private/plaid/snapshot',r=>r.fulfill({json:{snapshot:{retrieved_at:new Date().toISOString(),range:{start:'2026-10-01',end:'2026-10-19'},accounts:[{account_id:'synthetic',name:'Synthetic test account'}],securities:[{security_id:'synthetic-security',ticker_symbol:'TEST'}],holdings:[{account_id:'synthetic',security_id:'synthetic-security',quantity:1.234567,institution_value:123.45,institution_price_as_of:'2026-10-19'}],transactions:[],coverage:{total_transactions:0,complete:true}}}}));
 await page.route('**/private/plaid/robinhood/status',r=>mode==='failed'?r.fulfill({status:401,json:{error:'Private sign-in required'}}):r.fulfill({json:{connected:mode==='connected',status:mode==='expired'?'RECONNECT_REQUIRED':'READY',expires_at:mode==='connected'?'2099-01-01T00:00:00Z':null}}));
 try{
 for(const state of ['connected','expired','failed']){
 mode=state;await page.goto(`http://127.0.0.1:${server.address().port}/brokerage.html`);
 await page.waitForFunction(()=>!document.getElementById('rh-connect-help').textContent.startsWith('Checking'));
 await page.waitForFunction(()=>!document.getElementById('plaid-connect-help').textContent.startsWith('Checking'));
 assert.equal(await page.locator('.project-nav a[aria-current=page]').innerText(),'Connections');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'connections page overflow');
 if(state==='connected'){
 assert.ok(await page.locator('#rh-live-connect').isDisabled());assert.ok(await page.locator('#rh-live-test').isEnabled());
 assert.match(await page.locator('#rh-connect-help').innerText(),/Already connected/);
 assert.ok(await page.locator('#plaid-connect').isDisabled());assert.ok(await page.locator('#plaid-sync').isEnabled());
 await page.locator('#plaid-snapshot table').first().waitFor();
 assert.match(await page.locator('#plaid-snapshot').innerText(),/2026-10-19/);
 if(width<760)assert.ok(await page.locator('#plaid-snapshot').evaluate(el=>el.scrollWidth>el.clientWidth),'wide provider table must scroll inside its container');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'populated provider data page overflow');
 }else if(state==='expired'){
 assert.ok(await page.locator('#rh-live-connect').isEnabled());assert.ok(await page.locator('#rh-live-test').isDisabled());
 assert.match(await page.locator('#rh-connect-help').innerText(),/expired/);
 }else{
 assert.ok(await page.locator('#rh-live-connect').isDisabled());assert.ok(await page.locator('#rh-live-test').isDisabled());
 assert.match(await page.locator('#rh-connect-help').innerText(),/could not be checked/);
 }
 if(state==='connected'){
 const stamp=new Date().toISOString(),future=new Date(Date.now()+86400000).toISOString(),instrument={id:'synthetic-review',chain_symbol:'TEST',strike_price:100,type:'call',expiration_date:'2099-01-01'};
 await page.locator('#rh-file').setInputFiles({name:'synthetic-future-clock.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'robinhood-research-v1',retrieved_at:stamp,accounts:[],bars:[],observations:[{instrument,quote:{instrument_id:instrument.id,bid_price:'.29',ask_price:'.30',delta:'.4',theta:'-.01',updated_at:stamp},received_at:future,session_status:'open'}]}))});
 await page.locator('#rh-quotes').getByText('Missing or inconsistent quote clock',{exact:false}).waitFor();
 assert.match(await page.locator('#rh-quotes').innerText(),/Missing or inconsistent quote clock/);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'imported review page overflow');
 }
 await page.screenshot({path:`test-results/mobile/${width}-connections-${state}.png`,fullPage:true});
 }
 assert.deepEqual(errors,[]);console.log(`${width}px: connected, expired and failed connection states passed`);
 }finally{await context.close();}
 }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}





