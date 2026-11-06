// This page is served only after the private watch handler verifies Cloudflare Access.
export function discordSetupPage(){
 const nonce=crypto.randomUUID().replace(/-/g,'');
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Discord alerts · Private setup</title>
<style nonce="${nonce}">body{font:16px system-ui;max-width:720px;margin:40px auto;padding:0 20px;background:#10151d;color:#f3f6fb}a{color:#a4cdff}input,button{font:inherit;padding:12px;border-radius:10px}input{width:100%;box-sizing:border-box;background:#1c2530;color:white;border:1px solid #788}button{margin:12px 8px 12px 0;background:#c9e4ff;color:#10151d;border:0;cursor:pointer}button:disabled{opacity:.5;cursor:wait}p{line-height:1.5}.note{color:#c6d2df}</style>
<main><h1>Discord alert setup</h1><p class="note">Paste a webhook from your private Discord channel. It is encrypted in the Worker's private storage. The page never displays it again. Live verified-option alerts remain off until Robinhood access and the exact contract link are confirmed.</p>
<p id="status" role="status">Checking setup…</p><label for="webhook">Discord webhook URL</label><input id="webhook" type="password" autocomplete="off" spellcheck="false" placeholder="https://discord.com/api/webhooks/…">
<p><button id="save" type="button">Save webhook</button><button id="test" type="button">Send test message</button><button id="remove" type="button">Remove webhook</button></p>
<p class="note">The test is labeled TEST ONLY. It does not report a trade signal. Enable phone notifications for this channel in Discord if you want a phone alert.</p></main>
<script nonce="${nonce}">
const status=document.getElementById('status'),field=document.getElementById('webhook');
const buttons=['save','test','remove'].map(id=>document.getElementById(id));
async function call(method,path,body){const r=await fetch(path,{method,credentials:'same-origin',headers:{'X-Requested-With':'ContractWatch',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data;}
async function refresh(){try{const data=await call('GET','/private/watch/webhook');status.textContent=data.configured?'Webhook configured ('+data.managed_in+'). Verified alerts are still off.':'No Discord webhook configured.';buttons[0].disabled=buttons[2].disabled=data.managed_in==='cloudflare';buttons[1].disabled=!data.configured;}catch(e){status.textContent=e.message;}}
async function perform(action){buttons.forEach(button=>button.disabled=true);try{if(action==='save'){await call('PUT','/private/watch/webhook',{webhook_url:field.value});field.value='';status.textContent='Webhook saved. Use Send test message to verify.';}else if(action==='test'){await call('POST','/private/watch',{action:'test'});status.textContent='Test message submitted. Check your Discord channel.';}else{await call('DELETE','/private/watch/webhook');status.textContent='Webhook removed.';}await refresh();}catch(e){status.textContent=e.message;await refresh();}}
buttons.forEach((button,i)=>button.addEventListener('click',()=>perform(['save','test','remove'][i])));refresh();
</script></html>`;
 return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`}});
}
