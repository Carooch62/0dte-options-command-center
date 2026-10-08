import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const script=new URL('../scripts/setup-robinhood-client.mjs',import.meta.url).href;
function setup({publicCallback=false,missingStorage=false}={}){
 const runner=`
 process.env.CLOUDFLARE_ACCOUNT_ID='mock-account';process.env.CLOUDFLARE_API_TOKEN='PRIVATE-DEPLOYMENT-TOKEN';delete process.env.GITHUB_STEP_SUMMARY;
 const writes=[];
 globalThis.fetch=async(url,options={})=>{
  if(url.includes('api.cloudflare.com')){
   if(url.endsWith('/secrets')){writes.push(JSON.parse(options.body));return Response.json({success:true,result:{}});}
   if(url.endsWith('/settings'))return Response.json({success:true,result:{bindings:['ROBINHOOD_CLIENT_ID','ROBINHOOD_REDIRECT_URI',${missingStorage?'':"'PLAID_STORE',"}'PLAID_ENCRYPTION_KEY','CF_ACCESS_TEAM_DOMAIN','CF_ACCESS_AUD','CF_ACCESS_EMAIL'].map(name=>({name,type:'secret_text',text:'PRIVATE-BINDING-VALUE'}))}});
   return Response.json({success:false},{status:403});
  }
  if(${publicCallback}&&url.endsWith('/callback'))return new Response('Unprotected',{status:200});
  return new Response(null,{status:302,headers:{Location:'https://test.cloudflareaccess.com/login'}});
 };
 await import(${JSON.stringify(script)});
 console.log('Enabled: '+writes.find(x=>x.name==='ROBINHOOD_CONNECTION_ENABLED').text);
 if(writes.some(x=>!['ROBINHOOD_CLIENT_ID','ROBINHOOD_REDIRECT_URI','ROBINHOOD_CONNECTION_ENABLED'].includes(x.name)))throw Error('Unexpected credential mutation');
 `;
 return execFileSync(process.execPath,['--input-type=module','-e',runner],{encoding:'utf8'});
}
test('explicit manual retry preserves private route guards and reports unverified authorization',()=>{
 const output=setup();assert.match(output,/Enabled: true/);assert.match(output,/"private_prerequisites_ready":true/);assert.match(output,/MANUAL_RETRY_UNVERIFIED/);assert.ok(!output.includes('PRIVATE-DEPLOYMENT-TOKEN'));assert.ok(!output.includes('PRIVATE-BINDING-VALUE'));assert.match(output,/"automatic_polling_enabled":false/);
});
test('an unprotected callback cannot activate quote connection',()=>{assert.match(setup({publicCallback:true}),/Enabled: false/);});
test('missing encrypted storage cannot activate quote connection',()=>{assert.match(setup({missingStorage:true}),/Enabled: false/);});
