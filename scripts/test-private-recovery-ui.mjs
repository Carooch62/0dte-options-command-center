// Synthetic browser workflow only; never contacts an actual broker.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {projectRecoveryBatch} from '../private-recovery.js';
const {chromium}=createRequire(import.meta.url)('playwright');
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname.slice(1);if(!/^[a-z0-9_-]+\.(js|css|html)$/.test(path)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');res.end(await readFile(new URL('../'+path,import.meta.url)));}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.clock.install({time:new Date('2026-11-20T15:00:00Z')});
  const seed=(dte=0)=>({source:'Nasdaq public chain',expiry:dte?'2026-11-27':'2026-11-20',dte,side:'call',strike:100,bid:.19,ask:.20,volume:100,quote_valid:true,tight_spread:true,near_atm:true,expiry_verified:true,greeks_verified:false});
  const source={generated_at:'2026-11-20T14:59:00Z',market_session:'OPEN',candidates:[{ticker:'TEST',price:100,direction:'UP',options:[seed()],expiry_groups:{week:{options:[seed(7)]}}}]};
  const id='22222222-2222-2222-2222-222222222222';let active,quotes=0,loads=0;
  await page.route('**/private/plaid/robinhood/candidates',r=>r.fulfill({json:{snapshot:{generated_at:source.generated_at,candidates:[],included_contracts:0,qualifying_contracts:0,total_contracts:0,omitted_contracts:0}}}));
  await page.route('**/private/plaid/robinhood/recovery-candidates?*',r=>{loads++;active=projectRecoveryBatch(source,new URL(r.request().url()).searchParams.get('window'));return r.fulfill({json:{snapshot:active}});});
  await page.route('**/private/plaid/robinhood/resolve',r=>r.fulfill({json:{results:active.candidates.map(c=>({contract:{ticker:c.ticker,expiry:c.options[0].expiry,strike:100,side:'call'},status:'EXACT_METADATA_MATCH',instrument:{id,chain_symbol:'TEST',expiration_date:c.options[0].expiry,strike_price:100,type:'call',trade_value_multiplier:100,state:'active',tradability:'tradable',sellout_datetime:'2026-11-27T20:45:00Z'}}))}}));
  await page.route('**/private/plaid/robinhood/quotes',r=>{quotes++;return r.fulfill({json:{received_at:'2026-11-20T15:00:00Z',request_timing:{browser_ms:10},observations:[{quote:{instrument_id:id,bid_price:'.19',ask_price:'.20',updated_at:'2026-11-20T14:59:59Z',delta:'.4',gamma:'.03',theta:'-.02',account_number:'NEVER_STORE'}}]}});});
  await page.goto(`http://127.0.0.1:${server.address().port}/candidate-quotes.html`);
  await page.locator('#load-current').click();await page.locator('#status').filter({hasText:'No candidates passed'}).waitFor();assert.equal(quotes,0);
  await page.getByText('Missing-delta recovery · private research',{exact:true}).click();
  for(const window of ['today','week']){
   await page.locator('#recovery-window').selectOption(window);await page.locator('#load-recovery').click();await page.locator('#status').filter({hasText:'None is approved'}).waitFor();assert.equal(quotes,loads-1,'loading research never fetches quotes automatically');
   assert.match(await page.locator('#batch-counts').innerText(),/missing-delta research candidates; none approved/);
   await page.locator('#resolve').click();await page.locator('#quote-summary').filter({hasText:'1 fresh quotes within'}).waitFor();
   await page.locator('#rows details > summary').click();assert.match(await page.locator('#rows details').innerText(),/Delta: 0.4 · PREFERRED_RANGE/);
   assert.match(await page.locator('#rows td').last().innerText(),/Not evaluated/);
   await page.reload();await page.locator('#batch-identity').filter({hasText:'PRIVATE RECOVERY RESEARCH'}).waitFor();assert.match(await page.locator('#batch-counts').innerText(),/none approved/);
   assert.ok(!(await page.evaluate(()=>sessionStorage.getItem('private-quote-session-v1'))).includes('NEVER_STORE'));
   // Reload collapses the recovery disclosure; reopen before the next selection.
   await page.getByText('Missing-delta recovery · private research',{exact:true}).click();
  }
  assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.close();
 }
 console.log('Private missing-delta recovery: both expiries, explicit fetch, Greeks and tab privacy passed');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
