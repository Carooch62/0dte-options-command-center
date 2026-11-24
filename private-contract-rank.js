import {privateSetupCheck} from './private-setup-check.js';

// Rank only the bounded private batch after its exact, current broker checks pass.
export function bestVerifiedContract(batch, rows, now=Date.now()) {
  if (!batch || !Array.isArray(rows)) return null;
  const contexts = new Map(batch.candidates?.flatMap(c => (c.options || []).map(o => [o.contract_id || `${c.ticker} ${o.strike} ${o.side} ${o.expiry}`, o.setup_context])) || []);
  const passing = rows.filter(row =>
    privateSetupCheck(batch, contexts.get(row.contract), row, now).label === 'Core setup and quote pass · review remaining filters'
    && Number.isFinite(row.ask) && row.ask > 0 && row.ask <= .30
    && Number.isFinite(row.spread_pct) && Number.isFinite(row.delta));
  passing.sort((a,b) =>
    Math.abs(Math.abs(a.delta)-.4)-Math.abs(Math.abs(b.delta)-.4)
    || a.spread_pct-b.spread_pct || a.ask-b.ask || String(a.contract).localeCompare(String(b.contract)));
  return passing[0] || null;
}
