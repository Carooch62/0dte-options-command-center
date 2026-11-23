// Read-only diagnostics. Never print provider bodies, log lines, URLs or commands.
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function classify(lines) {
  const text = JSON.stringify(lines).toLowerCase();
  return Object.entries({AUTHORIZATION: /authentication error|invalid api token|unauthorized|permission denied/, WORKER_NAME: /worker name.*mismatch|name.*does not match/, MISSING_COMMAND: /missing script|command not found/, DEPENDENCY: /npm err|err_pnpm|could not resolve/, CONFIGURATION: /invalid.*wrangler|could not find.*wrangler/, BUILD_FAILURE: /build failed|deployment failed|deploy failed/}).filter(([,pattern]) => pattern.test(text)).map(([label]) => label);
}
export async function inspect({token,account,fetcher=fetch}) {
  if (!token || !/^[a-f0-9]{32}$/i.test(account || '')) throw new Error('Missing diagnostic token or valid account ID');
  const outcomes=[];
  async function get(path,label) {
    let response;
    try { response=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}`,{method:'GET',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000),redirect:'error'}); }
    catch {outcomes.push({step:label,status:'NETWORK_ERROR'});return null;}
    if (!response.ok) {outcomes.push({step:label,status:`HTTP_${response.status}`});return null;}
    let body;
    try {body=await response.json();} catch {outcomes.push({step:label,status:'INVALID_JSON'});return null;}
    if (body.success!==true) {outcomes.push({step:label,status:'API_FAILURE'});return null;}
    outcomes.push({step:label,status:'OK'});return body.result;
  }
  const scripts=await get('workers/scripts','worker metadata');
  const worker=Array.isArray(scripts)?scripts.find(x=>x.id==='0dte-options-command-center'):null;
  if (!worker?.tag || !/^[a-zA-Z0-9_-]+$/.test(worker.tag)) return {outcomes,acceptance:'INCOMPLETE',reason:'Worker metadata/tag unavailable'};
  const config=await get(`builds/workers/${worker.tag}`,'build settings');
  const builds=await get(`builds/workers/${worker.tag}/builds`,'build history');
  const reports=[];
  for (const build of (Array.isArray(builds)?builds:[]).slice(0,5)) {
    const id=build.build_uuid;
    if (!/^[a-f0-9-]{36}$/i.test(id || '')) continue;
    const logs=await get(`builds/builds/${id}/logs`,'build logs');
    reports.push({build_uuid:id,outcome:['success','fail','skipped','cancelled','terminated'].includes(build.build_outcome)?build.build_outcome:'UNKNOWN',categories:logs?classify(logs.lines):[],logsAvailable:!!logs,logsTruncated:logs?.truncated===true});
  }
  return {outcomes,previewsEnabled:typeof config?.previews_enabled==='boolean'?config.previews_enabled:null,builds:reports,acceptance:outcomes.every(x=>x.status==='OK')&&reports.length?'READ_ACCESS_CHECKED':'INCOMPLETE',limitations:'Only first five returned builds and first log page reviewed. Error categories are clues; raw evidence requires private review. No production diagnosis or configuration change inferred.'};
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const report=await inspect({token:process.env.CLOUDFLARE_DIAGNOSTICS_API_TOKEN,account:process.env.CLOUDFLARE_ACCOUNT_ID});
    const output=JSON.stringify(report,null,2);
    console.log(output);
    if(process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Cloudflare read-only diagnostics\n\n\`\`\`json\n${output}\n\`\`\`\n`);
    if(report.acceptance==='INCOMPLETE') process.exitCode=1;
  } catch {console.error('Diagnostic prerequisites unavailable; no provider body emitted.');process.exitCode=1;}
}
