# Research-to-live spread reconciliation

Use the original full snapshot and its candidate batch, pinned to the export's
`scanner_context.scan_id` and `generated_at`. Today's latest snapshot is not a
substitute for the scan used earlier in a test.

Run locally:

```sh
python scripts/diagnose-private-spreads.py original-snapshot.json original-batch.json private-export.json
```

Output includes private observations. Do not commit, publish or put it in public
dashboard assets. The generic diagnostic code and synthetic tests are public;
private test exports are not.

The tool first runs the independent snapshot-to-batch audit, then joins exact
audited identities. It rejects mismatched scan clocks, conflicting duplicate
observations, invalid observation clocks and unexpected contracts. Exact
duplicate observations are counted once. Per-contract output separates research
books, computed live spread failures, reported quote checks, observed-batch
missingness and live asks above $0.30. An absent contract remains missing, not a
pass. Counts do not infer whole empty or failed requests.

Both live spread limits must pass: at most $0.10 absolute and 30% of midpoint.
The private page now shows these quantities when a spread check fails. A cheap
ask does not excuse a wide spread, and a narrow spread does not excuse a live
ask over the price limit. No scoring, selection, acceptance, refresh behavior,
capture clocks or export schema changes are made by this diagnostic work.

A research/live difference alone cannot distinguish market movement, venue/book
coverage differences or stale research. In particular, missing or timezone-naive
individual option timestamps remain unverified. Never substitute a scan,
payload, receipt or last-trade clock for the book's timestamp. Do not infer that
a fresh provider timestamp means the book improved or that its prices changed.

Keep valid live gates in place. Do not blacklist a symbol or loosen its spread
threshold from one cohort. Investigate repeated source disagreements across
comparable sessions before changing candidate selection.
