// A bounded, same-scan status for the private quote page. It does not approve a trade.
export function privateSetupCheck(batch,context,quote,now=Date.now()){
 if(!context||context.scan_id!==batch?.scan_id)return {label:'Stock setup unavailable · verify separately'};
 const generated=Date.parse(batch.generated_at),bar=Date.parse(context.bar_end);
 if(batch.market_session!=='OPEN'||!Number.isFinite(generated)||!Number.isFinite(bar)||generated>now||bar>now||now-generated>8*60000||now-bar>8*60000)return {label:'Stock scan stale · wait for fresh scan'};
 if(context.setup_qualified!==true||!['TRIGGERED','CONFIRMED'].includes(context.execution_state))return {label:'Stock setup not confirmed'};
 if(context.direction!==(context.side==='call'?'UP':'DOWN')||context.near_atm!==true||!(context.volume>=20))return {label:'Stock and contract direction or liquidity fail'};
 if(quote.status!=='QUOTE_CHECK_PASSED'||quote.premium_status!=='WITHIN_LIMIT'||quote.delta_check!=='PREFERRED_RANGE'||!Number.isFinite(quote.age_seconds)||quote.age_seconds<0||quote.age_seconds>60)return {label:'Private quote, price or delta not confirmed'};
 return {label:'Core setup and quote pass · review remaining filters'};
}
