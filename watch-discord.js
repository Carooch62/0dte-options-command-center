// Research alerts only. The webhook must be supplied as a Worker secret.
export function discordWatchMessage(event) {
  const w=event?.watch||{};
  if(event?.status!=='TRIGGERED_RECHECK_REQUIRED'||!w.ticker||!w.expiry||!['UP','DOWN'].includes(w.direction))throw Error('Invalid watch event');
  const ticker=String(w.ticker).replace(/[^A-Z0-9.]/gi,'').slice(0,12);
  const expiry=String(w.expiry).replace(/[^0-9-]/g,'').slice(0,10);
  if(!ticker||!/^\d{4}-\d{2}-\d{2}$/.test(expiry))throw Error('Invalid watch identity');
  const side=w.direction==='UP'?'call':'put';
  const strike=Number(w.strike);
  const contract=Number.isFinite(strike)&&strike>0?` $${strike} ${side}`:` ${side}`;
  const time=new Date(event.generated_at);
  if(!Number.isFinite(time.getTime()))throw Error('Invalid scan time');
  return {content:`Research recheck: ${ticker}${contract} exp ${expiry} — stock setup changed WATCH → TRIGGERED in the published scan (${time.toISOString()}). This is delayed research, not an entry or a live option quote. Verify the exact contract, current Robinhood bid/ask, liquidity, and setup before deciding.`,allowed_mentions:{parse:[]}};
}

export async function sendDiscordWatchEvent(event,env,fetcher=fetch) {
  const webhook=env?.DISCORD_WATCH_WEBHOOK_URL;
  if(!webhook)return {status:'not-configured'};
  let url;try{url=new URL(webhook);}catch{throw Error('Invalid Discord webhook configuration');}
  if(url.protocol!=='https:'||url.hostname!=='discord.com'||!/^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url.pathname))throw Error('Invalid Discord webhook configuration');
  let response;try{response=await fetcher(url.toString(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(discordWatchMessage(event)),signal:AbortSignal.timeout(10000)});}catch{throw Error('Discord delivery network failure');}
  if(!response.ok)throw Error(`Discord delivery HTTP ${response.status}`);
  return {status:'sent'};
}
