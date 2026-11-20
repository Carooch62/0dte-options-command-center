// Offline private analysis. Results go to stdout, never into public dashboard data.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {validationSample,validationReport} from '../dashboard-quote-validation.js';
export function analyzeExports(exports){
 const groups=new Map();let duplicates=0;
 for(const pack of exports){
  if(pack?.format!=='private-dashboard-quote-validation-v1'||!Array.isArray(pack.samples)||pack.samples.length>500)throw Error('Unsupported quote export');
  const c=pack.contract;if(!c||!c.ticker||!c.contract_id||!c.expiry||!['call','put'].includes(c.side)||!(c.strike>0))throw Error('Exact contract identity required');
  const key=JSON.stringify([c.ticker,c.contract_id,c.expiry,c.side,c.strike]);
  if(!groups.has(key))groups.set(key,{contract:{ticker:c.ticker,contract_id:c.contract_id,expiry:c.expiry,side:c.side,strike:c.strike},samples:new Map()});
  const group=groups.get(key);
  for(const row of pack.samples){
   const now=Date.parse(row.checked_at);if(!Number.isFinite(now))throw Error('Missing check clock');
   const sample=validationSample({view:row.provider_at&&row.received_at?{status:row.status==='FRESH_CHECK_PASSED'?'FRESH QUOTE · CHECKS PASSED':'QUOTE REQUIRES REVIEW',observed_at:row.provider_at,received_at:row.received_at}:null,snapshot:{market_session:row.open_session_verified===true?'OPEN':'UNKNOWN',generated_at:row.snapshot_generated_at,session_open_at:row.session_open_at,session_close_at:row.session_close_at},duration_ms:row.duration_ms,error_code:row.status},now);
   const id=JSON.stringify([sample.checked_at,sample.received_at]);
   if(group.samples.has(id)){if(JSON.stringify(group.samples.get(id))!==JSON.stringify(sample))throw Error('Conflicting duplicate sample');duplicates++;continue;}
   group.samples.set(id,sample);
  }
 }
 return {format:'private-quote-analysis-v1',duplicate_samples_removed:duplicates,contracts:[...groups.values()].map(g=>{const sorted=[...g.samples.values()].sort((a,b)=>Date.parse(a.checked_at)-Date.parse(b.checked_at));const report=validationReport(sorted);return {contract:g.contract,...report,input_samples:sorted.length,omitted_by_report_limit:Math.max(0,sorted.length-500)};}),limitation:'Compare operating conditions before pooling. Export metadata cannot independently prove the exchange calendar, token renewal or Discord delivery.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{const paths=process.argv.slice(2);if(!paths.length)throw Error('Usage: node scripts/analyze-quote-exports.mjs FILE.json [FILE.json ...]');const packs=[];for(const path of paths){const raw=await readFile(path,'utf8');if(raw.length>5e6)throw Error('Export exceeds size limit');packs.push(JSON.parse(raw));}console.log(JSON.stringify(analyzeExports(packs),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
