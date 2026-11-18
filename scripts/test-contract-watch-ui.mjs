import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const files=new Set(['dashboard_clean.html','dashboard-clean-app.js','coverage-report.js','dashboard-logic.js','dashboard-delivery.js','dashboard-mobile.css','connection-ui.css','trade-review.js','signal-checklist.js','refresh-progress.js','contract-watch.js','trade-exit-assistant.js']);
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname.slice(1);if(!files.has(path)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');res.end(await readFile(new URL('../'+path,import.meta.url)));}catch{res.writeHead(500);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'America/New_York'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
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
 await page.goto(`http://127.0.0.1:${server.address().port}/dashboard_clean.html`);
 await page.locator('#contractWatchList').filter({hasText:'TEST'}).waitFor();
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
 // Exercise the purchase helper without any brokerage or trading connection.
 await page.locator('#board').evaluate(board=>{
  const box=document.createElement('div');box.className='contract-pick';const button=document.createElement('button');
  button.dataset.watch=encodeURIComponent(JSON.stringify({ticker:'TEST',direction:'UP',contract_id:'TEST261106C00011000',expiry:'2026-11-06',side:'call',strike:11}));box.append(button);board.append(box);
 });
 const record=page.getByRole('button',{name:'I bought this contract · record fill',exact:true});await record.waitFor();await record.click();
 assert.equal(await page.locator('#je').inputValue(),'');assert.equal(await page.locator('#jtime').inputValue(),'');
 assert.equal(await page.locator('#jf').inputValue(),'');assert.equal(await page.locator('#jc').inputValue(),'TEST261106C00011000');
 await page.locator('#addTrade').click();assert.match(await page.locator('#journalNotice').innerText(),/actual execution time and known total fees/);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('0dteJournal')).length),0);
 await page.locator('#je').fill('0.50');await page.locator('#jf').fill('0');await page.locator('#jtime').fill('2026-11-02T09:49');await page.locator('#addTrade').click();
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

