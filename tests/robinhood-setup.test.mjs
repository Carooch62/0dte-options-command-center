import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const script=new URL('../scripts/setup-robinhood-client.mjs',import.meta.url).href;
function setup({publicCallback=false,missingStorage=false,transientMetadata=false}={}){
 const runner=`
 process.env.CLOUDFLARE_ACCOUNT_ID='mock-account';process.env.CLOUDFLARE_API_TOKEN='PRIVATE-DEPLOYMENT-TOKEN';delete process.env.GITHUB_STEP_SUMMARY;
 const writes=[];let metadataReads=0;
 globalThis.setTimeout=callback=>{queueMicrotask(callback);return 0;};
 globalThis.fetch=async(url,options={})=>{
  if(url.includes('api.cloudflare.com')){
   if(url.endsWith('/secrets')){writes.push(JSON.parse(options.body));return Response.json({success:true,result:{}});}
   if(url.endsWith('/settings')&&${transientMetadata}&&metadataReads++===0)return Response.json({success:true,result:{}});
   if(url.endsWith('/settings'))return Response.json({success:true,result:{bindings:['ROBINHOOD_CLIENT_ID','ROBINHOOD_REDIRECT_URI',${missingStorage?'':"'PLAID_STORE',"}'PLAID_ENCRYPTION_KEY','CF_ACCESS_TEAM_DOMAIN','CF_ACCESS_AUD','CF_ACCESS_EMAIL'].map(name=>({name,type:'secret_text',text:'PRIVATE-BINDING-VALUE'}))}});
   return Response.json({success:false},{status:403});
  }
  if(${publicCallback}&&url.endsWith('/callback'))return new Response('Unprotected',{status:200});
  return new Response(null,{status:302,headers:{Location:'https://test.cloudflareaccess.com/login'}});
 };
 let setupError=null;try{await import(${JSON.stringify(script)});}catch(error){setupError=error.message;}
 console.log('Enabled: '+(writes.find(x=>x.name==='ROBINHOOD_CONNECTION_ENABLED')?.text??'UNCHANGED'));
 if(setupError){console.log('Setup check: '+setupError);process.exitCode=1;}
 if(writes.some(x=>!['ROBINHOOD_CLIENT_ID','ROBINHOOD_REDIRECT_URI','ROBINHOOD_CONNECTION_ENABLED'].includes(x.name)))throw Error('Unexpected credential mutation');
 `;
 const result=spawnSync(process.execPath,['--input-type=module','-e',runner],{encoding:'utf8'});return {output:result.stdout,code:result.status};
}
test('explicit manual retry preserves private route guards and reports unverified authorization',()=>{
 const {output,code}=setup();assert.equal(code,0);assert.match(output,/Enabled: true/);assert.match(output,/"private_prerequisites_ready":true/);assert.match(output,/MANUAL_RETRY_UNVERIFIED/);assert.ok(!output.includes('PRIVATE-DEPLOYMENT-TOKEN'));assert.ok(!output.includes('PRIVATE-BINDING-VALUE'));assert.match(output,/"automatic_polling_enabled":false/);
});
test('an unprotected callback cannot activate quote connection',()=>{const {output,code}=setup({publicCallback:true});assert.equal(code,1);assert.match(output,/Enabled: UNCHANGED/);assert.match(output,/"connection_flag_updated":false/);});
test('missing encrypted storage cannot activate quote connection',()=>{const {output,code}=setup({missingStorage:true});assert.equal(code,1);assert.match(output,/Enabled: UNCHANGED/);assert.match(output,/"connection_flag_updated":false/);});

test('temporary empty metadata cannot disable the existing connection',()=>{const {output,code}=setup({transientMetadata:true});assert.equal(code,0);assert.match(output,/Enabled: true/);assert.match(output,/"metadata_attempts":2/);assert.ok(!output.includes('Enabled: false'));});
