# Closing evidence capture and recovery

A successful Actions job used to mean only that the program exited: a queued November 19 job ran at 23:38 UTC and returned OUTSIDE_CLOSING_CAPTURE_WINDOW. No evidence file was published.

The collector now accepts a bounded late recovery (18 hours after the last actual exchange close) and optional manual session selection within seven days. Calendar checks cover holidays, DST and early closes. A historical evaluation cutoff chooses the target session; collected_at remains the actual request start. LATE_RECOVERY is explicit. These observations can include revisions and cannot establish what was available before a trade.

The workflow retries overnight/next morning, hydrates recent archived source cohorts, and reports the actual result in its Actions summary. INCOMPLETE and NO_SAME_SESSION_SOURCE fail the collection step; publication still retains partial evidence. Normal out-of-window schedule skips remain skips. A completed prior capture is never overwritten.

November 19 recovery: 201/201 final stock bars captured. Refer to data/closing-evidence/2026-11-19.json for source scan, clocks, rows and limitations. This is public stock research only; it is not a recovery of option quotes, executions or exchange latency.

The retrospective source manifest is data/review-evidence/2026-11-19-assembly.json: 277 IWM/RIOT records from November 17–19, each referring to its retained original scan archive and decompressed SHA-256. No entry-time alignment is asserted. Broker fill clocks/quantity/fees must be verified privately before any trade reconciliation. Delayed option payload times must not be treated as quote times.

The separate IWM staging control specification is docs/iwm-control-v1.md. It captures future inputs without changing production scores or eligibility. Subsequent horizon matching, multi-session review and private live quote/alert validation remain separate acceptance steps; this release does not claim those results.
