// Never reads broker records. Output contains public research identities only.
import {readFile,writeFile,rename,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {projectRecoveryBatch,validateRecoveryBatch} from '../private-recovery.js';
export async function writeRecoveryBatches(directory='data'){
 const targets=['today','week'].map(window=>resolve(directory,`quote-recovery-${window}.json`));
 try{
  const snapshot=JSON.parse(await readFile(resolve(directory,'market-dashboard.json'),'utf8'));
  const batches=['today','week'].map(window=>validateRecoveryBatch(projectRecoveryBatch(snapshot,window),window));
  const json=batches.map(batch=>JSON.stringify(batch));if(json.some(value=>Buffer.byteLength(value)>65536))throw Error('Recovery batch exceeds limit');
  for(let i=0;i<targets.length;i++)await writeFile(targets[i]+'.tmp',json[i]);
  for(const target of targets)await rename(target+'.tmp',target);
  return {status:'RESEARCH_ONLY',included_contracts:batches.map(b=>({window:b.expiration_window,count:b.included_contracts})),eligibility_effect:'NONE'};
 }catch{
  for(const target of targets){await rm(target+'.tmp',{force:true});await rm(target,{force:true});}
  return {status:'UNAVAILABLE',reason:'No validated public recovery batch',eligibility_effect:'NONE'};
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await writeRecoveryBatches(process.argv[2])));
