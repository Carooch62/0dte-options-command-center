// Local-only browser QA with synthetic responses; no brokerage requests.
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
await mkdir('test-results/mobile',{recursive:true});
import assert from 'node:assert/strict';
const server=createServer(async(req,res)=>{try{const path=req.url==='/'?'candidate-quotes.html':req.url.slice(1);if(!['candidate-quotes.html','candidate-quotes-panel.js','candidate-quotes.js','robinhood-review.js'].includes(path)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':'text/html');res.end(await readFile(new URL('../'+path,import.meta.url)));}catch{res.writeHead(500);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const width of [390,430]){
 const context=await browser.newContext({viewport:{width,height:844}});
 await context.tracing.start({screenshots:true,snapshots:true});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 await page.route('**/health',r=>r.fulfill({json:{environment:'staging'}}));
 await page.route('**/data/candidate-snapshot.json',r=>r.fulfill({json:{generated_at:'2026-10-12T14:00:00Z',candidates:[{ticker:'TEST',options:[{contract_id:'SYNTHETIC-LONG-CONTRACT-NAME-261012C00100000',strike:100,side:'call',expiry:'2026-10-12'}]}]}}));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.locator('summary').click();
 await page.getByRole('button',{name:'Load staging scanner snapshot',exact:true}).click();
 await page.getByText('UNVERIFIED: NO_CONTRACT_MATCH',{exact:false}).waitFor();
 assert.match(await page.locator('#snapshot-info').innerText(),/Staging.*2026-10-12T14:00:00Z/);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow');
 for(const button of await page.locator('button').all()){const box=await button.boundingBox();assert.ok(box.height>=44);assert.ok(box.x>=0&&box.x+box.width<=width);}
 await page.screenshot({path:`test-results/mobile/${width}-loaded.png`,fullPage:true});
 await page.route('**/health',r=>r.fulfill({json:{environment:'production'}}));
 await page.getByRole('button',{name:'Load staging scanner snapshot',exact:true}).click();
 await page.getByText('This loader requires the staging environment.',{exact:false}).waitFor();
 assert.equal(await page.locator('#rows tr').count(),0);
 // Validate the automatic private workflow using sanitized synthetic responses.
 const now=new Date().toISOString(),id='22222222-2222-2222-2222-222222222222',contract={ticker:'TEST',strike:100,side:'call',expiry:'2099-01-01'};
 await page.route('**/private/plaid/robinhood/candidates',r=>r.fulfill({json:{snapshot:{generated_at:now,included_contracts:1,total_contracts:1,qualifying_contracts:1,omitted_contracts:0,candidates:[{ticker:'TEST',options:[{...contract,contract_id:'TEST20990101C00100000'}]}]}}}));
 await page.route('**/private/plaid/robinhood/resolve',r=>r.fulfill({json:{results:[{contract,status:'EXACT_METADATA_MATCH',instrument:{id,chain_symbol:'TEST',strike_price:100,type:'call',expiration_date:'2099-01-01',state:'active',tradability:'tradable',trade_value_multiplier:100,sellout_datetime:'2099-01-01T19:45:00Z'}}]}}));
 await page.route('**/private/plaid/robinhood/quotes',r=>r.fulfill({json:{received_at:new Date().toISOString(),observations:[{quote:{instrument_id:id,bid_price:'.30',ask_price:'.31',updated_at:now}}]}}));
 await page.getByRole('button',{name:'Load current $0.30 scanner batch',exact:true}).click();
 await page.getByText('Loaded 1 contracts',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Match contracts and fetch live quotes',exact:true}).click();
 await page.getByText('ABOVE_LIMIT',{exact:true}).waitFor();
 await page.getByText('QUOTE_CHECK_PASSED',{exact:true}).waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'private results overflow');
 assert.equal(await page.locator('td[data-label="$0.30 live ask"]').innerText(),'ABOVE_LIMIT');
 await page.screenshot({path:`test-results/mobile/${width}-private-live.png`,fullPage:true});
 await page.route('**/private/plaid/robinhood/quotes',r=>r.fulfill({status:401,json:{error:'Private sign in required'}}));
 await page.getByRole('button',{name:'Refresh matched option quotes',exact:true}).click();
 await page.getByText('Private sign-in required.',{exact:false}).waitFor();
 assert.equal(await page.locator('td[data-label="Bid / ask"]').innerText(),'Unknown');
 assert.ok(await page.getByRole('button',{name:'Refresh matched option quotes',exact:true}).isEnabled());
 assert.ok(await page.getByRole('link',{name:'Open private sign-in and connection setup',exact:true}).isVisible());
 console.log(`${width}px: loader, source timestamp, no overflow, button sizing, production rejection passed`);
 assert.deepEqual(errors,[]);
 }finally{await page.screenshot({path:`test-results/mobile/${width}-final.png`,fullPage:true});await writeFile(`test-results/mobile/${width}-errors.json`,JSON.stringify(errors));await context.tracing.stop({path:`test-results/mobile/${width}-trace.zip`});await context.close();}
 }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}

