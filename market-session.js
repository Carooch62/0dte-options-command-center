// Worker memory only: negotiated transport setup, never quotes or access tokens.
export class MarketSessionCache {
 #entries=new Map();
 constructor({ttlMs=300000,maxEntries=32,now=()=>Date.now()}={}){if(!Number.isFinite(ttlMs)||ttlMs<=0||!Number.isInteger(maxEntries)||maxEntries<1)throw Error('Invalid session cache bounds');this.ttlMs=ttlMs;this.maxEntries=maxEntries;this.now=now;}
 async get(key,authorizationExpiresAt,initialize){
  const now=this.now();
  if(!Number.isFinite(authorizationExpiresAt)||authorizationExpiresAt<=now+15000)throw Error('Authorization is too close to expiry');
  for(const [id,entry] of this.#entries)if(entry.expiresAt<=now)this.#entries.delete(id);
  const prior=this.#entries.get(key);
  if(prior&&authorizationExpiresAt>now+15000){
   this.#entries.delete(key);this.#entries.set(key,prior);
   return {value:prior.value,reused:true};
  }
  const value=await initialize();
  const expiresAt=Math.min(now+this.ttlMs,authorizationExpiresAt-15000);
  // A provider without session IDs is initialized normally for every request.
  if(typeof value.session==='string'&&value.session&&Number.isFinite(expiresAt)&&expiresAt>this.now()){
   while(this.#entries.size>=this.maxEntries)this.#entries.delete(this.#entries.keys().next().value);
   this.#entries.set(key,{value:{session:value.session},expiresAt});
  }
  return {value,reused:false};
 }
 drop(key){this.#entries.delete(key);}
 dropPrefix(prefix){for(const key of this.#entries.keys())if(key.startsWith(prefix))this.#entries.delete(key);}
 clear(){this.#entries.clear();}
}
export const marketSessions=new MarketSessionCache();
