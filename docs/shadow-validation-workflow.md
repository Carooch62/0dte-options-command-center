# Evidence collection, review queue and outcomes

These tools run on staging and never mutate scanner rankings. A validated staging scan now captures up to 20 public research contracts priced above zero and at most $0.30, at most two per ticker, in scanner order. Contracts must pass the existing quote, delta, strike-distance, spread, volume (20+) and DTE (0–14) screens. Counts disclose coverage and omissions; this selected sample is not the entire scanner universe and is not an unbiased performance cohort.

## Capture

`shadow_evidence.py` creates a content-hashed packet under `data/shadow-evidence/<New York date>/`, stored as gzip in the repository, and publishes `shadow-evidence-latest.json`, `shadow-review-queue.json` and `shadow-outcomes.json`. The staging scan workflow calls it only after a validated SUCCESS/DEGRADED scan. A retained closed/waiting snapshot does not acquire a new capture timestamp. No archive deletion is implemented; the outcome report reads only the latest five archived dates. Monitor repository growth before expanding the sample or collection frequency.

Packets preserve allowlisted public stock inputs, completed current-session five-minute OHLCV bars, pattern outputs, trend context, volume inputs, news headlines/URLs with source coverage and available timestamps, reviewed news already present, and exact contract research fields. Private brokerage observations are excluded. Headline links are not frozen article bodies; historical bars underlying relative-volume baselines and all daily trend source bars are not retained. Missing input evidence stays explicit. Original generation time, packet capture time and source commit remain separate from quote time.

Tracked contracts are captured again from subsequent public chains even if they rise above $0.30. Unavailable chains or missing contracts produce missing observations, not reconstructed prices. Public quotes with unknown exchange clocks or unverified multipliers do not qualify for option outcome estimates.

## Review queue

Open `shadow-review.html` on the staging host. Load its latest queue, download the packet, or import a saved packet. The queue shows candidates awaiting reviews, missing evidence and imported replay withholding reasons. Imported reports are supplied evidence, not independently authenticated proof.

Create an unrated template:

```sh
python shadow_evidence.py --prepare-reviews data/shadow-evidence-latest.json > reviews.json
python review_corpus.py reviews.json > review-audit.json
```

Fill actual reviewer identity, actual completion time, source evidence, dimension ratings and gate policies. Null ratings and blank provenance intentionally fail intake. `evidence_set_id` is the packet ID. An original-cutoff replay cannot admit reviews completed later. For a prospective decision after collection, declare its actual later cutoff in the corpus top-level `as_of` and every selected record; the queue labels this later time explicitly. Recheck freshness and source availability at that decision. This is not a replay at the earlier scan time.

After intake, build a replay input with `packet_id`, `as_of` and `candidates` containing one chosen review record per unique contract. Do not combine different reviewers into an apparent single review. Keep `reviewed_at`; the replay checks its time if present. Run `python shadow_replay.py replay-input.json > replay-report.json`. Import the corpus and report into the queue to show results. Separate news evidence requirements still apply; a complete component rubric alone cannot establish replay admission. Retrospective reviews remain useful for rubric calibration without being backdated.

## Outcome policy

`python shadow_outcomes.py outcome-input.json > outcome-report.json` accepts `entries`, `observations`, optional `stock_observations` and timezone-aware `as_of`. Entry records contain exact `candidate_id`, `decision_at`, `quote`, and optional `stock`. Quotes contain matching `contract_id`, numeric `bid`/`ask`, verified integer `multiplier: 100`, source and timezone-aware `observed_at`/`received_at`. Stock records contain ticker, price, source and the same clocks.

Current browser exports explicitly declare `validation_policy.horizons_minutes: [5,10,15]`, which the CLI honors. Archives without this field retain the legacy 5/15/30 default. Both supported profiles use 60 seconds of observation tolerance. For an older cohort explicitly agreed as 5/10/15, pass `horizons_minutes=(5,10,15)` to `evaluate_outcomes` and disclose this override without rewriting the original export. The first eligible observation at or after the target is used, not the best price in hindsight. Option quotes must be positive, uncrossed, at most 60 seconds old on receipt, and within $0.10 and 30% midpoint spread limits. Conflicting same-time quotes are withheld. Entry uses ask and exit uses bid. Underlying moves are tracked separately with a maximum 300-second stock clock age. Future observations cannot enter an earlier report. Pending windows become withheld if no eligible observation arrives by the window end.

Sampled best/worst bid changes cover available observations within 30 minutes and exclude conflicting same-time quotes. They are not continuous maximum excursions. Dollar estimates use one 100-share contract, excluding fees, fill probability, slippage and size. No aggregate win-rate or adaptive-performance claim is implemented.

On the production private quote page, manually refresh to collect observations and select **Export private quote observations**. That export plugs into the outcome CLI. Its initial decision cutoff is the first passing quote receipt, not the earlier scan generation time. Tab-scoped recovery retains at most 20 contracts and 2000 observations for 24 hours. Reload restores original quote and receipt timestamps; it does not make old prices fresh. Replacing or clearing a captured batch requires confirmation. Export before closing the tab for durable retention. Export does not transmit account or holdings data to the repository. No unattended Robinhood polling is added.
