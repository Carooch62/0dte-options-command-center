// A bounded private discovery pass. A partial chain cannot establish a best contract.
const dayET=now=>new Date(now).toLocaleDateString('en-CA',{timeZone:'America/New_York'});
const numeric=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function discoveryStock(snapshot,ticker,now=Date.now()){
 const generated=Date.parse(snapshot?.generated_at);
 if(snapshot?.market_session!=='OPEN'||!Number.isFinite(generated)||generated>now||now-generated>8*60000)return null;
 const stock=snapshot.candidates?.find(x=>x.ticker===ticker);
 if(!stock||!['UP','DOWN'].includes(stock.direction)||!['WATCH','SECOND-WAVE','TRIGGERED','CONFIRMED'].includes(stock.execution_state)||stock.setup_qualified!==true||!Number.isFinite(Date.parse(stock.bar_end))||Date.parse(stock.bar_end)>now||now-Date.parse(stock.bar_end)>8*60000||numeric(stock.price)<=0)return null;
 return stock;
}
export async function discoverOptionWatch(stock,call,now=Date.now(),maxPages=12){
 const side=stock.direction==='UP'?'call':'put',today=dayET(now),deadline=new Date(now+7*86400000).toLocaleDateString('en-CA',{timeZone:'America/New_York'});
 const chainData=await call('get_option_chains',{underlying_symbol:stock.ticker});
 const chains=chainData?.chains;
 if(!Array.isArray(chains)||chains.length>8)return {status:'COVERAGE_UNVERIFIED',reason:'Chain list unavailable'};
 const dates=[...new Set(chains.flatMap(x=>Array.isArray(x?.expiration_dates)?x.expiration_dates:[]).filter(x=>x>=today&&x<=deadline))].sort();
 if(!dates.length)return {status:'NO_EXPIRATION_IN_WINDOW',checked:0};
 // Check today's expiry if offered, otherwise the nearest expiry; never substitute another date silently.
 const expiry=dates[0],matching=chains.filter(x=>x.expiration_dates.includes(expiry));
 const instruments=[],seenCursor=new Set();let pages=0;
 for(const chain of matching){
  if(!uuid.test(chain.id)||chain.can_open_position!==true||numeric(chain.trade_value_multiplier)!==100)return {status:'COVERAGE_UNVERIFIED',reason:'Chain metadata unavailable',expiry};
  let cursor;
  do{
   if(++pages>maxPages)return {status:'COVERAGE_UNVERIFIED',reason:'Contract pagination limit reached',expiry,checked:instruments.length};
   const data=await call('get_option_instruments',{chain_id:chain.id,expiration_dates:expiry,type:side,state:'active',...(cursor?{cursor}:{})});
   if(!Array.isArray(data?.instruments)||data.instruments.length>100)return {status:'COVERAGE_UNVERIFIED',reason:'Contract list unavailable',expiry};
   for(const x of data.instruments){
    const strike=numeric(x?.strike_price);
    if(!uuid.test(x?.id)||x.chain_id!==chain.id||x.chain_symbol!==stock.ticker||x.expiration_date!==expiry||x.type!==side||strike===null)return {status:'COVERAGE_UNVERIFIED',reason:'Contract identity mismatch',expiry};
    if(x.state==='active'&&x.tradability==='tradable'&&numeric(x.trade_value_multiplier)===100&&Date.parse(x.sellout_datetime)>now&&Math.abs(strike-stock.price)/stock.price<=.03)instruments.push({...x,strike});
   }
   cursor=data.next||undefined;
   if(cursor&&(typeof cursor!=='string'||seenCursor.has(cursor)))return {status:'COVERAGE_UNVERIFIED',reason:'Contract pagination invalid',expiry};
   if(cursor)seenCursor.add(cursor);
  }while(cursor);
 }
 const unique=[...new Map(instruments.map(x=>[x.id,x])).values()];
 unique.sort((a,b)=>Math.abs(a.strike-stock.price)-Math.abs(b.strike-stock.price)||a.strike-b.strike);
 // Coverage of the full expiration is known; quote coverage is explicitly bounded to 20 near-ATM contracts.
 const cohort=unique.slice(0,20);
 if(!cohort.length)return {status:'NO_NEAR_ATM_CONTRACTS',expiry,checked:0,near_atm:0};
 const response=await call('get_option_quotes',{instrument_ids:cohort.map(x=>x.id)});
 const rows=response?.results;
 if(!Array.isArray(rows)||!rows.length||rows.length>20)return {status:'QUOTE_UNVERIFIED',expiry,checked:cohort.length};
 const byId=new Map(cohort.map(x=>[x.id,x])),seen=new Set(),passed=[];
 for(const item of rows){
  const q=item?.quote,id=q?.instrument_id;if(!byId.has(id)||seen.has(id))return {status:'QUOTE_UNVERIFIED',expiry,checked:cohort.length};seen.add(id);
  const instrument=byId.get(id),bid=numeric(q.bid_price),ask=numeric(q.ask_price),delta=numeric(q.delta),theta=numeric(q.theta),volume=numeric(q.volume),stamp=Date.parse(q.updated_at);
  const spread=ask!==null&&bid!==null?ask-bid:Infinity,relative=spread/((ask+bid)/2);
  if(!(bid>0&&ask>=bid&&ask>=.10&&ask<=.30&&spread<=.05+1e-9&&relative<=.20+1e-9&&volume>=20&&Number.isFinite(stamp)&&stamp<=now&&now-stamp<=60000&&theta!==null&&theta<=0))continue;
  const min=.30,max=.50;
  if(!(delta!==null&&(side==='call'?delta>=min&&delta<=max:delta<=-min&&delta>=-max)))continue;
  passed.push({ticker:stock.ticker,side,expiry,strike:instrument.strike,contract_id:instrument.id,bid,ask,delta,theta,volume,spread,spread_pct:relative*100,quote_updated_at:q.updated_at,sellout_datetime:instrument.sellout_datetime});
 }
 if(seen.size!==cohort.length)return {status:'QUOTE_UNVERIFIED',expiry,checked:cohort.length,quote_received:seen.size};
 passed.sort((a,b)=>Math.abs(Math.abs(a.delta)-.4)-Math.abs(Math.abs(b.delta)-.4)||a.spread_pct-b.spread_pct||b.volume-a.volume||a.ask-b.ask);
 return {status:passed.length?'VERIFIED_WATCH':'NO_QUALIFYING_QUOTE',expiry,side,checked:cohort.length,near_atm:unique.length,quote_received:seen.size,complete_chain:true,best:passed[0]||null,alternates:passed.slice(1,3)};
}
