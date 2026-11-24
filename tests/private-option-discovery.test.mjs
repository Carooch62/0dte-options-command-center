import test from 'node:test';
import assert from 'node:assert/strict';
import {discoveryStock,discoverOptionWatch} from '../private-option-discovery.js';
const now=Date.parse('2026-11-24T15:00:00Z'),ticker='ABC',chainId='11111111-1111-1111-1111-111111111111',id='22222222-2222-2222-2222-222222222222';
const stock={ticker,price:100,direction:'UP',execution_state:'TRIGGERED',setup_qualified:true,bar_end:'2026-11-24T14:59:00Z'};
const snapshot={market_session:'OPEN',generated_at:'2026-11-24T14:59:00Z',candidates:[stock]};
const instrument={id,chain_id:chainId,chain_symbol:ticker,expiration_date:'2026-11-25',type:'call',strike_price:'101',trade_value_multiplier:'100',state:'active',tradability:'tradable',sellout_datetime:'2026-11-25T20:30:00Z'};
const quote={instrument_id:id,bid_price:'.18',ask_price:'.20',delta:'.40',theta:'-.02',volume:100,updated_at:'2026-11-24T14:59:40Z'};
const provider=async(name)=>name==='get_option_chains'?{chains:[{id:chainId,can_open_position:true,trade_value_multiplier:'100',expiration_dates:['2026-11-25']}]}:name==='get_option_instruments'?{instruments:[instrument]}:{results:[{quote}]};
test('finds a verified next-day call when public same-day coverage is empty',async()=>{
 assert.equal(discoveryStock(snapshot,ticker,now),stock);
 const result=await discoverOptionWatch(stock,provider,now);
 assert.equal(result.status,'VERIFIED_WATCH');assert.equal(result.expiry,'2026-11-25');assert.equal(result.best.contract_id,id);assert.equal(result.complete_chain,true);
});
test('fails closed on stale setup, incomplete pagination or missing quotes',async()=>{
 assert.equal(discoveryStock(snapshot,ticker,now+9*60000),null);
 assert.equal((await discoverOptionWatch(stock,async name=>name==='get_option_chains'?{chains:[{id:chainId,can_open_position:true,trade_value_multiplier:'100',expiration_dates:['2026-11-25']}]}:name==='get_option_instruments'?{instruments:[instrument],next:'cursor'}:{results:[{quote}]},now,1)).status,'COVERAGE_UNVERIFIED');
 assert.equal((await discoverOptionWatch(stock,async name=>name==='get_option_quotes'?{results:[]}:provider(name),now)).status,'QUOTE_UNVERIFIED');
 assert.equal((await discoverOptionWatch(stock,async name=>name==='get_option_quotes'?{results:[{quote:{...quote,updated_at:'2026-11-24T14:58:00Z'}}]}:provider(name),now)).status,'NO_QUALIFYING_QUOTE');
});
