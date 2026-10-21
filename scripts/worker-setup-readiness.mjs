// Deployment metadata can lag immediately after a version or secret update.
export const REQUIRED_BINDINGS=Object.freeze(['ROBINHOOD_CLIENT_ID','ROBINHOOD_REDIRECT_URI','PLAID_STORE','PLAID_ENCRYPTION_KEY','CF_ACCESS_TEAM_DOMAIN','CF_ACCESS_AUD','CF_ACCESS_EMAIL']);
export async function inspectWorkerBindings(read,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
 const delays=[0,1000,2000,4000,8000];let missing=[...REQUIRED_BINDINGS];
 for(let attempt=0;attempt<delays.length;attempt++){
  if(delays[attempt])await wait(delays[attempt]);
  const settings=await read();
  const names=new Set((Array.isArray(settings?.bindings)?settings.bindings:[]).map(binding=>binding?.name).filter(name=>typeof name==='string'));
  missing=REQUIRED_BINDINGS.filter(name=>!names.has(name));
  if(!missing.length)return {missing,attempts:attempt+1};
 }
 return {missing,attempts:delays.length};
}
