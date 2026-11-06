import {candidateQuotes} from './candidate-quotes.js';

export function countQualifiedQuotes(candidates,observations,now){
 const rows=candidateQuotes({candidates},observations,now);
 const observationsById=new Map(observations.map(value=>[value.quote?.instrument_id,value]));
 return rows.filter(row=>{
  if(row.status!=='QUOTE_CHECK_PASSED'||row.premium_status!=='WITHIN_LIMIT'||row.spread>.05+1e-9||row.spread_pct>20+1e-9)return false;
  const observation=observationsById.get(row.instrument_id);
  const delta=Number(observation?.quote?.delta);
  const volume=Number(observation?.quote?.volume);
  const signedDelta=observation?.instrument?.type==='put'?-delta:delta;
  return signedDelta>=.30&&signedDelta<=.50&&Number.isFinite(volume)&&volume>=20;
 }).length;
}
