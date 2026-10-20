// Public synthetic queue only; no market or brokerage requests.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
await mkdir('test-results/shadow-mobile',{recursive:true});
const server=createServer(async(req,res)=>{try{const path=req.url==='/'?'shadow-review.html':req.url.slice(1);if(!['shadow-review.html','shadow-review-panel.js','shadow-review.js'].includes(path)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':'text/html');res.end(await readFile(new URL('../'+path,import.meta.url)));}catch{res.writeHead(500);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const width of [390,430]){
  const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.route('**/health',r=>r.fulfill({json:{environment:'staging'}}));
   const queue={format:'shadow-review-queue-v1',packet_id:'a'.repeat(64),generated_at:'2026-10-14T15:00:00Z',captured_at:'2026-10-14T15:01:00Z',market_session:'OPEN',coverage:{included:1,qualifying:1},candidates:[{candidate_id:'TEST261016C00100000',ask:.30,evidence_gaps:['EXCHANGE_QUOTE_TIME_UNKNOWN']}]};
   await page.route('**/data/shadow-review-queue.json',r=>r.fulfill({json:queue}));
   await page.route('**/data/shadow-outcomes.json',r=>r.fulfill({json:{format:'shadow-outcomes-v1',results:[{windows:[{status:'WITHHELD_ENTRY_QUOTE'}]}]}}));
   await page.goto(`http://127.0.0.1:${server.address().port}/`);
   await page.getByRole('button',{name:'Load staging review queue',exact:true}).click();
   await page.getByText('AWAITING_REVIEW',{exact:true}).waitFor();
   await page.getByText('1 decision records',{exact:false}).waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow');
   assert.match(await page.locator('#info').innerText(),/2026-10-14T15:00:00Z/);
   await page.screenshot({path:`test-results/shadow-mobile/${width}-queue.png`,fullPage:true});
   await page.locator('#replay').setInputFiles({name:'replay.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({packet_id:queue.packet_id,as_of:queue.captured_at,scored:[],withheld:[{candidate_id:'TEST261016C00100000',reasons:['NEWS:UNKNOWN']}]}))});
   await page.getByText('WITHHELD',{exact:true}).waitFor();
   assert.match(await page.locator('#rows').innerText(),/NEWS:UNKNOWN/);
   const components=Object.fromEntries(Object.entries({news:40,patterns:38,volume:10,options:7,risk_reward:5}).map(([k,w])=>[k,{score:50,weight_pct:w,contribution:w/2}]));
   await page.locator('#replay').setInputFiles({name:'fixed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'fixed-composite-shadow-v1',packet_id:queue.packet_id,as_of:queue.captured_at,scored:[{candidate_id:'TEST261016C00100000',reference_score:50,reference_components:components}],withheld:[]}))});
   await page.getByText('ADMITTED_OFFLINE · fixed 50.00 / 100',{exact:false}).waitFor();
   assert.match(await page.locator('#rows').innerText(),/news 20.00 \(40%\)/);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'fixed contributions overflow');
   await page.screenshot({path:`test-results/shadow-mobile/${width}-fixed.png`,fullPage:true});
   assert.deepEqual(errors,[]);console.log(`${width}px: queue, missing windows, withheld reasons, timestamps and no overflow passed`);
  }finally{await context.close();}
 }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
