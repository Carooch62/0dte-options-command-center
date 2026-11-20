// Candidate only: does not alter the active Pages source or historical archive tree.
import {execFileSync} from 'node:child_process';
import {cpSync,mkdirSync,readdirSync,statSync,writeFileSync,readFileSync} from 'node:fs';
execFileSync(process.execPath,['scripts/build-assets.mjs'],{stdio:'inherit'});
const out='public';mkdirSync(out+'/data',{recursive:true});let bytes=0,files=0;
for(const name of ['market-dashboard.json','market-dashboard-today.json','scan-health.json','scan-receipts.json','later-expiry-shadow.json'])if(statSync('data/'+name).isFile())cpSync('data/'+name,out+'/data/'+name);
// Repository raw URLs remain the authoritative archive route used by brokerage readers.
writeFileSync(out+'/.nojekyll','');
function measure(dir){for(const name of readdirSync(dir)){const path=dir+'/'+name,s=statSync(path);if(s.isDirectory())measure(path);else{bytes+=s.size;files++;}}}measure(out);
const report={format:'pages-candidate-size-v1',files,bytes,archives_copied:false,archive_source:'https://github.com/Carooch62/0dte-options-command-center/tree/main/data/archive',deployment_status:'NOT_ACTIVATED',limitation:'Existing historical Pages URLs require a compatibility decision before switching the production Pages source. Repository archives are unchanged.'};
writeFileSync('pages-candidate-size.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
