// Private, read-only candidate projection and exact provider metadata matching.
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const num=v=>typeof v==='number'||typeof v==='string'&&v.trim()!==''?Number(v):NaN;
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function contractRequest(body){
 if(!Array.isArray(body?.contracts)||!body.contracts.length||body.contracts.length>20)throw Error('Supply 1–20 exact contracts');
 const rows=body.contracts.map(c=>{
  if(!/^[A-Z][A-Z0-9.-]{0,9}$/.test(c.ticker||'')||!date(c.expiry)||!['call','put'].includes(c.side)||!Number.isFinite(num(c.strike))||num(c.strike)<=0||num(c.strike)>1000000)throw Error('Invalid contract identity');
  return {ticker:c.ticker,expiry:c.expiry,side:c.side,strike:num(c.strike)};
 });
 const keys=rows.map(c=>JSON.stringify(c));if(new Set(keys).size!==keys.length)throw Error('Duplicate contract identity');return rows;
}
export function projectCandidates(snapshot){
 if(!Array.isArray(snapshot?.candidates)||!Number.isFinite(Date.parse(snapshot.generated_at)))throw Error('Scanner snapshot is invalid');
 const selected=[],seen=new Set();let total=0,qualifying=0;
 for(const c of snapshot.candidates){
  for(const o of [...(c.options||[]),...Object.values(c.expiry_groups||{}).flatMap(g=>g?.options||[])]){
   let identity;try{identity=contractRequest({contracts:[{...o,ticker:c.ticker} ]})[0];}catch{continue;}
   const key=JSON.stringify(identity);if(seen.has(key))continue;seen.add(key);total++;
   const ask=num(o.ask);if(!(ask>0&&ask<=.30))continue;qualifying++;
   if(selected.length<20)selected.push({ticker:identity.ticker,options:[{contract_id:o.contract_id||`${identity.ticker} ${identity.strike} ${identity.side} ${identity.expiry}`,...identity,scanner_ask:ask}]});
  }
 }
 return {format:'candidate-identities-v1',environment:'production',source:'main / market-dashboard.json',generated_at:snapshot.generated_at,scan_id:snapshot.scan_id??null,market_session:snapshot.market_session??null,candidates:selected,scanned_contracts:total,total_contracts:qualifying,qualifying_contracts:qualifying,included_contracts:selected.length,omitted_contracts:qualifying-selected.length,selection:'First 20 unique contracts in scanner order with research ask > $0 and <= $0.30. Live ask is checked separately.',ranking_effect:'NONE'};
}
export function validateBatch(s){
 if(s?.format!=='candidate-identities-v1'||!Number.isFinite(Date.parse(s.generated_at))||!Array.isArray(s.candidates)||s.candidates.length>20)throw Error('Invalid candidate batch');
 const contracts=[];
 for(const c of s.candidates){if(!Array.isArray(c.options)||c.options.length!==1||!(num(c.options[0].scanner_ask)>0&&num(c.options[0].scanner_ask)<=.30))throw Error('Invalid batch selection');contracts.push({...c.options[0],ticker:c.ticker});}
 if(contracts.length)contractRequest({contracts});
 if(s.included_contracts!==contracts.length||!Number.isInteger(s.total_contracts)||s.total_contracts<contracts.length||s.omitted_contracts!==s.total_contracts-contracts.length||s.qualifying_contracts!==s.total_contracts)throw Error('Invalid batch coverage');
 return s;
}
export async function readSnapshot(response,limit=65536){
 if(!response.ok)throw Error('Current scanner snapshot is unavailable');
 if(Number(response.headers.get('Content-Length'))>limit)throw Error('Scanner snapshot exceeds private loader limit');
 const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,text='';
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw Error('Scanner snapshot exceeds private loader limit');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();return validateBatch(JSON.parse(text));}finally{await reader.cancel().catch(()=>{});}
}
export async function resolveContracts(contracts,call){
 const chains=new Map(),results=[],identities=new Map();
 for(const c of contracts){
  if(!chains.has(c.ticker)){
   const data=await call('get_option_chains',{underlying_symbol:c.ticker});
   if(data.chains===null)data.chains=[];
   if(!Array.isArray(data.chains)||data.chains.length>8||data.chains.some(x=>!uuid.test(x?.id)||!Array.isArray(x.expiration_dates)))throw Error('Unsupported option-chain response');
   chains.set(c.ticker,data.chains);
  }
  const eligible=chains.get(c.ticker).filter(x=>x.expiration_dates.includes(c.expiry));
  const matches=new Map();let complete=true;
  for(const chain of eligible){
   let cursor,count=0;const cursors=new Set();
   do{
    const data=await call('get_option_instruments',{chain_id:chain.id,expiration_dates:c.expiry,strike_price:String(c.strike),type:c.side,state:'active',...(cursor?{cursor}:{})});
    if(data.instruments===null)data.instruments=[];
    if(!Array.isArray(data.instruments)||data.instruments.length>100)throw Error('Unsupported contract metadata response');
    for(const i of data.instruments){
     if(i?.chain_id!==chain.id||i.chain_symbol!==c.ticker||i.expiration_date!==c.expiry||i.type!==c.side||num(i.strike_price)!==c.strike||!uuid.test(i.id))throw Error('Provider contract identity mismatch');
     const safe=Object.fromEntries(['id','chain_id','chain_symbol','expiration_date','type','strike_price','trade_value_multiplier','state','tradability','sellout_datetime','underlying_type'].filter(k=>['string','number'].includes(typeof i[k])).map(k=>[k,i[k]]));
     if(matches.has(i.id)&&JSON.stringify(matches.get(i.id))!==JSON.stringify(safe))throw Error('Conflicting contract metadata');matches.set(i.id,safe);
    }
    cursor=data.next??undefined;if(cursor!==undefined&&typeof cursor!=='string')throw Error('Invalid metadata cursor');
    if(cursor&&(cursors.has(cursor)||++count>=5)){complete=false;break;}if(cursor)cursors.add(cursor);
   }while(cursor);
  }
  for(const id of matches.keys()){const identity=JSON.stringify(c);if(identities.has(id)&&identities.get(id)!==identity)throw Error('Contract UUID reused for different identities');identities.set(id,identity);}
  const reason=!complete?'INCOMPLETE_METADATA':matches.size>1?'AMBIGUOUS_CONTRACT':!matches.size?'NO_CONTRACT_MATCH':null;
  results.push({contract:c,status:reason||'EXACT_METADATA_MATCH',instrument:reason?null:[...matches.values()][0]});
 }
 return results;
}
