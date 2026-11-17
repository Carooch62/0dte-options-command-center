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
    incomplete: omitted > 0,
  };
}
