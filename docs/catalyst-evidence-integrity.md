# Catalyst evidence integrity

These safeguards apply to staging news assessment and offline replay. The agreed news 40%, patterns 38%, volume 10%, options 7%, risk/reward 5% allocation is a reference for the shadow comparison, not an implemented production composite score. Production still computes a price/volume score and applies execution-state, catalyst, market-alignment and momentum ordering; this change does not replace that formula. Scanner ranking and trade eligibility are unchanged. No new news service, subscription, automatic ratings or fabricated reviews are introduced.

## Independent clocks

`news_status: SUCCESS` alone is insufficient. `news_checked_at` must be timezone-aware, at or before the assessment cutoff, and less than 15 minutes old for INTRADAY or 60 minutes old for MULTIDAY. These are provisional, versioned research coverage limits (`news-coverage-v1`), not empirically calibrated trading thresholds. Failure/missing/future clocks produce COVERAGE_UNKNOWN; expired successful checks produce COVERAGE_STALE. The assessment includes the coverage reason, original check clock, age and limit.

A fresh empty response means NO_REPORTED_NEWS within that provider's documented coverage. It does not prove no catalyst exists. A stale empty response cannot claim current absence. Event decay still uses the original event time (6-hour half-life/24-hour maximum intraday; 48/120 hours multiday). A refetch, review or republished article never renews an old event.

## Review integrity

Validate every supplied event before deduplication. An incomplete duplicate, unresolved blocker, low credibility or future review cannot disappear behind a complete copy. Conflicting economic explanations for the same event require reconciliation. Valid identical syndication still counts once; article count never increases event importance.

For reviewed offline replay, `component_reviews.news.event_ids` must be a nonempty list of distinct event IDs assessed at the same cutoff. Each news dimension's `available_at` must be at or after all linked event reviews. A reviewer cannot use a later catalyst review to support an earlier score. Scored replay outputs retain linked IDs and assessed candidate-direction support. Unknown direction is reported as unknown; event importance alone is not bullish or bearish support. Pre-scored legacy fixtures remain a separate compatibility path and are not newly validated reviewed evidence.

Review templates now preserve original news collection status, check clock and headline items, and leave `event_ids` empty for the reviewer to fill. Never fill a missing historical clock with a packet capture time or backdate a later review. The old EMAT source fixture lacks a retained collection clock; the current report withholds its allocation rather than inventing one. A synthetic test separately exercises its event arithmetic under explicitly synthetic current coverage.

## Validation and next evidence

Regression tests cover collection-clock boundaries, failed/empty/stale coverage, republication, duplicate conflicts and hidden incomplete copies, event linkage, chronology and immutable inputs. Synthetic tests establish refusal behavior and arithmetic, not predictive quality, factual correctness or independent reviewer agreement.

Gather prospective event reviews and exact-contract component reviews before replay. Report coverage and withheld cases alongside paired fixed/adaptive ranks on identical admitted inputs. Outcome analysis and chronological holdout sessions are still required before claiming ranking or return improvement. The live Robinhood latency pilot is separate.
