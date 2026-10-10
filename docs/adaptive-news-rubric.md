# Adaptive news importance — shadow version 2

Status: experimental, uncalibrated. No ranking, contract selection, qualification, alert, or production behavior uses this output. Existing 40/38/10/7/5 is a reference allocation, not an already implemented composite scoring model.

## Evidence and company context

Score the event **for this company**, not the dramatic wording of a headline. A contract should be assessed against revenue/backlog and timing; a clinical result against the company's dependence on that asset; a financing against dilution and funding needs. Document the denominator, figures, source, and uncertainty in the review. Do not invent ratios when information is missing.

| Dimension | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| Materiality | No relevant economic change | Small relative to company scale | Meaningful segment or financial effect | Major company-wide effect | Changes viability or core business thesis |
| Surprise | Matches documented expectations | Small deviation | Meaningful deviation | Large deviation | Exceptional departure from expectations |
| Credibility | Unsupported | Single unverified claim | Attributed but insufficiently verified | Credible reporting with identifiable supporting evidence | Primary filing, release, regulator decision or direct source |
| Novelty | Recycled information | Minor addition | Substantial new detail | New event with some prior disclosure | First substantive disclosure |

Each rating requires a written rationale and a public source URL. Surprise requires a documented *pre-event* expectation or consensus; no benchmark means unknown, not zero. Source names alone do not establish credibility. Automated extraction is not implemented; headlines never automatically become reviewed evidence.

Relevance is DIRECT, SECTOR, MACRO or UNRELATED, with an explanation of the company's actual exposure. Sector/macro headlines need a transmission mechanism, not just a sector tag. Direction is BULLISH, BEARISH, MIXED or UNKNOWN, independent of importance. A cut in guidance can be a major bearish catalyst; importance must not automatically favor calls. Directional rationale is required unless direction is UNKNOWN.

## Timing and duplicate handling

`event_at` is when the information was first public, not a future completion date. Require timezone-aware `event_at <= published_at <= reviewed_at <= evaluation time`. Record separate IDs for materially new developments. A rewritten article does not reset the event clock.

An INTRADAY assessment uses a proposed 6-hour half-life and 24-hour maximum age. MULTIDAY uses 48 hours and 120 hours. These are test hypotheses, not established market facts. Longer-lasting events must be assessed for the appropriate horizon; intraday results do not apply automatically to other expiration windows.

Group syndication under one `event_id`. Identical source URLs or normalized titles also catch simple duplicate submissions. Semantic deduplication across different titles/URLs still requires reviewer event IDs. Conflicting ratings for the same event withhold the aggregate proposal. Multiple independent events use the maximum importance, never the article count or sum. Opposing directions yield MIXED, with no directional support. This conservative policy can miss cumulative effects; test it before expanding.

## Calculation and proposed bounds

For ratings divided by four:

`strength = .45*materiality + .25*surprise + .15*credibility + .15*novelty`

Cap strength at the normalized materiality rating. Credibility and novelty cannot turn a small economic event into a major one.

`importance = strength * 2^(-event_age_hours / half_life)`

Only documented, current events with materiality above zero, novelty above zero, and credibility at least 3 qualify for a proposal. This importance scale is a rubric score, not return, probability, or model confidence.

`news = round(40 + 2.5*importance, 2)`; `patterns = 78 - news`.

Volume stays 10%, options quality 7%, risk/reward 5%; total is 100%. Thus news remains the highest-weighted category and patterns second. Low materiality still lowers importance even when the news category has a high coefficient. These bounds preserve the category priority as an initial experiment; they are not claimed to be optimal. Any later contribution score must use event strength as well as coefficient and must avoid double-counting.

A source failure, unscanned news, incomplete review, low credibility, future timestamp, conflicting assessment, stale event, recycled story or routine/background event cannot create a positive weight proposal. SUCCESS with zero headlines means NO_REPORTED_NEWS, not confirmed absence of catalysts. Unknown values remain null; no weight is redistributed and existing catalyst/quote/risk gates remain independent.

## Review input

`news_event_reviews.json` maps ticker symbols to lists of event assessments. It is empty intentionally: no real company has been assigned invented ratings. This is public version-controlled research: include public-source facts only, never account data or secrets.

Required event fields: event_id, ticker, title, source_url, event_at, published_at, reviewed_at, horizon, relevance, direction, scores, evidence. `scores` has integer materiality/surprise/credibility/novelty in 0–4. `evidence` explains those four ratings plus relevance, horizon, and direction (unless UNKNOWN). A complete synthetic example is in the unit-test helper `event()`; synthetic evidence never enters live scan input. Reviews must be independently checked against their sources; the validator checks structure and timing, not truth.

Normalization attaches `news_research` and history retains the same dated assessment. The signal-checklist details show the proposal or why it is withheld. Review edits trigger staging scans. No extra API cost or model calls are introduced.

## Validation and promotion

Tests cover same event/different company scale, good vs bad direction, missing consensus, low-confidence rumors, duplicates, conflicting assessments, independent opposing events, stale/recycled/future news, source failure, no returned news, allocation bounds, and unchanged existing score/qualification/readiness.

Same-input comparison currently means reference versus adaptive **weight allocation**. Do not claim ranking improvement: normalized category scores, point-in-time labeled evidence, a replay dataset and out-of-sample evaluation are still required. Record price/quote coverage and data failures alongside every result. Test zero unsafe eligibility changes first, then rank changes and outcomes using identical snapshots and realistic costs. Avoid using later outcomes or revised estimates as pre-event knowledge.

Hosted Robinhood authorization remains awaiting the already-escalated back-office response. It is not a dependency for this shadow work. Promote reviewed code separately; never merge staging scan data/history over production history.

Version 2 selects GRADUAL_2_5 for shadow evaluation following the October 10 allocation comparison. News ranges from 40 to 42.5%, preserving patterns at 35.5% or higher. Historical version 1 snapshots retain their original allocation; do not relabel them. Offline historical reports remain dated evidence, not current policy outputs.
