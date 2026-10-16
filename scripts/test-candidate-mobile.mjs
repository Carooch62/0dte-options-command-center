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
 console.log(`${width}px: loader, source timestamp, no overflow, button sizing, production rejection passed`);
 assert.deepEqual(errors,[]);
 }finally{await page.screenshot({path:`test-results/mobile/${width}-final.png`,fullPage:true});await writeFile(`test-results/mobile/${width}-errors.json`,JSON.stringify(errors));await context.tracing.stop({path:`test-results/mobile/${width}-trace.zip`});await context.close();}
 }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
