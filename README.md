# 0DTE Options Command Center

Public-data research scanner with a mobile dashboard. Default preferred asks are $0.10–$0.30. Delayed or unknown quote timing is never represented as a live entry.

## Run and test

```sh
pip install -r requirements.txt
python -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/*.test.mjs
python pipeline.py
python -m http.server 8765
```

Open `http://localhost:8765/dashboard_v2.html`. `pipeline.py` scans in a temporary directory, validates the entire result, then writes the data set. A failed run only updates `data/scan-health.json`; GitHub commits the resulting set together. The workflow is restricted to main.

## Data and eligibility

- A static universe plus public gainers, losers and most-active discovery is scanned. Discovery coverage and failures are visible; this is not a claim to cover every listed stock.
- Five-minute OHLCV bars are aligned by timestamp. Partial bars are excluded. The current session has its own VWAP. Missing longer horizons remain null. NYSE holidays and early closes use `exchange-calendars`.
- Yahoo chart requests retry transient errors and try a second Yahoo host. Both are the same provider. An optional independent Alpaca bar fallback uses server-side `APCA_API_KEY_ID` and `APCA_API_SECRET_KEY`. Without those credentials it is unavailable, explicitly logged. Default Alpaca feed is IEX, whose volume covers a single exchange. `ALPACA_DATA_FEED=sip` requests bars ending 16 minutes ago; these are marked stale for confirmation. No brokerage trading endpoint is used.
- Cboe chains are filtered by actual parsed expiration. A complete returned chain without today's date is `NO_EXPIRATION_TODAY`; failed requests are `SOURCE_FAILURE`. An empty/incomplete Nasdaq fallback is `EMPTY_UNVERIFIED`. None are conflated with `NOT_SCANNED`.
- Full same-day chains are retained. A rotating allocation revisits less highly ranked names, and core ETFs are always attempted when their price row is available.
- Preferred contracts require positive finite bid/ask, bid <= ask, verified signed delta >= 0.25 in absolute value, <=3% strike distance, volume >=20, spread <=$0.05 and <=20% of midpoint. At least 0.40 absolute delta is preferred. Gamma is displayed when available; no unverified high-gamma claim is made. All rules are research heuristics, not estimated win probabilities.
- Payload generation/receipt time is separate from an exchange quote timestamp. The current Cboe adapter preserves its naive payload clock but does not assume its undocumented meaning. Such chains remain `DELAYED_UNKNOWN_QUOTE_TIME` and watch-only until independently verified. No automatic live-confirmation capability is claimed for the free feed.
- Direction comes from recent signed movement. New second-wave events require a comparable same-session baseline (up to 15 minutes old), a new bar/qualification/acceleration/reversal/trigger, or a newly affordable contract. Old days never serve as a current trigger baseline.
- Call/put volume balance is cumulative activity, not buyer-initiated flow. Interval deltas compare matching contracts from the same provider and reject volume resets.

## Refresh and publishing

The browser's auto-check downloads published results. Manual scans dispatch a UUID carried through GitHub's run title and `scan_id`; an unrelated scheduled run cannot satisfy the request. The browser keeps job status separate from data freshness and follows failures by request ID. GitHub schedules approximately every five minutes; queueing is possible. The refresh Worker exposes `/refresh` and `/health?request_id=...`, holds the GitHub token server-side, and proxies data separately from static assets. Credentials never enter the dashboard or diagnostic logs.

Cloudflare deploy bundles only browser files under `public/`. The Worker and GitHub Pages UI read the current public repository data. Install secrets in GitHub/Cloudflare, not source files. Existing Cloudflare credentials and `GITHUB_TOKEN` are reused.

## Feedback, limits, and backup

`data/option-observations.json` records immutable signal-time asks and inputs; later bids produce gross quoted markouts at approximately 5, 15 and 30 minutes, with observed elapsed time. Unknown quote timing stays explicitly unverified. Sampled best/worst exit bids cannot establish intrabar excursion. No fill, net simulated profit, or live edge is inferred. Last 2,000 observations and 200 state snapshots are retained.

The journal stores entered fills, open/closed positions, quantity, and total fees in browser storage. P/L uses entered fees; export/import JSON provides portable backup. Optional per-trade premium, daily loss, total open premium, time-stop, and broker close-out reminders are user-defined and initially unset. They act only on locally recorded positions and do not submit or close orders.

## Verified release checks

Tests cover opening bars, null alignment, holidays/early closes, stale/future/unknown timestamps, crossed quotes, missing Greeks, relative spreads, signed momentum, second-wave baseline isolation, actual coverage counts, source failure vs no expiry, transient retries, preservation of last good data, immutable quote observations, browser aging, request correlation, and journal/risk calculations.
