import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareVerifiedOptionAlert} from '../watch-alert.js';

const now=Date.parse('2026-11-05T15:31:00Z');
const id='b6864f13-709c-42ba-a6f9-f3dc2bdcbe83';
const candidate={ticker:'TEST',options:[{expiry:'2026-11-05',side:'call',strike:10}]};
const observation={
 instrument:{id,chain_symbol:'TEST',type:'call',expiration_date:'2026-11-05',strike_price:10,trade_value_multiplier:100,state:'active',tradability:'tradable',sellout_datetime:'2026-11-05T20:30:00Z'},
 quote:{instrument_id:id,updated_at:new Date(now-2000).toISOString(),bid_price:.24,ask_price:.26,delta:.4,volume:50},
 received_at:new Date(now-1000).toISOString()
};
const scan={scan_id:'scan-one',generated_at:new Date(now-1000).toISOString(),execution_state:'TRIGGERED',market_session:'OPEN'};
const link={verified:true,instrument_id:id,source:'robinhood-provider',href:'https://robinhood.com/options/example'};
test('formats a verified alert with the actual contract and quote clocks',()=>{
 const alert=prepareVerifiedOptionAlert(candidate,observation,link,scan,now);
 assert.equal(alert.key,'scan-one:'+id);
 assert.match(alert.text,/TEST \$10 CALL exp 2026-11-05/);
 assert.match(alert.text,/ask \$0.26 \(about \$26.00 per 100-share contract\)/);
 assert.match(alert.text,/https:\/\/robinhood.com\/options\/example/);
});
test('never invents a Robinhood URL or accepts an unrelated instrument link',()=>{
 for(const value of [null,{...link,verified:false},{...link,instrument_id:'other'},
  {...link,href:'https://robinhood.com.attacker.example/options/example'},
  {...link,href:'https://robinhood.com@evil.example/options/example'},
  {...link,href:'http://robinhood.com/options/example'}])
  assert.equal(prepareVerifiedOptionAlert(candidate,observation,value,scan,now),null);
});
test('requires the current open scan and a qualifying exact quote',()=>{
 assert.equal(prepareVerifiedOptionAlert(candidate,observation,link,{...scan,market_session:'CLOSED'},now),null);
 assert.equal(prepareVerifiedOptionAlert(candidate,observation,link,scan,now+6*60_000),null);
 for(const patch of [{ask_price:.31},{updated_at:new Date(now-61_000).toISOString()},{volume:0},{delta:.1}])
  assert.equal(prepareVerifiedOptionAlert(candidate,{...observation,quote:{...observation.quote,...patch}},link,scan,now),null);
});
