# Supported staging collection

Supported branch: `staging-next-20261117`. `staging-algorithm` / draft PR55 is
historical and is not the current collection endpoint. Main's read-only staging
reader, workflow and frozen-validation loader all use the supported branch.

The default-branch Staging Algorithm Scan workflow attempts collection at
:10/:25/:40/:55 across the EST/EDT UTC span. GitHub scheduling can be delayed or
skipped; a cron setting is never evidence of a completed scan. The job checks the
XNYS calendar and first completed five-minute bar, checks out the supported branch,
requires its isolation marker, and uses public sources without brokerage or
Alpaca account secrets. Concurrency is separate from production. Each collection
uses the source code installed on that branch, not an implicit fallback to main.

The pipeline copies the staging marker into its temporary working directory.
Only that marker admits the versioned news-session switchback; ordinary production
retains top-50 selection. Policy arm is frozen by session date before outcomes:
top 50 versus top 40 plus 10 rotating names from the ticker-sorted remainder.
Both arms have at most 50 lookups. This is a deterministic session-level pilot,
not a randomized causal comparison. Archive assignment, selection clocks,
coverage, source failures, source commit, duration and frozen candidate controls.
The prior extra-50 later-lookup probe is historical and is not an equal-budget
baseline. No outcome or earlier catalyst availability is inferred from it.

Only a newly validated request-matched OPEN scan can produce a fresh packet.
Capture additionally rejects closed sessions, prior-day and >8-minute snapshots.
Packets are content hashed, scan-id idempotent, bounded, and public-only. Candidate
controls retain unknowns and omit counts; their selected option outcomes are not
an unbiased full-chain sample. Review and private quote outcomes stay withheld
until actually supplied through the existing private/offline workflow.

Deployment sequence: merge the release into main, then merge that reviewed code
into the supported staging branch while preserving its isolated history. Verify
that both workflow and reader target the same branch. Inspect actual subsequent
market-hours run/packet timestamps before claiming ongoing collection works.

Production promotion requires the experiment plan and reviewed evidence; no
scoring, threshold or notification activation is part of collection.
