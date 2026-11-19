import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const files=new Set(['index.html','dashboard_liquid.html','dashboard_clean.html','dashboard-clean-app.js','coverage-report.js','dashboard-logic.js','dashboard-delivery.js','dashboard-mobile.css','connection-ui.css','trade-review.js','signal-checklist.js','refresh-progress.js','contract-watch.js','trade-exit-assistant.js']);
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname.slice(1);if(!files.has(path)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');res.end(await readFile(new URL('../'+path,import.meta.url)));}catch{res.writeHead(500);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'America/New_York'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',dialog=>dialog.type()==='prompt'?dialog.accept('0.20'):dialog.accept());
 await page.clock.install({time:new Date('2026-11-02T14:50:00Z')});
 const row=execution_state=>({ticker:'TEST',direction:'UP',price:10,score:1,execution_state,bar_end:'2026-11-02T14:45:00Z',options:[],eligible_contracts:[],preferred_contracts:[],news_items:[],chain_status:'SUCCESS'});
 const base={market_session:'OPEN',session_open_at:'2026-11-02T14:30:00Z',session_close_at:'2026-11-02T21:00:00Z',coverage:{},candidates:[row('WATCH')]};
 let scan={...base,scan_id:'old',generated_at:'2026-11-02T14:45:00Z'};
 await page.addInitScript(()=>localStorage.setItem('0dteContractWatches',JSON.stringify([{ticker:'TEST',direction:'UP',contract_id:'TEST261106C00011000',expiry:'2026-11-06',side:'call',strike:11}])));
 const snapshotRequests=[];
 await page.route('**/data/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/market-dashboard-today.json')){
   snapshotRequests.push('today');
   return route.fulfill({json:{...scan,delivery_window:'today'}});
  }
  if(path.endsWith('/market-dashboard.json')){
   snapshotRequests.push('full');
   return route.fulfill({json:{...scan,candidates:scan.candidates.map(candidate=>({...candidate,expiry_groups:{week:{chain_status:'NO_EXPIRATION_IN_WINDOW',options:[]}}}))}});
  }
  return route.fulfill({json:{status:'SUCCESS'}});
 });
 await page.route('https://**/*',route=>route.request().url().includes('/health')?route.fulfill({json:{latestRun:null}}):route.abort());
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
 await page.waitForURL('**/dashboard_liquid.html');
 await page.locator('#contractWatchList').filter({hasText:'TEST'}).waitFor();
 const manual=page.locator('#board > article .purchase-action button');
 await manual.waitFor({state:'visible'});assert.equal(await manual.innerText(),'Record an option purchase');
 assert.equal(await page.locator('#board .clean-drawer').evaluate(el=>el.open),false);
 await manual.click();assert.equal(await page.locator('#jt').inputValue(),'TEST');assert.equal(await page.locator('#jc').inputValue(),'');
 assert.equal(await page.locator('#jtime').inputValue(),'');assert.equal(await page.locator('#je').inputValue(),'0.2');
 await page.locator('#jc').fill('MANUAL-CONTRACT');await page.locator('#jexpiry').fill('2026-11-06');await page.locator('#je').fill('0.20');
 assert.equal(await page.locator('#jloss').inputValue(),'0.14');assert.match(await page.locator('#purchaseExitDraft').innerText(),/MANUAL-CONTRACT/);
 assert.match(await page.locator('#contractWatchList').innerText(),/WATCH/);
 scan={...base,scan_id:'new',generated_at:'2026-11-02T14:49:00Z',candidates:[row('TRIGGERED')]};
 await page.locator('#check').click();
 await page.locator('#contractWatchList').filter({hasText:'live quote and setup recheck required'}).waitFor();
 assert.deepEqual(snapshotRequests,['today','today']);
 await page.locator('#expiration').evaluate(select=>{select.value='week';select.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('#board').getByText('No expiration in this window',{exact:true}).waitFor();
 assert.deepEqual(snapshotRequests,['today','today','full']);
 assert.deepEqual(errors,[]);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('[data-remove-watch]').click();
 assert.match(await page.locator('#contractWatchList').innerText(),/No contracts saved/);
 // Exercise a real rendered shortlist, with all contract drawers still collapsed.
 await page.locator('#expiration').evaluate(select=>{select.value='today';select.dispatchEvent(new Event('input',{bubbles:true}));});
 const option={contract_id:'TEST261106C00011000',expiry:'2026-11-06',side:'call',strike:11,bid:.19,ask:.20,delta:.4,delta_verified:true,quote_valid:true,delta_ok:true,tight_spread:true,near_atm:true,expiry_verified:true,volume:100,spread:.01,spread_pct:5,distance_pct:1};
 scan={...base,scan_id:'with-contract',generated_at:'2026-11-02T14:50:00Z',candidates:[{...row('WATCH'),options:[option],eligible_contracts:[option]}]};
 await page.locator('#check').click();
 const record=page.locator('#board .purchase-action').getByRole('button',{name:'I bought this contract · record fill',exact:true});await record.waitFor({state:'visible'});assert.equal(await page.locator('#board .clean-drawer').evaluate(el=>el.open),false);await record.click();
 assert.equal(await page.locator('#je').inputValue(),'0.2');assert.equal(await page.locator('#jtime').inputValue(),'');
 assert.equal(await page.locator('#jf').inputValue(),'');assert.equal(await page.locator('#jc').inputValue(),'TEST261106C00011000');
 assert.match(await page.locator('#purchaseExitDraft').innerText(),/Your option exit-plan draft/);
 assert.equal(await page.locator('#jloss').inputValue(),'0.14');assert.equal(await page.locator('#jtarget').inputValue(),'0.3');
 await page.locator('#addTrade').click();assert.match(await page.locator('#journalNotice').innerText(),/actual execution time and known total fees/);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('0dteJournal')).length),0);
 await page.locator('#je').fill('0.50');
 assert.equal(await page.locator('#jloss').inputValue(),'0.35');assert.equal(await page.locator('#jtarget').inputValue(),'0.75');
 await page.locator('#jloss').fill('0.33');await page.locator('#jq').fill('2');
 assert.equal(await page.locator('#jloss').inputValue(),'0.33');assert.match(await page.locator('#purchaseExitDraft').innerText(),/your edited checkpoint/);
 await page.locator('#jq').fill('1');await page.locator('#jf').fill('0');await page.locator('#jtime').fill('2026-11-02T09:49');await page.locator('#addTrade').click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('0dteJournal')).length),1);
 await page.locator('#exitReviewPanel').getByText(/exceeds the scanner/).waitFor();
 // A confirmed provider execution retains seconds and cannot be journalled twice.
 await page.locator('#addTrade').evaluate(button=>{button.dataset.executionId='11111111-1111-4111-8111-111111111111';button.dataset.executedAt='2026-11-02T14:49:30Z';});
 await page.locator('#addTrade').click();
 const captured=await page.evaluate(()=>JSON.parse(localStorage.getItem('0dteJournal')));
 assert.equal(captured.length,2);assert.equal(captured[0].time,'2026-11-02T14:49:30Z');
 await page.locator('#addTrade').click();assert.match(await page.locator('#journalNotice').innerText(),/already recorded/);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('0dteJournal')).length),2);
 assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log('Contract watch render, transition, removal and mobile width passed');
 await page.close();
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}

