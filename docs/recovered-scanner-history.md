# Recovered scanner history

The supplemental archive preserves ten public snapshots from September 30 and October 1, 2, 5 and 6, 2026 recovered from prior data commits. Each snapshot retains its original generation timestamp, source commit SHA and commit availability timestamp. Comparisons require both generation and commit availability to precede the provider transaction timestamp, and stay within the same Eastern trading date. These are research comparisons; provider transaction time is not a verified execution timestamp. Entry quote timing and Greeks remain unavailable.

This is a partial recovery, not a complete historical dataset. October 5 history was recovered with a local Git fetch after API retrieval exceeded the size limit. Searches of the scan-history path found no commits before September 30, 2026; earlier trade dates still lack matching history. No private account records are stored in this archive.

Reconciliation accepts separate strictly ordered buy-to-open/sell-to-close cycles with equal contract quantities. Overlapping lots, partial closes, tied times and lifecycle events remain unresolved. Confirmed fill timestamps remain null unless supplied by an execution record.

Validation: node --test tests/plaid-reconciliation.test.mjs tests/brokerage-cycles.test.mjs


Recovery validated on October 7, 2026: 10 unique snapshots, nonempty candidate coverage, generation before source commit availability, and no private transaction records. The archive covers five distinct session dates. This does not establish ML readiness: exact execution and quote timestamps remain unaudited, and an untouched chronological test period has not been established.
