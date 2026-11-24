export function coverageReport(coverage = {}) {
  const attempted = Number(coverage.chains_attempted);
  const omitted = Number(coverage.chains_not_attempted);
  if (!Number.isInteger(attempted) || attempted < 0 || !Number.isInteger(omitted) || omitted < 0 || attempted + omitted === 0) {
    return {summary: 'Option-chain coverage unknown.', incomplete: true};
  }
  const total = attempted + omitted;
  const percent = (100 * attempted / total).toFixed(1);
  return {
    summary: `Option-chain checks: ${attempted}/${total} (${percent}%).`,
    incomplete: omitted > 0 || Object.entries(coverage.chain_status_counts || {}).some(([status, count]) => Number(count) > 0 && !['SUCCESS', 'NO_EXPIRATION_TODAY'].includes(status)),
  };
}

export function sourceGaps(coverage = {}, candidates = []) {
  const received = coverage.stocks_received, configured = coverage.stocks_configured;
  const stock = Number.isInteger(received) && Number.isInteger(configured) && configured > 0 && received >= 0 && received < configured
    ? `Missing stock rows: ${configured - received}/${configured}.` : '';
  const failed = [...new Set(candidates.filter(row => row.chain_status === 'SOURCE_FAILURE').map(row => row.ticker))].sort();
  const chains = failed.length ? `Failed option sources: ${failed.slice(0, 12).join(', ')}${failed.length > 12 ? ` (+${failed.length - 12} more)` : ''}.` : '';
  const total=coverage.same_day_contract_observations, verified=coverage.same_day_verified_delta_observations;
  const quality=Number.isInteger(total)&&total>=0&&Number.isInteger(verified)&&verified>=0&&verified<=total ? `Verified delta: ${verified}/${total} returned same-day contract observations. Quote freshness and entry checks remain separate.` : '';
  return [stock, chains, quality].filter(Boolean).join(' ');
}

export function boardAvailability(rows, matchingStocks) {
  const prefix = `${rows.length} stock rows loaded · ${matchingStocks} stocks have contracts passing your current price and quality filters for this expiry.`;
  if (!rows.length) return 'No stock rows loaded in this snapshot. Contract availability is unknown.';
  if (matchingStocks > 0) return prefix;
  const options = rows.flatMap(row => row.options || []);
  if (!options.length) return prefix + ' No option contracts were returned for this expiry; missing or unchecked sources do not establish that no suitable contracts exist.';
  const verified = options.filter(o => (o.delta_verified ?? o.greeks_verified) === true && Number.isFinite(o.delta) && ((o.side === 'call' && o.delta > 0 && o.delta <= 1) || (o.side === 'put' && o.delta < 0 && o.delta >= -1)));
  return prefix + (verified.length ? ' Returned quotes do not pass all selected filters; inspect a stock’s contract details for reasons.' : ` None of the ${options.length} returned contracts has verified delta. Contract matching is blocked by missing provider data, not proof that no suitable contracts exist.`);
}
