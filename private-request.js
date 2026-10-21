// Browser-only request handling. No response bodies or credentials enter diagnostics.
export class RequestFailure extends Error {
 constructor(code,message,status=null){super(message);this.name='RequestFailure';this.code=code;this.status=status;}
}
export async function requestJSON(url,options={},timeoutMs=20000,fetcher=fetch){
 const controller=new AbortController();let timer;
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(new RequestFailure('TIMEOUT','Request timed out. Retry when ready; authorization has not been checked.'));controller.abort();},timeoutMs);});
 try{return await Promise.race([timeout,(async()=>{
  let response;
  try{response=await fetcher(url,{cache:'no-store',credentials:'same-origin',...options,redirect:'manual',signal:controller.signal});}
  catch(e){if(e instanceof RequestFailure)throw e;throw new RequestFailure('NETWORK','Private service could not be reached. Check your network and retry; this does not establish an authorization problem.');}
  const json=response.headers.get('content-type')?.includes('application/json');
  if(response.type==='opaqueredirect'||response.status>=300&&response.status<400||response.status===401||response.redirected&&!json||response.ok&&!json)throw new RequestFailure('SIGN_IN','Private sign-in required. Open Connections, sign in, then retry.',response.status);
  if(!json)throw new RequestFailure('SERVICE',`Service returned HTTP ${response.status}. Retry; authorization status is unknown.`,response.status);
  let data;try{data=await response.json();if(!data||typeof data!=='object')throw Error();}catch{throw new RequestFailure('INVALID_RESPONSE','Service returned an unreadable response. Retry without replacing the batch.',response.status);}
  if(!response.ok){
   const code=data.status==='RECONNECT_REQUIRED'||response.status===409?'AUTHORIZATION':data.status==='SETUP_REQUIRED'?'SETUP':response.status===403?'ACCESS_DENIED':response.status>=500?'SERVICE':'REQUEST';
   const message={AUTHORIZATION:'Robinhood authorization needs renewal. Open Connections to reconnect.',SETUP:'Private service setup needs attention. Reconnecting alone may not resolve it.',ACCESS_DENIED:'Private access was denied. Review Connections and your private sign-in.',SERVICE:'Private service request failed. Retry; this does not establish an authorization problem.',REQUEST:'Request was rejected. Review the batch and retry.'}[code];
   throw new RequestFailure(code,message,response.status);
  }
  return data;
 })()]);}finally{clearTimeout(timer);}
}
const operations=new Set(['status','candidates','resolve','quotes']);
const codes=new Set(['SUCCESS','TIMEOUT','NETWORK','SIGN_IN','AUTHORIZATION','SETUP','ACCESS_DENIED','SERVICE','REQUEST','INVALID_RESPONSE']);
export function safeRequestAttempts(attempts){
 return (Array.isArray(attempts)?attempts:[]).slice(-200).filter(x=>operations.has(x?.operation)&&codes.has(x.code)&&Number.isFinite(Date.parse(x.started_at))&&Number.isFinite(Date.parse(x.finished_at))&&Date.parse(x.finished_at)>=Date.parse(x.started_at)&&Number.isFinite(x.browser_ms)&&x.browser_ms>=0).map(x=>({operation:x.operation,code:x.code,started_at:x.started_at,finished_at:x.finished_at,browser_ms:Math.round(x.browser_ms),http_status:Number.isInteger(x.http_status)&&x.http_status>=100&&x.http_status<=599?x.http_status:null}));
}
