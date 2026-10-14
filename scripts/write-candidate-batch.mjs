// Public scanner identities only. Never reads broker credentials or observations.
import {readFile,writeFile,rename,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {projectCandidates} from '../private-candidates.js';
export async function writeCandidateBatch(directory='data'){
 const target=resolve(directory,'candidate-quote-batch.json'),temporary=target+'.tmp';
 try{
  const batch=projectCandidates(JSON.parse(await readFile(resolve(directory,'market-dashboard.json'),'utf8')));
  await writeFile(temporary,JSON.stringify(batch));await rename(temporary,target);
  return {status:'AVAILABLE',included_contracts:batch.included_contracts,generated_at:batch.generated_at};
 }catch{
  await rm(temporary,{force:true});await rm(target,{force:true});
  return {status:'UNAVAILABLE',reason:'Retained scanner snapshot is missing or invalid; no quote-check batch published.'};
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await writeCandidateBatch(process.argv[2])));
