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
| Private quotes | Staging predates production setup reuse, manual request recovery, capture evidence and spread explanations | Retain current production behavior; explicitly add optional displayed depth/mark retention to the draft collector |
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
execution, Worker and workflow files are unchanged in this preparation candidate.
The draft quote collector additionally changes `candidate-quotes.js`,
`quote-evidence.js` and `quote-session.js` to retain optional provider sizes and
mark with their original clocks. These changes require a separate collector
release and signed-in smoke check. No module is wired into production ordering yet.

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
| R2 — Candidate regression checks | Local checks pass; current CI is recorded on the preparation PR | Passing Python/JavaScript and build checks on the exact candidate commit; rerun relevant mobile/Worker checks when integration changes those surfaces |
| R3 — Review policy frozen | Collection protocol versioned; scoring calibration remains open | `fixed-collection-v1` fixes reviewed ordinal anchors and input/clock/budget requirements. Raw-feature mappings and calibrated numeric rating/acceptance thresholds remain required before activation |
| R4 — Complete prospective corpus | Worksheet and combined intake ready; actual records open | Exact contracts, frozen packet, actual reviewer identity/completion, original availability clocks, every component dimension and explicit liquidity/risk evidence; report exclusions and reviewer disagreement |
| R5 — Quote/outcome association | Binding and declared capture targets implemented; actual outcomes open | Original private quote exports associated with the same contract and decision cutoff, 5/10/15-minute windows and costs; missing/failed windows remain visible |
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

For the new collection protocol, follow [prospective collection](fixed-review-collection.md).
`fixed_review_intake.py` freezes an independently audited source/batch, prepares
a blank bound worksheet and browser import, then combines review completeness,
source/clock/gate checks and the fixed scorer in a single intake report. Keep
private reports outside the public checkout. Null template values remain pending
work and fail admission. The older component/corpus CLIs remain research tools;
they are not substitutes for this collection protocol's admission checks.

The review template is a corpus worksheet (`records`), not a scoring snapshot
(`candidates`). Combined intake selects the explicitly declared reviewer,
preserves source records, and emits a derived scoring snapshot plus outcome
input. The declared decision follows actual review and browser quote-request
completion; the earlier transport-test clock is preserved separately. No
reviewers are averaged and no missing dimensions or outcomes are backfilled.

Rollback for this preparation PR is removal of its additive offline modules,
synthetic tests and documentation, plus reverting the three collector modules
to their prior versions if those are released. Existing optional evidence fields
are ignored by the prior collector's allowlist; original exports should be kept.
The scoring modules have no production imports or activation switch. R9
separately requires a tested rollback for the future live adapter.
