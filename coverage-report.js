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
  return [stock, chains].filter(Boolean).join(' ');
}
