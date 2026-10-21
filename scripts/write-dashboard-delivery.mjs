// Read-only delivery projections. The complete research snapshot remains unchanged.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function deliverySnapshot(snapshot){
 if(!Array.isArray(snapshot?.candidates)||!Number.isFinite(Date.parse(snapshot.generated_at))||!snapshot.scan_id)throw Error('Invalid dashboard delivery source');
 return {...snapshot,delivery_window:'today',candidates:snapshot.candidates.map(row=>({...row,expiry_groups:{}}))};
}
export async function writeDashboardDelivery(directory='data'){
 const snapshot=JSON.parse(await readFile(resolve(directory,'market-dashboard.json'),'utf8'));
 const target=resolve(directory,'market-dashboard-today.json'),text=JSON.stringify(deliverySnapshot(snapshot),(_,value)=>Object.is(value,-0)?JSON.rawJSON('-0'):value);
 await writeFile(target+'.tmp',text);await rename(target+'.tmp',target);
 return {scan_id:snapshot.scan_id,bytes:Buffer.byteLength(text)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await writeDashboardDelivery(process.argv[2])));
