# Live quote validation — public preflight (November 3, 2026)

This is a **manual, read-only** release gate for the first authenticated quote-collection pilot. It does not authorize Robinhood access, fetch private quotes, rank trades, place orders, or change production scoring.

## Why a new gate is needed

At the November 2 evening check, the public scanner finished successfully but `data/candidate-quote-batch.json` was labeled `AFTER HOURS`. It contained five published research candidates, including a November 2-expiring option. A successful workflow does **not** establish a current market session or tradable contract. The next exchange session is November 3 (XNYS calendar, 9:30 a.m. ET normal open).

The batch includes candidates with research ask at most $0.30; those numbers are **not current executable asks**.

## Off-hours dry run

```bash
python scripts/public_quote_preflight.py
```

Expected outside the regular session: status `NOT_READY` with `XNYS_NOT_OPEN`, regardless of successful GitHub scans. No change to any stored data occurs.

## Next session, at or after 9:40 a.m. ET

1. Check that the main scanner has published a **new** and **validated** production batch. Run the public preflight again; it checks XNYS calendar, Eastern session date, batch/health freshness, matching scan IDs, contract expiration, strict research-ask budget, contract identity and batch counts. A clean result is **READY_FOR_MANUAL_PRIVATE_CHECK**—**never LIVE_GO**. The CLI exits 2 for any nonready public condition.
2. Open the protected [Connections](https://0dte-options-command-center.h69htk56cq.workers.dev/brokerage.html) page in an authorized Safari session. Confirm Robinhood authorization status. A disabled Connect button or connected label is not proof of successful quote retrieval. Do not weaken Cloudflare Access to troubleshoot.
3. Open [Quotes](https://0dte-options-command-center.h69htk56cq.workers.dev/candidate-quotes) in the same authorized browser. Load the current $0.30 batch and verify identity/timestamp. Match exact contracts once and fetch actual quotes. No batch or no provider access means a **documented failed collection**, not permission to fall back to unscreened options.
4. Keep the cohort and browser tab. Save the first quote and manually refresh at the provider-timed 5/10/15-minute collection windows. Timestamp must fall within target through target+60 seconds. Missing windows remain missing. Do not substitute later prices for missed captures.
5. Export **both** `private-quote-outcomes.json` and **Export quotes for brokerage review**. On Connections, import the full completed-trade snapshot first (if there were any executions), then the quote-only research pack and export the merged private file. Never include personal records in public GitHub issues, commits, files, or CI artifacts.
6. Run the separate offline `scripts/audit_private_capture.py` on private exported files outside the public checkout; preserve the raw samples privately and inspect aggregate stale/failing quotes and 5/10/15-minute coverage. Do not confuse public `data/ml-readiness.json` with private research coverage.

## Stop conditions

Reject any pilot as a **verified open-session capture** if the public batch is stale/after-hours, scan ID mismatches health, expired contracts appear, authorization fails, any response has inconsistent provider timestamps, or the session is closed. Preserve diagnostic evidence and retry in another actual trading session. Quote checks and budget alone cannot establish setup eligibility, a fill, or a live trading recommendation.

The documented latency pilot minimum remains **20 successful foreground requests across at least two independently verified open sessions**. This sample threshold is not an ML-readiness test. Provider real-time exchange latency, read-only permissions, stable control coverage, point-in-time feature completeness, and chronological validation remain unverified until measured and audited.

## No automatic trading

The initial manual production quote pilot is observation-only. No changes to 40/38/10/7/5 reference weights, production scoring, stop-loss decisions, order execution, or auto-polling are made by this preflight.
