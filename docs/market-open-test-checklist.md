# Manual production quote test

Prepared October 20, 2026 for the next regular market session. All times below are Eastern.

## Before starting

Open [Scanner](https://carooch62.github.io/0dte-options-command-center/dashboard_glass.html), reload once, and check the source scan timestamp and health. A retained snapshot with an old `OPEN` label is historical evidence, not proof the market is currently open or the data is current. If the scan is stale, collect connection diagnostics separately and postpone any claim about current scanner coverage.

Start at or after **9:40 a.m. ET**, provided the regular session is open. Open [Private candidate quote check](https://0dte-options-command-center.h69htk56cq.workers.dev/candidate-quotes). If needed, use [Connections](https://0dte-options-command-center.h69htk56cq.workers.dev/brokerage.html) and finish sign-in. A connected label does not by itself verify a successful quote request.

Choose **Load current $0.30 scanner batch** for this production connection test. Use the staging validation batch only for a separately identified frozen staging experiment. Record the scan ID, source time, selected contract count, browser/device and network. Do not substitute last night's audit count for tomorrow's actual count.

Use **Match contracts and fetch live quotes** once. This performs metadata matching and an initial quote fetch. Do not repeatedly match during the refresh measurements. Check exact matches, missing contracts and quote status. Keep this cohort and tab throughout the test. Leave the phone foregrounded and awake.

## Short setup check before another full benchmark

After a setup-cache release, first collect only three quote responses: the initial Match/fetch, then manual Refresh around +30 and +60 seconds. Keep the same batch, foreground tab and network; export immediately afterward. Inspect `setup_reused`, `setup_mode` and `setup_cache_status` before attempting another full capture session. A new Worker instance can still yield a miss; no warm hit or faster price freshness is guaranteed. This short check is connection evidence, not completed 5/10/15-minute outcome collection.

The pinned capture card shows the earliest open or upcoming per-contract window in Eastern time. Use **Refresh for capture** there or the existing refresh button; both make exactly one manual quote request. Check for CAPTURED afterward. The card does not poll quotes, restart clocks or repair missed windows. Backgrounded devices can pause its countdown.

## Refresh sequence

The initial fetch is separate from the **nine manual refreshes** below: ten successful quote request opportunities in total. Matching may involve other HTTP operations; those are not ten additional quote samples. `T` is the first passing quote receipt for each contract; the app's per-contract capture countdown is authoritative. Contracts first passing later have later targets.

| Manual refresh | Approximate time after initial passing receipt | Purpose |
| --- | --- | --- |
| 1 | +0:30 | Early reuse opportunity |
| 2 | +1:00 | Early reuse opportunity |
| 3 | +2:00 | Early reuse opportunity |
| 4 | +4:00 | Early reuse opportunity |
| 5 | +5:10 | Five-minute capture |
| 6 | +5:40 | Five-minute follow-up if provider timestamp lagged |
| 7 | +10:10 | Ten-minute capture |
| 8 | +10:40 | Ten-minute follow-up |
| 9 | +15:10 | Fifteen-minute capture |

This is a guide, not a cap: if a window remains open and uncaptured, refresh again before it closes, including around +15:40 if needed. Follow the displayed target and deadline for later-starting contracts. Provider quote timestamps must fall within the target through target+60 seconds, inclusive; tapping within a window alone does not guarantee valid evidence. A failed check or missing window stays failed or missing.

Reuse is bounded to five minutes and depends on the Worker instance and authorization lifetime. Early requests are opportunities, not guaranteed hits. Classify exported `setup_reused: true`, `false` and absent separately. A request at +5 minutes may already require initialization. There is no automatic private quote polling.

## If something fails

- A quote request failure keeps mappings and retained evidence. Retry **Refresh matched option quotes** explicitly; a failed current quote must not be read as a fresh price.
- If authentication is required, export first when possible, restore the connection and return to the same tab. Record the interruption; reinitialization after sign-in is expected.
- A failed replacement/import preserves the previous batch. Read the displayed cohort before proceeding. Do not silently mix it with the intended replacement.
- Export before reloading, replacing or clearing the cohort. Recovery lasts up to 24 hours in the same tab/browser when storage is available. Reload restores clocks; it does not fetch fresh prices.
- If a contract never passes metadata/quote checks, keep it unverified. Do not repeatedly restart the entire cohort to force a pass.

## Finish and handoff

After the final windows close, **Export private quote observations**, retain the file, and send it in this conversation. Include start time, number of manual refreshes, device/network, interruptions, and any missing/failed contract observations. Keep private exports outside the public repository.

Do not clear or close the tab before the export succeeds. The same-day refresh test does not prove investment performance. Research ask <=$0.30, live ask <=$0.30, valid fresh quotes and setup qualification are separate checks.

## Comparison and acceptance

Run these commands from the repository root; choose output paths outside the public checkout:

```bash
python scripts/audit-candidate-batch.py data/market-dashboard.json data/candidate-quote-batch.json > /path/to/private/batch-audit.json
python scripts/compare-private-quotes.py --before '/path/to/private/baseline.json' --after '/path/to/private/new-export.json' > /path/to/private/comparison.json
```

The audit uses the full snapshot at the same pinned commit as the batch. It independently checks identity selection, published screens, underlying numeric evidence, source clocks, counts, stable order and caps. It does not audit the upstream provider's raw chain against the snapshot.

The comparison keeps before/after data separate, deduplicates overlapping exports, reports initialized/reused/unknown timing groups, provider quote ages, returned batch sizes, shared contracts and retained request diagnostics. Run it without `--after` to prepare a pending baseline. It never automatically certifies improvement.

Collect at least 20 successful foreground requests across at least two verified open sessions for the pilot collection minimum. Tomorrow's ten opportunities are a first post-release session; repeat in another session if needed. The legacy baseline has eight returned contracts per request. If the current batch has a different size or contracts, its overall before/after difference is descriptive, not a controlled speedup. Compare initialized versus reused requests within the same post-release cohort as well.

Report p50/p95 and counts for setup, quote call, Worker and browser durations separately. They overlap and must not be added. Require lower request duration without worse provider age, quote quality, missing identities or failures under comparable conditions. Retained diagnostics are bounded, and missing older logs mean unknown failure rates. The collection threshold alone is not acceptance. Exchange-to-screen latency remains unverified.
