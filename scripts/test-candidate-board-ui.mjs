import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),path=url.pathname.slice(1);
 if(!/^[a-z0-9_-]+\.(js|html|css)$/.test(path)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');
 // A returning browser may have the old unversioned dependency cached.
 if(path==='coverage-report.js'&&!url.search){res.end('export function coverageReport(){return {}}');return;}
 res.end(await readFile(new URL('../'+path,import.meta.url)));
}catch{res.writeHead(500);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}: {})});
 for(const width of [320,390,768,1280]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const option={side:'call',strike:10,expiry:'2026-11-20',ask:.2,bid:.19,delta:0,greeks_verified:false,quote_valid:true,delta_ok:false,tight_spread:true};
  const row=(ticker,state)=>({ticker,price:10,direction:'UP',execution_state:state,options:[option],eligible_contracts:[],preferred_contracts:[],chain_status:'SUCCESS',news_items:[],expiry_groups:{week:{chain_status:'SUCCESS',options:[{...option,expiry:'2026-11-27'}],eligible_contracts:[]}}});
  let candidates=[row('TEST','WATCH'),row('OTHER','PASS')];
  await page.addInitScript(()=>localStorage.setItem('0dteCleanDashboardFilters',JSON.stringify({onlyContracts:'contracts'})));
  await page.route('**/data/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(path.endsWith('/market-dashboard-today.json')||path.endsWith('/market-dashboard.json'))return route.fulfill({json:{scan_id:'fixture',generated_at:new Date().toISOString(),market_session:'OPEN',coverage:{},candidates,...(path.endsWith('-today.json')?{delivery_window:'today'}:{})}});
   return route.fulfill({json:{}});
  });
  await page.route('https://**/*',route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/dashboard_liquid.html`);
  await page.locator('#board').getByText(/Matching contracts only is on/).waitFor();
  assert.ok(await page.locator('#candidateBoard').evaluate(board=>['earlyWatchPanel','laterExpiryShadowPanel','contractWatchPanel'].every(id=>!!(board.compareDocumentPosition(document.getElementById(id))&Node.DOCUMENT_POSITION_FOLLOWING))),'candidates precede optional research in reading order');
  assert.equal(await page.locator('[data-view=save]').isVisible(),false,'saved views stay in advanced filters');
  assert.ok(await page.locator('#freshness .notice').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=14),'freshness stays readable');
  assert.ok(await page.locator('#scan').evaluate(el=>el.getBoundingClientRect().height>=44),'scan touch target');
  await page.getByRole('link',{name:'Skip to candidate board',exact:true}).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#candidateBoard').evaluate(el=>document.activeElement===el),true);
  await page.locator('.layout-menu > summary').click();
  assert.ok(await page.getByRole('link',{name:'Cleaner layout',exact:true}).isVisible());
  await page.locator('.layout-menu > summary').click();
  assert.match(await page.locator('#boardAvailability').innerText(),/2 stock rows loaded.*None of the 2 returned contracts has verified delta/);
  assert.equal(await page.locator('#board article').count(),0);
  await page.locator('#expiration').evaluate(el=>{el.value='week';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>document.querySelector('#boardAvailability').textContent.includes('None of the 2 returned'));
  await page.locator('.clean-nav a[href="#cleanJournal"]').click();
  assert.equal(await page.locator('#cleanJournal').evaluate(el=>el.open),true);
  await page.waitForFunction(()=>document.querySelector('.clean-nav a[href="#cleanJournal"]').getAttribute('aria-current')==='location');
  assert.equal(await page.locator('.clean-nav a[href="#candidateBoard"]').getAttribute('aria-current'),null);
  await page.locator('.clean-nav a[href="#candidateBoard"]').click();
  await page.locator('#allStocks').click();
  assert.equal(await page.locator('#board article').count(),2);
  assert.match(await page.locator('#boardAvailability').innerText(),/verified delta/);
  const valid={...option,contract_id:'TEST261120C00010000',delta:.4,delta_verified:true,delta_ok:true,near_atm:true,expiry_verified:true,volume:100,spread:.01,spread_pct:5,distance_pct:0};
  candidates=[{...row('TEST','WATCH'),options:[valid],eligible_contracts:[valid]}];
  await page.locator('#expiration').evaluate(el=>{el.value='today';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#check').click();
  await page.waitForFunction(()=>document.querySelector('#boardAvailability').textContent.includes('1 stocks have contracts'));
  assert.doesNotMatch(await page.locator('#boardAvailability').innerText(),/missing provider/);
  assert.deepEqual(errors,[]);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no document overflow with journal open at '+width+'px');
  await (await import('node:fs/promises')).mkdir('test-results/mobile',{recursive:true});
  await page.screenshot({path:`test-results/mobile/workspace-${width}.png`,fullPage:true});
  await page.close();
 }
 console.log('Candidate board missing-data, expiry, recovery and versioned dependency checks passed');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
