# Prospective research protocol — November 18, 2026

Status: collection prepared, no strategy accepted. Production scores, thresholds,
delta/spread gates and alert flags are unchanged. Reference 40/38/10/7/5 and
adaptive weights remain unactivated; PR96 is offline preparation, not a release.

## Frozen comparisons and evidence

1. News: staging TOP50 versus TOP40_ROTATE10, at most 50 requests per scan.
   Retain every selected ticker, actual check/retrieval clocks, failures, duration,
   universe and source commit. Compare 10–20 future distinct regular sessions as
   an initial diagnostic review, with both arms represented. This count alone is
   not strategy acceptance. Session differences confound the deterministic arm
   assignment; show event/regime composition and matched coverage controls.
2. Patterns/time windows: preserve current pattern/RVOL/daily context, first-hour
   and 13:00–14:00 ET source-bar labels, qualification and controls prospectively.
   Event-day label remains UNKNOWN without independently timestamped calendar
   evidence. Keep the existing 12-bar Early Watch rule; an earlier pattern needs
   its own preregistered definition and comparison. Do not shorten confirmation
   merely to make signals appear sooner. Bar RVOL is not cumulative session RVOL.
3. Scoring: freeze reviewed component rubric and provenance/decision cutoffs;
   compare current rules, the fixed reference and a bounded adaptive candidate
   offline. Do not infer absent component reviews or backdate later news/reviews.
4. Swing/ETF research: use separate holding-period outcomes, overnight/event
   handling and point-in-time option quotes/Greeks. Private case studies must
   remain outside this repository; individual outcomes cannot validate a model.

## Outcomes and acceptance

Public delayed observations use labeled 5/15/30 targets; private quote validation
uses 5/10/15 with original provider clocks and capture windows. Do not backfill
missing windows or compare policy labels as if their targets were identical.
Measure actual option bid/ask outcomes with spreads and known costs separately
from executed P/L. Preserve missing Greeks/depth/fees and coverage failures.

Before any model comparison reserve whole sessions chronologically, leave a gap
for overlapping horizons, and keep the final test period untouched. Candidate
controls and selection bias must be reviewed. Public readiness excludes private
exports; audit those separately without copying them into GitHub. No arbitrary
trade count certifies ML readiness. Start with a simple baseline against current
rules; do not train a production model from selected historical winners.

Acceptance criteria and cost assumptions must be written before viewing the
holdout: adequate feature/outcome coverage, no leakage, comparable book quality,
robustness across sessions, and a useful improvement versus current rules after
costs. If evidence is insufficient, the result remains withheld. Production
promotion needs explicit review, an opt-in adapter and an independent rollback.
