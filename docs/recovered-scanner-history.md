# Recovered scanner history

The supplemental archive preserves four public October 6, 2026 snapshots recovered from prior data commits. Each snapshot retains its original generation timestamp, source commit SHA and commit availability timestamp. Comparisons require both generation and commit availability to precede the provider transaction timestamp, and stay within the same Eastern trading date. These are research comparisons; provider transaction time is not a verified execution timestamp. Entry quote timing and Greeks remain unavailable.

This is a partial recovery, not a complete historical dataset. October 5 historical files exceeded the retrieval limit and are not included. No private account records are stored in this archive.

Reconciliation accepts separate strictly ordered buy-to-open/sell-to-close cycles with equal contract quantities. Overlapping lots, partial closes, tied times and lifecycle events remain unresolved. Confirmed fill timestamps remain null unless supplied by an execution record.

Validation: node --test tests/plaid-reconciliation.test.mjs tests/brokerage-cycles.test.mjs
