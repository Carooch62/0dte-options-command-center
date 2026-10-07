# Robinhood private research workflow

Implemented October 7, 2026. Added-cost budget: $0. The authenticated Robinhood Quotes chat plugin provides read-only quote, contract, order and bar collection. The hosted Worker does not inherit that OAuth connection. No trading calls are used by this workflow.

## Collection order

1. Read the scanner shortlist and record its scan ID, publication time and selection reason. Include WATCH/PASS controls deliberately; keep their selection labels.
2. Resolve chains and exact contracts, then collect quotes in batches of at most 20. Retain instrument UUID, multiplier, expiry and `sellout_datetime`. Record actual response-reception time and verify the official session calendar before labeling session_status `open`.
3. Preserve bid/ask, sizes, provider `updated_at`, delta/theta and all raw fields. `updated_at` is a quote-refresh clock; separate bid/ask event and Greek-calculation clocks are unknown. Repeated observations may have the same quote clock but different Greeks. The display's 60-second age flag is a reporting check, not a trading threshold or proof of latency. Entry delta ranges use absolute delta (1–14 days .30–.50; swing .70–.80); theta is reported without inventing a new cutoff.
4. Fetch option orders for the user's relevant accounts and explicit UTC date range. Follow every pagination cursor. Retain per-execution IDs, prices, quantities and original fractional-second timestamps. Do not turn cancelled/unfilled orders into fills. Preserve `placed_agent`, including `expiring_option`. Account keys must be stable private aliases; omit account numbers.
5. Fetch regular-session five-minute underlying bars. Keep raw bars, bounds, interval and collection time. Ignore interpolated/unfinished bars in research calculations. The volume formulas here are explicitly reported and do not replace scanner calculations; approximate bar VWAP is not tick VWAP.

## Private snapshot format

`robinhood-research-v1` contains `retrieved_at`, `accounts`, `observations` and `bars` arrays:

- accounts: `{account_key, coverage_note, orders}` using the tool's order records. Coverage notes include queried date range and whether pagination finished.
- observations: `{instrument, quote, received_at, session_status, selection, scan_id?}` using the exact resolved instrument and quote. Keep shortlist/control selection reasons. Never label a held contract as a scanner-selected candidate without evidence.
- bars: tool results `{symbol, interval, bounds, bars}`. This version accepts one regular session per series.

Import on the protected `/brokerage.html` page. Data stays in page memory and is never POSTed, saved in localStorage, committed, or included in public assets. Quote age is recalculated every 30 seconds; no new prices are fetched by the website. Export before leaving. Subsequent snapshot imports retain collected quote observations; the latest file supplies order and underlying coverage. Keep complete order coverage in each import.

Order review pairs only adjacent, equal-quantity long opening/closing executions for the same account and contract. Overlapping lots, partial fills and uncovered closes remain unmatched for review. Fees are absent in these tool responses: gross is reported, net is unknown. Plaid transaction IDs and Robinhood execution IDs are different namespaces; no guessed join is made. Current Greeks are not historical entry Greeks. A subsequent import with a different account alias would prevent cross-snapshot comparison.

## Remaining hosted integration

Automatic collection requires a separately authorized private backend connection. Do not copy ChatGPT OAuth tokens into Worker secrets or build a public proxy. Confirm provider OAuth registration, deployment permissions, data-use terms and any charges before implementing scheduled Worker access. A manual private snapshot is the working bridge today; it does not provide a live dashboard quote feed.

For machine learning, retain original collection times and a broad, explicitly labeled control sample. Split by whole chronological sessions only after enough distinct sessions, reliable quotes and matched outcomes exist. Do not feed post-entry snapshots into entry features. This export intentionally reports `ml_ready: false`.
