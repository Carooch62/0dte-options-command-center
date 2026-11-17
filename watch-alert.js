// Exact contract identity and quote eligibility remain mandatory. Robinhood does
// not support contract deep links; the home link explicitly requires manual lookup.
import {candidateQuotes} from './candidate-quotes.js';

const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const cents=value=>'$'+Number(value).toFixed(2);
export function prepareVerifiedOptionAlert(candidate,observation,link,scan,now=Date.now()){
 const option=candidate?.options?.[0],instrument=observation?.instrument,quote=observation?.quote;
 if(!option||!instrument||!quote||!uuid.test(instrument.id)||!scan?.scan_id||
   !['TRIGGERED','CONFIRMED'].includes(scan.execution_state)||scan.market_session!=='OPEN'||
   !Number.isFinite(Date.parse(scan.generated_at))||Date.parse(scan.generated_at)>now||
   now-Date.parse(scan.generated_at)>5*60_000)return null;
 const row=candidateQuotes({candidates:[candidate]},[observation],now)[0];
 const delta=Number(quote.delta),volume=Number(quote.volume);
 const signedDelta=instrument.type==='put'?-delta:delta;
 if(row?.status!=='QUOTE_CHECK_PASSED'||row.premium_status!=='WITHIN_LIMIT'||
   row.spread>.05+1e-9||row.spread_pct>20+1e-9||
   !Number.isFinite(delta)||signedDelta<.30||signedDelta>.50||
   !Number.isFinite(volume)||volume<20)return null;
 // A link is supplied by a trusted provider resolver. Never synthesize a contract URL.
 const generalLink=link==null;
 if(!generalLink&&(link?.verified!==true||link.instrument_id!==instrument.id||link.source!=='robinhood-provider'))return null;
 let url;try{url=new URL(generalLink?'https://robinhood.com/':link.href);}catch{return null;}
 if(url.protocol!=='https:'||url.hostname!=='robinhood.com'&&url.hostname!=='www.robinhood.com'||
   url.username||url.password||url.search||url.hash||(!generalLink&&url.pathname==='/'))return null;
 const identity=`${candidate.ticker} $${option.strike} ${option.side.toUpperCase()} exp ${option.expiry}`;
 return {
  key:`${scan.scan_id}:${instrument.id}`,instrument_id:instrument.id,
  ticker:candidate.ticker,side:option.side,strike:Number(option.strike),expiry:option.expiry,
  bid:row.bid,ask:row.ask,observed_at:row.observed_at,
  link_kind:generalLink?'manual-contract-lookup':'provider-contract',
  discord_text:`OPTION SETUP TO REVIEW — ${identity}. Stock setup: ${scan.execution_state}. Open Robinhood and manually select this exact expiration, strike and call/put. Check the current quote and setup before deciding. ${url.href}`,
  text:`OPTION SETUP TO REVIEW — ${identity}. Verified Robinhood bid ${cents(row.bid)} / ask ${cents(row.ask)} (about ${cents(row.ask*100)} per 100-share contract); delta ${signedDelta.toFixed(2)}, volume ${volume}. Quote refreshed ${row.observed_at}; scan published ${scan.generated_at}. Prices can change. Review the contract and current quote before buying. ${generalLink?'Open Robinhood and manually select the exact contract. ':''}${url.href}`,
  link:url.href
 };
}

