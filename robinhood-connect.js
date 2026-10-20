import {requestJSON} from './private-request.js';
const $=id=>document.getElementById(id);
const status=$('rh-live-status');
async function api(path,body){
 return requestJSON(`/private/plaid/robinhood/${path}`,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json','X-Requested-With':'RobinhoodQuotes'},...(body===undefined?{}:{body:JSON.stringify(body)})},30000);
}
async function load(){
 $('rh-live-connect').disabled=true;$('rh-live-disconnect').disabled=true;$('rh-live-test').disabled=true;
 try{const data=await api('status');$('rh-connect-help').textContent=data.connected?'Already connected. Connect is disabled because authorization is active. Use Fetch private quotes or open candidate quotes.':data.status==='RECONNECT_REQUIRED'?'Authorization expired. Use Connect Robinhood to renew access.':'Use Connect Robinhood to authorize private quote requests.';$('rh-live-connect').disabled=data.connected;$('rh-live-disconnect').disabled=!data.expires_at;$('rh-live-test').disabled=!data.connected;status.textContent=data.connected?`Connected for private quote testing. Authorization expires ${data.expires_at}. Scanner still uses delayed research data.`:data.status==='RECONNECT_REQUIRED'?'Authorization expired. Reconnect Robinhood to resume private quote testing.':'Ready to connect. The scanner feed remains delayed until verification is complete.';}
 catch(e){status.textContent=e.message;$('rh-connect-help').textContent='Connection status could not be checked. Reload this page after private sign-in; account sync uses a separate connection.';}
}
$('rh-live-connect').onclick=async()=>{try{$('rh-live-connect').disabled=true;const data=await api('connect',{});const target=new URL(data.authorization_url);if(target.origin!=='https://robinhood.com'||target.pathname!=='/oauth')throw Error('Unexpected authorization destination');window.location.assign(target.href);}catch(e){status.textContent=e.message;$('rh-live-connect').disabled=false;}};
$('rh-live-disconnect').onclick=async()=>{try{const data=await api('disconnect',{});$('rh-live-results').textContent='';await load();status.textContent=data.revocation_note;}catch(e){status.textContent=e.message;}};
$('rh-live-test').onclick=async()=>{
 $('rh-live-test').disabled=true;
 try{const kind=$('rh-live-kind').value,values=$('rh-live-symbols').value.split(/[\s,]+/).filter(Boolean);const data=await api('quotes',kind==='equity'?{kind,symbols:values.map(x=>x.toUpperCase())}:{kind,instrument_ids:values});const output=$('rh-live-results');output.replaceChildren();
 const note=document.createElement('p');note.textContent=`${data.source} · Received ${data.received_at}. Refresh timestamps do not prove exchange latency. Greek calculation times are unknown.`;output.append(note);
 for(const row of data.observations){const p=document.createElement('p');p.textContent=`${row.quote.symbol||row.quote.instrument_id||'Quote'} · Bid ${row.quote.bid_price??'unknown'} / Ask ${row.quote.ask_price??'unknown'} · Updated ${row.quote.venue_last_trade_time??row.quote.updated_at??'unknown'} · ${Object.entries(row.clocks).map(([name,clock])=>name+': '+(clock.age_seconds===null?'unknown':clock.age_seconds.toFixed(1)+' seconds')+' '+clock.freshness).join(' / ')} · Book ${row.book_status}`;output.append(p);}
 status.textContent='Private quotes collected. The scanner feed remains delayed.';
 }catch(e){status.textContent=e.message;}finally{$('rh-live-test').disabled=false;}
};
await load();
