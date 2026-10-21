# Private quote latency pilot

The current phase measures the bounded connection-reuse release under manual foreground refreshes. Exact contract mappings are reused by Refresh; Match performs metadata lookup. A request either initializes MCP, acknowledges initialization and discovers the required read-only tool, or reuses a compatible negotiated session. Session reuse is bounded to five minutes, partitioned by authorization and required tools, and evicted on failure; it is not a quote-price cache. Exported `setup_reused` distinguishes initialized (`false`), reused (`true`) and unknown (absent) observations. Do not infer this label for legacy exports. No live before/after speedup has yet been established by the pre-test preparation.

Use the [market-open checklist](market-open-test-checklist.md) for collection and [rollback guide](quote-test-rollback.md) for targeted recovery. The collection protocol below describes the evidence needed for acceptance; shipping the experiment does not establish its performance benefit.

## Measurements

Successful private quote responses add optional `request_timing`, in rounded milliseconds:

| Field | Interval |
| --- | --- |
| `setup_ms` | MCP initialization, initialized acknowledgement and tool discovery |
| `quote_ms` | Quote tool call including response parsing |
| `worker_ms` | Worker handler start through quote normalization, including access verification and connection lookup |
| `browser_ms` | Browser request start through response body parsing |

Timers use monotonic `performance.now()`. Export and tab recovery allow only finite numeric durations from zero to ten minutes. Older observations without timings remain valid. No tokens, MCP session identifiers or arbitrary provider fields enter timings. Timings are attached to returned contract observations; one batch must be counted once using its `received_at`, rather than treating each contract as a separate request. A request with no observations contributes no exported timing sample. Failed requests have no successful-request timing sample; record their count separately. Measurements are local diagnostics, not authenticated benchmark evidence.

These intervals overlap; do not add them. Worker timing stops before final response serialization. Browser and Worker timers are independent and rounded; do not interpret their difference as precise network latency. No measurement proves exchange-to-screen latency. `latency_verified` remains false. Provider `updated_at`, receipt time, quote age, spread and identity checks keep their existing meaning. No price cache or automatic polling is introduced.

## Pilot acceptance

1. Required CI, mobile QA and credential-free Worker dry run pass. Preview keeps private routes disabled and has no production brokerage storage.
2. After release, one signed-in manual refresh exports all four timing fields and survives reload with identical provider and receipt clocks. An old export remains evaluable without timings.
3. Collect at least 20 successful foreground requests across at least two open market sessions, using matched contract batches. Record batch size, missing contracts, valid-book rate, provider quote age and failed-request counts alongside request duration. Avoid repeated metadata matching during the refresh measurement.
4. Report p50/p95 separately for setup, quote retrieval, Worker and browser duration, with sample counts and session/batch composition. Set a measured baseline before proposing a speed target.
5. Evaluate the bounded connection-reuse experiment using equal batch sizes under comparable session conditions. Require lower request duration without worse quote age, book validity, identity validation or failure rate. Keep initialized/reused/unknown groups separate. Reconnect, expiry, provider session loss, concurrent refresh and authorization isolation remain required safety checks.

Production scoring remains unchanged. Fixed 40/38/10/7/5 versus adaptive comparison requires completed, provenance-backed component reviews available at the declared decision cutoff and matching prospective outcomes. Later review cannot be backdated into an earlier scan.

## Local baseline report

Run `python quote_latency.py session-one.json session-two.json > private-latency-report.json` on one or more private exports. The report counts each receipt batch once, deduplicates overlapping exports, calculates nearest-rank p50/p95, excludes invalid clocks at each source's original cutoff, and withholds incomplete or conflicting timing batches. Inputs are bounded to 100 exports and 2000 combined unique observations. Old exports yield no invented duration samples. The request/date collection threshold is only a diagnostic count: verify open-market sessions, foreground collection, failures and missing contracts separately. Quotes captured before the timing update cannot establish a transport baseline. Keep both inputs and report private.

## Outcome collection and recovery

Current browser exports declare `validation_policy.horizons_minutes: [5,10,15]`. The staging outcome CLI honors this policy; archives without a policy retain the legacy 5/15/30 default. For an older cohort explicitly agreed as 5/10/15, call the evaluator with that policy and disclose the override without rewriting the source export. Each target has a 60-second observation window and uses the first eligible provider timestamp. Missing windows stay missing.

Tab recovery retains at most 20 contracts and 2000 observations for 24 hours. Reload restores original clocks; it does not refresh prices. Replacing or clearing a batch requires confirmation when evidence exists. Export before closing the tab for durable retention. Keep private observations and diagnostic reports outside the public repository.
