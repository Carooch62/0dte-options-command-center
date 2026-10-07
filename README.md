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
- `OPTION_PRIORITY_TICKERS` (default `DKNG,JD,SOFI`) reserves option-chain coverage for watchlist names with available stock rows within the existing expansion budget. Set a comma-separated list, or an empty value to disable priorities. Browser tracker entries do not automatically change this server watchlist.
- Full same-day chains are retained. A rotating allocation revisits less highly ranked names, and core ETFs are always attempted when their price row is available.
- Preferred contracts require positive finite bid/ask, bid <= ask, verified signed delta >= 0.25 in absolute value, <=3% strike distance, volume >=20, spread <=$0.05 and <=20% of midpoint. At least 0.40 absolute delta is preferred. Gamma is displayed when available; no unverified high-gamma claim is made. All rules are research heuristics, not estimated win probabilities.
- Payload generation/receipt time is separate from an exchange quote timestamp. The current Cboe adapter preserves its naive payload clock but does not assume its undocumented meaning. Such chains remain `DELAYED_UNKNOWN_QUOTE_TIME` and watch-only until independently verified. No automatic live-confirmation capability is claimed for the free feed.
- Direction comes from recent signed movement. New second-wave events require a comparable same-session baseline (up to 15 minutes old), a new bar/qualification/acceleration/reversal/trigger, or a newly affordable contract. Old days never serve as a current trigger baseline.
- Call/put volume balance is cumulative activity, not buyer-initiated flow. Interval deltas compare matching contracts from the same provider and reject volume resets.

## Refresh and publishing

The browser's auto-check downloads published results. Manual scans dispatch a UUID carried through GitHub's run title and `scan_id`; an unrelated scheduled run cannot satisfy the request. The browser keeps job status separate from data freshness and follows failures by request ID. Cloudflare requests a scan every five minutes during regular weekday hours; GitHub queueing is still possible. The refresh Worker exposes `/refresh` and `/health?request_id=...`, holds the GitHub token server-side, and proxies data separately from static assets. Credentials never enter the dashboard or diagnostic logs.

Cloudflare deploy bundles only browser files under `public/`. The Worker and GitHub Pages UI read the current public repository data. Install secrets in GitHub/Cloudflare, not source files. Existing Cloudflare credentials and `GITHUB_TOKEN` are reused.

## Feedback, limits, and backup

`data/option-observations.json` records immutable signal-time asks and inputs; later bids produce gross quoted markouts at approximately 5, 15 and 30 minutes, with observed elapsed time. Unknown quote timing stays explicitly unverified. Sampled best/worst exit bids cannot establish intrabar excursion. No fill, net simulated profit, or live edge is inferred. The rolling files retain the latest 2,000 observations and 50 state snapshots; daily archives preserve previously archived records.

Prospective state snapshots also retain signed 15-/30-/60-minute movement (`recent_move` is the 15-minute field), invalidation price, chase risk and the second-wave event reason. Older snapshots without these fields remain unknown; do not reconstruct them from later scans. These reporting fields do not change eligibility or scores.

The journal stores entered fills, open/closed positions, quantity, and total fees in browser storage. P/L uses entered fees; export/import JSON provides portable backup. Optional per-trade premium, daily loss, total open premium, time-stop, and broker close-out reminders are user-defined and initially unset. They act only on locally recorded positions and do not submit or close orders.

## Verified release checks

Tests cover opening bars, null alignment, holidays/early closes, stale/future/unknown timestamps, crossed quotes, missing Greeks, relative spreads, signed momentum, second-wave baseline isolation, actual coverage counts, source failure vs no expiry, transient retries, preservation of last good data, immutable quote observations, browser aging, request correlation, and journal/risk calculations.


### Freshness and scan scheduling
Cloudflare dispatches the scanner every five minutes at minutes 1, 6, 11, etc. during New York regular weekday hours. It skips dispatch while a GitHub run is active or the same scheduled time slot was already requested. GitHub still executes the job and can queue it; the pipeline enforces exchange holidays. The browser's auto-check only downloads published results.

Cards distinguish stale price bars, stale snapshots, missing/failed downloads, and a closed session. The eight-minute freshness limit remains unchanged. When Yahoo returns stale completed bars, the scanner attempts the configured Alpaca feed and uses it only if its completed bar is newer; provider failure preserves the stale label.

Empty contract panels explain chain coverage and overlapping exclusion reasons for contracts within the current price range. Default state sorting favors matching contracts, then scanned chains, within the same execution state. Completed manual scans no longer suppress the next scheduled time slot.

## Longer-term trend context

`trend_context.py` adds completed adjusted daily-bar context over 5, 10 and 21 trading sessions (approximately one week, two weeks and one month). It uses Yahoo adjusted close and applies the close adjustment factor to daily highs/lows. Each horizon reports the adjusted price change and compares the high/low extremes of equal-sized early and recent blocks; the middle session is omitted from the structure comparison for odd-sized horizons. UP requires a positive change plus rising highs and lows; DOWN requires a negative change plus falling highs and lows; other complete horizons are MIXED. All three horizons must agree for overall UP/DOWN context.

Daily bars are included only after their session close plus a conservative 20-minute completion allowance. Missing sessions, missing adjustment data, short histories and stale sources remain explicit. Cards show the daily as-of date and alignment with the current five-minute direction, independently of entry readiness. These fields never change score, ranking, setup qualification, option filters or entry thresholds.

Daily context is cached in `data/trend-cache.json` until the next completed session. Fetches have a bounded time budget and failed sources retain historical context with UNKNOWN alignment and a retry delay. Scan history retains the context for prospective reviews. Cache and context additions are backward compatible with previous dashboard snapshots. Adjustment reference: https://in.help.yahoo.com/kb/adjusted-close-sln28256.html

### Trend filters and pattern evaluation

Both dashboard themes support a trend timeframe (intraday direction, 5-/15-minute movement, or daily 5, 10 and 21 sessions), direction (rising, falling, flat, mixed or unavailable/stale), and all-horizon alignment with the scan direction. Filters combine with the existing state, direction, catalyst and contract filters. Defaults include every trend; stale or missing daily sources cannot pass directional/alignment filters. Filtering does not change scanner scores or entry qualification.

Price and volume patterns are central research inputs: the current scanner measures signed 5/15-minute momentum, volume burst/acceleration, VWAP relationships, triggers, invalidation, chase risk and second-wave development. Longer-term adjusted high/low structure complements those inputs and is recorded prospectively. Evaluate alignment groups across multiple sessions using timestamped observations, source coverage and bid/ask costs before adding daily-trend score weights or hard gates. Stock moves, isolated winning trades and delayed marks do not establish executable option returns.

### Planned machine-learning phase

User request recorded October 2, 2026: once enough reliable data has accumulated, set up machine learning for the Command Center. This is an explicit project goal, not just an optional suggestion.

Readiness means enough distinct market sessions and usable, timestamped observations to support chronological training, validation and an untouched test period. Assess source freshness, missingness, contract coverage, spreads and fees, and avoid treating delayed quotes as fills or stock moves as option returns. Do not use an arbitrary trade-count target or assume two winning trades establish readiness.

When ready, build and evaluate a model against the existing rules on unseen sessions, then run it in shadow mode before changing live rankings or entry qualification. Revisit readiness during future session reviews. The scanner remains rule-based until this phase is explicitly implemented and validated.

### Compact Liquid Glass UI

`dashboard_glass.html` shows compact stock cards with last recorded status/time, intraday moves, daily trend summaries and contract shortlist above expandable setup/source details. Candidate filters collapse, active filter chips clear individual controls, and Reset all restores defaults. Independent setup/contract disclosure states survive rerenders. Scanner progress and snapshot freshness share one console; coverage remains expandable.

The prior layout is preserved at `dashboard_glass_previous.html` with its pinned `dashboard-app-previous.js`. It uses the same journal/star storage keys, so switching layouts does not reset recorded trades. Classic retains its existing layout. `dashboard_mobile_preview.html` provides a 390px phone frame for visual review. Scanner rules, ranking, refresh semantics and journal calculations are unchanged.
# Daily research retention and entry plans (2026-10-05)

`data/archive/YYYY-MM-DD/` uses America/New_York dates. Each retained scan is
stored once as a compressed JSON file under `scans/`; daily compressed option
observations retain events after they leave the rolling file and accept later
markout updates. Per-run health and matching receipts are under `receipts/`.
Python example: `json.loads(gzip.decompress(path.read_bytes()))`.

The first upgraded run backfills only history and observations still retained;
it cannot recover earlier missing scans. These archives are partial research
records, not complete exchange data. Quote timing, spreads, fees and missing
markouts retain their original limitations. No fills or browser-local journal
data are uploaded. Distinct-session coverage and trustworthy timestamps must
be audited before chronological model training, validation and an untouched
test period; then compare a frozen model with the existing rules in shadow mode.

After archival, successful scans retain the latest 50 snapshots in the live
history file. Its previous 200-row file had reached approximately 81 MiB and
generated GitHub large-file warnings. Daily archives have no automatic expiry;
monitor total repository growth. Archives are written before pruning live data.

The candidate footer now displays setup readiness, bar age, chase risk and
invalidation beside the broker link. An optional device-local plan records
contract, intended premium, maximum planned dollar loss and exit condition.
Its quote-check acknowledgement expires when the scan changes. It does not
place orders, create fills or promote WATCH into a qualified setup.

Publication-gap investigation: [run 37363416403](https://github.com/Carooch62/0dte-options-command-center/actions/runs/37363416403)
(19:26–19:41 UTC) and [run 37366654487](https://github.com/Carooch62/0dte-options-command-center/actions/runs/37366654487)
(19:56–20:11 UTC) on October 5 ended with no runner name and no recorded steps.
The successful intervening run started executing at 19:51:51 UTC and published
at 19:52:36 UTC. This supports a runner-start/publication problem rather than a
confirmed market-data fetch failure; the upstream cause is unknown. The Worker
now exposes runner waiting/failure notes and logs the unfinished run blocking
scheduled dispatch. No automatic cancellation, score or trading-filter changes
are made in response to this one session.

### Observation context (2026-10-06)
New option observations preserve signal-time qualification, execution readiness, chase risk, VWAP, signed 15-minute movement, volume ratio, invalidation, second-wave reason and daily trend context. A TRIGGERED observation is not necessarily a qualified setup. Missing fields in older observations remain unknown; no historical values are backfilled from later scans. This reporting change does not alter observation selection or trading rules.

## Expiration windows (2026-10-06)
The dashboard adds Same day (0), 1 week (1–7), 2 weeks (8–14), and 1 month (15–31 calendar days from the scan date). These are nonoverlapping windows, not promises of an exact weekly date. Actual dates appear on each match. Existing trend, direction, catalyst and ask filters still apply; use Matching contracts only to hide unmatched stocks.

The scanner retains returned contracts through 31 days from the same provider request. Later expirations are separately normalized in expiry_groups and never enter the existing 0DTE scoring, flow totals, observation selection or confirmation. Price, signed verified delta, volume, strike distance and spread requirements remain unchanged. A new successful scan is required to populate the windows; older snapshots show Not scanned. An incomplete fallback cannot prove no expiry exists. Missing Greeks remain ineligible. Later-expiry matches are research, not validated swing-trade entries. Same-day coverage statistics still refer to same-day chains.

### Low-theta screening
All expiration windows offer an optional daily-decay ceiling of 5%, 10%, or 20% of observed ask: `-reported theta / ask * 100`. Lower decay is the default tie-break after existing delta, spread, strike distance and volume priorities; no ceiling is applied by default. These are adjustable research settings, not backtested thresholds or a change to stock setup scores. Unknown/positive theta has no usable decay estimate; active caps exclude it. Explicitly reported zero is valid, but old snapshots without availability metadata and Nasdaq's missing Greeks are unavailable. Refresh with a new successful scan for theta metadata. Theta is a local model sensitivity, not a linear daily loss forecast, stop-loss, or guarantee of safety. Quote delays and fees still apply.

### Delta ranges
Contract eligibility requires verified signed delta and inclusive absolute delta 0.30–0.50 for same-day expiration; 0.70–0.80 for the 1-week, 2-week and 1-month swing research windows. Calls use positive delta and puts negative delta. Expiration windows serve as the holding-style proxy; later-expiry research still requires a separate swing thesis. Existing price, liquidity, spread, direction and theta filters also apply.
