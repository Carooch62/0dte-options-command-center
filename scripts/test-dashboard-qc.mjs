// Synthetic scanner UI checks. No provider calls or real scan dispatches.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const allowed=new Set(['dashboard_glass.html','dashboard-app.js','dashboard-logic.js','dashboard-mobile.css','connection-ui.css','trade-review.js','signal-checklist.js','refresh-progress.js']);
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname.slice(1);
  if(!allowed.has(path)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');
  res.end(await readFile(new URL('../'+path,import.meta.url)));
 }catch{res.writeHead(500);res.end();}
});
await mkdir('test-results/mobile',{recursive:true});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const width of [390,430,1280]){
  const context=await browser.newContext({viewport:{width,height:900},timezoneId:'UTC'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-19T14:00:00Z')});
  let fail=false;
  const fixture={generated_at:'2026-10-19T14:00:00Z',scan_id:'synthetic-qc',market_session:'OPEN',session_open_at:'2026-10-19T13:30:00Z',session_close_at:'2026-10-19T20:00:00Z',universe_size:1,scanned_rows:1,candidates:[{ticker:'TEST',price:100,direction:'UP',execution_state:'WATCH',setup_qualified:false,bar_end:'2026-10-19T14:00:00Z',score:1,options:[],eligible_contracts:[],preferred_contracts:[],news_items:[],chain_status:'NOT_SCANNED'}]};
  await page.route('**/data/**',r=>{
   const path=new URL(r.request().url()).pathname;
   if(path.endsWith('market-dashboard.json'))return r.fulfill(fail?{status:503,json:{error:'synthetic failure'}}:{json:fixture});
   return r.fulfill({json:path.endsWith('scan-health.json')?{status:'SUCCESS',updated_at:fixture.generated_at}:[]});
  });
  await page.route('https://**/*',r=>r.request().url().includes('/health')?r.fulfill({json:{ok:true,latestRun:null}}):r.abort());
  try{
   await page.goto(`http://127.0.0.1:${server.address().port}/dashboard_glass.html`);
   await page.locator('#shown').filter({hasText:'1 candidates'}).waitFor();
   assert.equal(await page.locator('.project-nav a[aria-current=page]').innerText(),'Scanner');
   assert.match(await page.locator('#freshness').innerText(),/Research snapshot/);
   assert.match(await page.locator('#freshness').innerText(),/10:00:00 AM ET/);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'scanner page overflow');
   await page.locator('#tickerSearch').fill('MISSING');assert.equal(await page.locator('#board article').count(),0);
   await page.locator('#clearSearch').click();assert.equal(await page.locator('#board article').count(),1);
   await page.locator('[data-star=TEST]').click();await page.locator('#watchStocks').click();assert.equal(await page.locator('#board article').count(),1);
   await page.locator('#filterPanel > summary').click();
   await page.locator('#direction').selectOption('DOWN');assert.equal(await page.locator('#board article').count(),0);
   await page.locator('[data-clear-filter=direction]').click();assert.equal(await page.locator('#board article').count(),1);
   await page.locator('#interval').selectOption({index:1});
   await page.screenshot({path:`test-results/mobile/${width}-scanner-fresh.png`,fullPage:true});
   // Moving the clock past the freshness limit must not leave a fresh headline.
   await page.locator('#auto').click();
   await page.clock.fastForward(9*60*1000);
   assert.match(await page.locator('#freshness').innerText(),/STALE \/ RESEARCH ONLY/);
   fail=true;await page.locator('#check').click();
   await page.locator('#freshness').filter({hasText:'Unable to download new results'}).waitFor();
   assert.equal(await page.locator('#board article').count(),1);
   assert.ok(await page.locator('#scan').isEnabled());
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'scanner failure state overflow');
   assert.deepEqual(errors,[]);
   await page.screenshot({path:`test-results/mobile/${width}-scanner-stale.png`,fullPage:true});
   console.log(`${width}px: scanner search, watchlist, filter reset, interval, stale data and failed download passed`);
  }finally{await context.close();}
 }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
