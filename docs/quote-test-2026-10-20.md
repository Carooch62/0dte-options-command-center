# October 20 private quote test

Purpose: collect a second open-market session of prospective quote observations and request timings. This is a data-collection test; quote checks alone do not establish an entry or a fill.

## Before starting

- Confirm the UI release has passed verification, phone-width QA and the credential-free Worker dry run, and both Worker and Pages deployments succeeded.
- Open [Connections](https://0dte-options-command-center.h69htk56cq.workers.dev/brokerage.html) in Safari. Verify Robinhood authorization is active. The last screenshot showed expiry at 2026-10-22 18:47:28 UTC (2:47:28 PM Eastern); check current status rather than assuming it remains valid. A disabled Connect button is expected while connected.
- Plaid account sync is separate. Its successful 153-record sync does not verify live quote freshness.
- Keep the quote tab in the foreground. Do not erase connections or clear prior evidence to troubleshoot a disabled button. Export existing observations before replacing a batch.

## Session procedure

1. During the regular session, preferably after the opening minutes, open [Quotes](https://0dte-options-command-center.h69htk56cq.workers.dev/candidate-quotes). Confirm sign-in and load the current $0.30 scanner batch. For the separately agreed staging-validation cohort, use **Load staging validation batch** instead and verify a fresh OPEN-session staging packet. Do not combine or replace cohorts mid-test.
2. Review the snapshot timestamp and batch size. An empty batch is a valid result; do not bypass the screens. Retry later if necessary, preserving any existing evidence first.
3. Select **Match contracts and fetch live quotes** once. Exact metadata matching triggers the initial quote request. Save an initial export and record failures or unresolved contracts. If no quote passes, the validation clock has not started; retain and report the failure evidence.
4. Keep the same batch. Use **Refresh matched option quotes** for subsequent captures. Follow each contract's validation clock at 5, 10 and 15 minutes after its first passing receipt. Provider timestamps must fall within the target-to-target-plus-60-second window. A tap in the window cannot guarantee an eligible provider timestamp. Missing captures remain missing.
5. Export after each capture or at least after the final capture. Reload recovery preserves original clocks and does not fetch fresh prices. Do not rematch or load another batch to make Refresh available; read its helper message and capture the error if unavailable.
6. Record session start/end in Eastern time, foreground status, batch size, attempted and failed requests, missing contracts, and any sign-in interruptions. Exported successful timing samples do not include every failed or empty request.

## Evidence to review

- Original provider quote timestamps, receipt clocks, exact contract identity, bid/ask, quote-check failure reasons and metadata multiplier.
- Browser, Worker, setup and quote-request durations as separate overlapping intervals. Do not add them or treat browser speed as exchange latency.
- 5/10/15-minute capture coverage and reasons for missing windows. A spread or freshness failure stays a failure even if the ask is below $0.30.
- Keep private JSON exports out of this public repository. Share them privately for evaluation; screenshots are useful for failures but do not replace machine-readable observations.

The latency pilot requires at least 20 successful foreground requests across at least two verified open-market sessions. This is a collection threshold, not a recommendation to make unnecessary requests or proof that the connection is ready. Report sample counts and p50/p95 by timing stage, with failures and session/batch composition. Existing exports without timings do not provide a transport baseline. Production ranking changes remain gated by prospective validation.

## Recovery

If sign-in expires, open Connections, sign in and return to the existing quote tab. If a request fails, export the retained evidence, note the error and retry manually. A stale book requires a new quote; reloading does not reset its timestamp. Never substitute a current quote for a missed historical capture.
