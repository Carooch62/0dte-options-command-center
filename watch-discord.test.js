import test from 'node:test';
import assert from 'node:assert/strict';
import {discordWatchMessage,sendDiscordWatchEvent,sendDiscordTestMessage} from './watch-discord.js';
const event={status:'TRIGGERED_RECHECK_REQUIRED',generated_at:'2026-11-02T15:01:00Z',watch:{ticker:'TEST',expiry:'2026-11-06',direction:'UP',strike:11}};
test('research-only message disables mentions',()=>{const m=discordWatchMessage(event);assert.match(m.content,/delayed research, not an entry/);assert.deepEqual(m.allowed_mentions,{parse:[]});});
test('no secret means no network delivery',async()=>{assert.deepEqual(await sendDiscordWatchEvent(event,{},()=>{throw Error('network called')}),{status:'not-configured'});});
test('valid secret uses only Discord webhook host and reports failure safely',async()=>{
 const env={DISCORD_WATCH_WEBHOOK_URL:'https://discord.com/api/webhooks/123/placeholder'};
 let count=0;assert.deepEqual(await sendDiscordWatchEvent(event,env,async(url,options)=>{count++;assert.match(url,/^https:\/\/discord.com\/api\/webhooks\//);assert.equal(JSON.parse(options.body).allowed_mentions.parse.length,0);return {ok:true};}),{status:'sent'});assert.equal(count,1);
 await assert.rejects(sendDiscordWatchEvent(event,{DISCORD_WATCH_WEBHOOK_URL:'https://example.com/api/webhooks/123/placeholder'},()=>{throw Error('network called')}),/Invalid Discord webhook/);
 await assert.rejects(sendDiscordWatchEvent(event,env,async()=>({ok:false,status:429})),/Discord delivery HTTP 429/);
});
test('manual test delivery says TEST ONLY and never mentions users',async()=>{
 const env={DISCORD_WATCH_WEBHOOK_URL:'https://discord.com/api/webhooks/123/placeholder'};
 await sendDiscordTestMessage(env,async(url,options)=>{const body=JSON.parse(options.body);assert.match(body.content,/^TEST ONLY/);assert.match(body.content,/No contract triggered/);assert.deepEqual(body.allowed_mentions,{parse:[]});return {ok:true};});
});
