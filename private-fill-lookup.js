// Strictly project confirmed buy-to-open executions for one exact option.
// This module never calculates net P/L or invents missing fee information.
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const positive = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0;

export function reviewAccount(accounts, expected) {
  if (!expected || !Array.isArray(accounts)) throw Error('Review account is not configured');
  const matches = accounts.filter(a => a?.account_number === expected && a.brokerage_account_type === 'individual');
  if (matches.length !== 1) throw Error('Review account is unavailable');
  return matches[0].account_number;
}

export function projectFillLookup({orders, position, instrument, complete}) {
  if (!complete || !uuid.test(instrument?.id) || !positive(instrument.trade_value_multiplier) || !Array.isArray(orders)) throw Error('Incomplete fill evidence');
  const fills = [], seen = new Set();
  for (const order of orders) {
    if (!order || !Array.isArray(order.legs)) throw Error('Incomplete order evidence');
    const legs = order.legs.filter(leg => leg.option_id === instrument.id);
    for (const leg of legs) {
      if (leg.expiration_date !== instrument.expiration_date || Number(leg.strike_price) !== Number(instrument.strike_price) || leg.option_type !== instrument.type) throw Error('Contract mismatch');
      if (leg.side !== 'buy' || leg.position_effect !== 'open') continue;
      if (!Array.isArray(leg.executions)) {
        if (Number(order.processed_quantity) === 0) continue;
        throw Error('Execution detail unavailable');
      }
      for (const execution of leg.executions) {
        if (!uuid.test(execution?.id) || seen.has(execution.id) || !positive(execution.price) || !positive(execution.quantity) || !Number.isInteger(Number(execution.quantity)) || !Number.isFinite(Date.parse(execution.timestamp))) throw Error('Invalid execution evidence');
        seen.add(execution.id);
        fills.push({execution_id:execution.id,order_state:order.state,price:Number(execution.price),quantity:Number(execution.quantity),executed_at:execution.timestamp,fees:null});
      }
    }
  }
  fills.sort((a,b) => a.executed_at.localeCompare(b.executed_at));
  const openQuantity = position && positive(position.quantity) ? Number(position.quantity) : 0;
  return {contract:{ticker:instrument.chain_symbol,expiry:instrument.expiration_date,side:instrument.type,strike:Number(instrument.strike_price),instrument_id:instrument.id,multiplier:Number(instrument.trade_value_multiplier)},fills,open_quantity:openQuantity,fees_status:'UNKNOWN',coverage:'Orders in requested lookback; open position is a separate current snapshot. Multiple fills and later sells require manual reconciliation. No net P/L inferred.'};
}
