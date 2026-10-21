# Pre-test source reconciliation — October 20, 2026

Result: **PASS**, scoped to the full published snapshot and its private-loader identity batch at repository commit `a461414abd508f73f38da3b6ee708136439cce7f`.

Source: `scheduled-5975087`, generated `2026-10-20T19:57:21.798336+00:00` (3:57:21 p.m. ET). This is retained October 20 data; the historical `OPEN` field does not establish freshness tonight or tomorrow. Repeat the audit against tomorrow's new snapshot/batch from a single pinned commit.

| Check | Result |
| --- | --- |
| Scanner stock rows | 206 |
| Exact valid contract identities scanned | 44,496 |
| Research asks >0 and <=$0.30 | 9,496 |
| Rejected by remaining published screens | 9,470 |
| Eligible contracts | 26 |
| Included by selection policy | 20 |
| Omitted by two-per-ticker limit | 4 (XLF) |
| Omitted by twenty-contract limit | 2 (RIG) |
| Identity/order/ask/source/counter mismatches | 0 |
| Conflicting duplicate source identities | 0 |
| Eligible flags contradicted by raw numeric checks | 0 |

The audit reads original `options` and every `expiry_groups` option; it imports neither the production candidate projector nor its quality helpers. It validates exact ticker/expiry/side/strike identities, price and explicit published screens, stable score ordering within scanner ticker order, selection caps, original clocks and counters. For eligible contracts it independently checks positive two-sided books, spread limits, strike distance, verified signed delta and actual expiry-to-market-date DTE. It does not re-score or alter production selections.

SHA-256 input fingerprints:

```text
market-dashboard.json
ee2f7acce674f7a452ef0b0c56019eef22b76d40e7c1a841664c696ab1421412
candidate-quote-batch.json
9669683700095e8076ca0ca10e1c67772239d1c922f020139c84bbb15c6d0d66
```

Run `python scripts/audit-candidate-batch.py data/market-dashboard.json data/candidate-quote-batch.json` from the repository root. The script returns nonzero for a failed reconciliation. Fault-injection tests cover selected identity/ask/count drift, missing screens, contradictory raw evidence, conflicting duplicates, caps, stable tied-score order and rejection of compact input.

This closes the published snapshot-to-batch reconciliation gap. It does **not** establish upstream raw-provider completeness, current Robinhood identity matching, quote freshness or speedup. No production defect was found by this audit; no runtime change or rollback was needed. See [test checklist](market-open-test-checklist.md) and [rollback guide](quote-test-rollback.md). Private timing inputs and reports remain outside this repository.
