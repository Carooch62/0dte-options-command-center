# Accuracy and delivery work — November 23, 2026

## Evidence and completed checks

The staging run list was inspected November 23. Latest listed run 44816638711
started November 20 at 16:01 ET and correctly skipped the pipeline/capture after
the close. No November 23 attempt was listed. Saved staging scan health remains
November 19 19:05:39Z. Thus absent intraday attempts, not a successful cron entry,
are the observed collection gap. This does not establish why GitHub omitted runs.

IWM reporting now counts input, accepted and excluded packets by reason and
reports missing early/late coverage and exact horizons for each session. It does
not relax iwm-control-v1 or revise first observations. Earlier packets are never
relabelled as prospective observations.

The review adds a separate Cloudflare dispatch path for the existing public-only
staging workflow at :10/:25/:40/:55. It uses a distinct coordinator object, guards
active staging jobs, and reserves uncertain dispatches for five minutes. Fresh
OPEN source calendar metadata is required; the Python XNYS gate remains final.
Production scans, brokerage polling and trading alert eligibility are unaffected.
The existing GitHub schedule remains a backup. A race with that independent
scheduler can queue an extra isolated run; concurrency prevents overlapping
staging writes, and first-observation rules prevent rewriting earlier evidence.

Required before activation: install the reviewed source in supported staging
without copying production data, pass staging regressions, then merge/release
this Worker change. Actual next-session run and fresh packets remain mandatory
acceptance. A code test or off-hours skip does not satisfy collection acceptance.
Rollback: set STAGING_COLLECTION_ENABLED=false; keep collected records intact.

Provider timing reports summarize per-chain calls, retry-inclusive duration,
p50/p95, statuses and missing timing counts. Unsupported automated dashboard
access is excluded from timing samples. These per-call durations overlap; their
sum is not pipeline wall time. Dashboard verified-delta coverage remains separate
from quote freshness and actual entry qualification. No concurrency, retry,
request budget, scoring or eligibility change is justified by one snapshot.

## Owner quote evidence

A privately supplied November 23 export contains first-session 5/10/15-minute
observations. It does not establish two-session timing, token renewal, executions,
fees or Discord delivery. Raw records and contract details remain private.

## Cloudflare $5 plan assessment

User reports Workers Paid at $5/month. Published entitlements were verified
November 23; billing activation and actual account allowances are not yet read.
Workers Paid has 10 million monthly dynamic requests and 30 million CPU-ms;
usage above included amounts can incur charges. Builds includes 6,000 minutes,
six concurrent builds and four vCPUs versus 3,000, one and two on Free.

Useful now: restore public research dispatch using the existing cron/coordinator,
use filtered operational logs to investigate dispatch and provider failures, and
preserve asset-first delivery for public browser files. Cron and static assets
already exist; the paid plan chiefly expands capacity. It does not speed up
GitHub runners, remove provider delays, grant exchange data, or prove an edge.
Do not enable blanket caching of private routes or quotes. Private handlers keep
no-store responses; public static assets can use their normal delivery cache.

Pages compact packaging remains a candidate. Existing direct historical Pages
URLs must be preserved or explicitly migrated before source activation; existing
in-app archive readers already use repository raw URLs. Compare checkout,
packaging, upload and publish on equivalent runners before claiming a speedup.
No new storage service, paid data subscription, AI model or billing product is
activated by this review.

Sources:
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/
- https://developers.cloudflare.com/workers/static-assets/
