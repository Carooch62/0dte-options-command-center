# Fixed-weight release preparation — October 22, 2026

Decision: prepare the fixed 40/38/10/7/5 version on the current production code
base, retain adaptive allocation as an offline experiment, and hold production
ranking activation until the checklist below is satisfied.

## Audited sources

| Source | Pinned commit | Purpose |
| --- | --- | --- |
| Production base | `4050346ea94abd63e77cabbca6cf8c2b9dfc89ae` | Preserve the current scanner, private quote workflow and deployment protections |
| Algorithm staging | `47e60c8e4751e316b2ef43e03899914875053787` | Inspect the fixed baseline, rubric, review intake and research evidence |

These are audit pins, not a claim that scheduled market data stops advancing.
The local checkout is shallow, so this audit compares the two endpoint trees;
it does not infer an ancestry-based merge patch.

Excluding `data/`, the endpoints differ in 153 paths: 40 modified, 55 present
only in staging, and 58 present only in production. This includes 5 workflow,
33 documentation and 55 test paths. These counts describe branch drift, not
153 changes proposed for release. Historical market data is excluded from the
candidate port.

## Reconciliation decisions

| Area | Finding | Candidate treatment |
| --- | --- | --- |
| Private quotes | Staging predates production setup reuse, manual request recovery, capture evidence and spread explanations | Retain production files intact |
| Delivery and pipeline | Staging predates compact dashboard delivery, sparse scan checkout and combined fetch improvements | Retain production files intact |
| Deployment and Access | Production has binding-readiness checks and protected private routes | Retain production Worker, deployment workflow and configuration intact |
| Fixed composite | Staging has an offline evidence-reviewed calculation and component contributions | Port the offline calculation and its dependency closure for review |
| Component intake | Staging has original-clock, review-provenance and liquidity/risk gate checks | Port the rubric and corpus audit; retain their provisional status |
| Adaptive allocation | Paired replay is a dependency of the existing fixed CLI | Keep it offline; fixed output exposes only the reference score and weights |
| Other staging changes | Pattern tracking, lifecycle research, staging UI and scanner enrichment are separate changes | Keep outside this candidate; review separately |
| Public/private records | Public staging research and private quote exports serve different evidence purposes | Keep original identifiers and clocks; no private exports in this PR |

The copied runtime modules are `fixed_composite.py`, `component_scoring.py`,
`news_research.py`, `shadow_replay.py` and `review_corpus.py`. They import only
one another and the Python standard library. Production scanner, normalization,
execution, quote, Worker, browser and workflow files are unchanged in this
preparation candidate. No module is wired into production ordering yet.

Tests are carried over with a standalone synthetic news fixture, removing their
dependency on staging's modified scanner normalization. This checks the port
against the current production regression suite without copying an older
normalizer into production.

The fixed CLI also rejects missing/malformed `candidates` arrays. Previously,
passing a corpus file with `records` could silently produce an empty scoring
report. The candidate now reports the format mistake explicitly.

## Evidence findings

- Staging's retained `shadow-outcomes.json`, as of
  `2026-10-20T15:05:30.065693+00:00`, has 88 decision records and 264 windows.
  All 264 are `WITHHELD_ENTRY_QUOTE`; none establishes a quote-based outcome.
- The staged `news_event_reviews.json` is empty. This supplies no reviewed
  catalyst corpus for the new scoring release. Other privately held material
  would need separate admission and provenance checks.
- The latest staging-head Verify, Candidate Mobile QA and Shadow Review Mobile
  QA runs have `action_required`. The Verify run has no jobs. This is an
  unresolved historical workflow status, not a recorded test assertion failure.
  Do not treat the successful Worker preview build as a replacement for these
  checks.
- The old draft chain is PR #53 into main, #54 into #53's branch, and #55 into
  #54's branch. It is not the release candidate for this selective port. Those
  drafts and their data are preserved.

Transport evidence is reviewed separately in private. A successful quote
transport sample does not supply component ratings, pricing benchmarks,
displayed depth, risk scenarios or verified scoring outcomes.

## Fixed-weight activation checklist

All rows must be satisfied on the final activation candidate. A green
preparation PR alone does not satisfy the integration or research rows.

| Gate | Current status | Required evidence |
| --- | --- | --- |
| R1 — Production fixes preserved | Prepared | Review the diff against the pinned production base; every change must be explicitly included in the selective port |
| R2 — Candidate regression checks | Local checks pass; CI pending | Passing Python/JavaScript and build checks on the exact candidate commit; rerun relevant mobile/Worker checks when integration changes those surfaces |
| R3 — Review policy frozen | Open | Versioned component rating thresholds, source freshness, liquidity/depth, pricing benchmark, sizing/loss and deadline policies established before prospective collection |
| R4 — Complete prospective corpus | Open | Exact contracts, frozen packet, actual reviewer identity/completion, original availability clocks, every component dimension and explicit liquidity/risk evidence; report exclusions and reviewer disagreement |
| R5 — Quote/outcome association | Open | Original private quote exports associated with the same contract and decision cutoff, 5/10/15-minute windows and costs; missing/failed windows remain visible |
| R6 — Comparable evaluation | Open | Same-input current-baseline and fixed-score rankings, chronological calibration/holdout split, predeclared metrics and acceptance criteria; report coverage and uncertainty |
| R7 — Scanner integration | Open | Evidence-backed component adapter and opt-in activation switch; exact source/cutoff binding; missing components withhold the score; eligibility gates cannot be offset by weights |
| R8 — Dashboard and ordering | Open | Traceable component contributions, qualified/live-price status and clear withholding reasons; default ordering changes only under the activation switch; test ties and missing scores |
| R9 — Reversible release | Open | Tested switch-off returns the previous ordering; rollback preserves observations, journal state, connection storage, data and source clocks |
| R10 — Signed-in release smoke check | Open | One load, exact match, manual refresh and export on the final deployment; verify original clocks, prices, request diagnostics and recovery |
| R11 — Activation decision | Hold | Record the candidate commit, all gate evidence and the release decision; adaptive ranking remains unactivated |

## Work order

1. Complete this production-based preparation PR and its current checks.
2. Define the component adapter and freeze its policy before collecting
   prospective scoring examples. Use the review template for missing inputs;
   never substitute a raw scanner score for five reviewed normalized scores.
3. Collect complete reviews and matching quote observations across sessions.
   Check actual review completion and packet/cutoff identity before running the
   fixed baseline; corpus completeness alone is not full replay admission.
4. Evaluate the frozen version on later untouched sessions using declared
   criteria. Do not tune the version after seeing its holdout results and then
   call the same sessions untouched.
5. Implement and test the opt-in scanner/UI adapter and rollback, refresh the
   release checks, then perform the short signed-in smoke check.
6. Activate only after R1–R10 have documented evidence. Keep a separate decision
   for any future adaptive allocation or machine-learning change.

## Reproduce the preparation checks

```sh
python -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.mjs
node scripts/build-assets.mjs
git diff --check
```

For each real reviewed packet, run `review_corpus.py` for completeness and
`fixed_composite.py` for admission/scoring. Inspect both reports. Keep resulting
private reports outside the public checkout. Null template values are pending
work and must fail admission.

The review template is a corpus worksheet (`records`), not a scoring snapshot
(`candidates`). After auditing it, select one completed review per exact
candidate at the same declared cutoff and packet, preserving the original
record fields, and put those selected records in the scoring snapshot's
`candidates` array. Keep its `as_of` and `packet_id` bound to those records.
Do not average reviewers automatically or copy incomplete/withheld reviews.

Rollback for this preparation PR is removal of its additive offline modules,
synthetic tests and documentation. It has no production imports or activation
switch. R9 separately requires a tested rollback for the future live adapter.
