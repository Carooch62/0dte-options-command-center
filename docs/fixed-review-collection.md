# Fixed-score prospective collection protocol

`fixed_review_policy.json` freezes collection protocol `fixed-collection-v1`.
Its canonical SHA-256 is recorded in every prepared corpus and review. A changed
file has a changed fingerprint and cannot silently reinterpret an older corpus.
Any policy revision needs a new version and a separately declared collection.
The worksheet also fingerprints the four scoring/admission modules. A different
implementation cannot silently rescore the same frozen review; retain the
original candidate commit for reproduction.
The scoring rubric remains provisional; freezing collection is not evidence of
predictive quality or a completed release gate.

## Inputs fixed for this collection version

| Input | Collection rule |
| --- | --- |
| Weights and ratings | News 40%, patterns 38%, volume 10%, options 7%, risk/reward 5%; the existing 16 reviewed dimensions use integer 0–4 anchors in `component-scoring.md` |
| Missing inputs | Withhold the whole score. Do not infer a neutral rating, redistribute weight or convert a raw scanner score into the five components |
| Decision | An explicitly declared regular-session cutoff after worksheet preparation, actual review completion and a completed successful quote request; all evidence availability must precede the cutoff |
| Quotes | Latest response available at the cutoff, standard multiplier 100, passing checks, positive uncrossed book, provider age at most 60 seconds, ask at most $0.30, spread at most $0.10 and 30% of midpoint |
| Stock bars | Original completed bar end from the frozen packet, at or before the decision and at most eight minutes old |
| News | Successful coverage checked less than 15 minutes earlier, current assessed events and explicit event links; event age and review chronology retain their separate existing checks |
| Depth | Original displayed bid/ask sizes in contracts, contemporaneous with the intended quantity; both sides must cover that quantity. Displayed size is not a promised fill |
| Pricing | A contemporaneous benchmark value with an explicit method and source. No benchmark is manufactured from a missing value; no automatic undervaluation claim is made |
| Risk | Explicit intended contracts, maximum premium and maximum-loss budgets, estimated round-trip costs and basis, target, invalidation, exit plan and future broker deadline; the standard long-option premium plus declared costs must fit the loss budget |
| Provenance | Exact candidate, packet, policy fingerprint, source clocks and selected reviewer; supporting depth, benchmark and risk evidence must exist by actual review completion |
| Outcomes | Entry ask and later bids at 5/10/15 minutes from the declared decision; inclusive 60-second provider-timestamp windows, with fees/slippage assumptions separate from quoted changes |

The ordinal anchors are frozen for this reviewed research workflow. Automatic
raw-feature mappings, numeric calibration beyond these anchors, outcome
acceptance criteria, and the live scanner adapter still require separate work.
The budgets in the risk plan are explicit per-record inputs; this tool does not
set a trading budget or place orders. Zero costs require an explicit sourced
basis, rather than treating unknown fees as zero.

## Build a collection packet

Use the full scanner snapshot and its candidate batch from the same published
commit. The freezer runs the independent source-to-batch audit before creating
a content-hashed allowlisted packet. It preserves original generation, bar and
quote clocks; capture time never replaces them.

```sh
python fixed_review_intake.py freeze original-snapshot.json original-batch.json > /private/packet.json
python fixed_review_intake.py scanner /private/packet.json > /private/scanner-import.json
python fixed_review_intake.py prepare /private/packet.json > /private/reviews.json
```

Paths above are examples; use an actual private output directory outside the
public checkout. Commands print JSON and make no quote requests. An old packet
can be prepared for inspection, but stale bars, expired contracts or missing
quotes will withhold admission at a new decision.

The worksheet prefills original identities and known source clocks. Reviewer,
completion, ratings, source explanations, depth, benchmark and risk-plan values
remain empty. The template is not a completed review or a training example.

## Manual collection sequence

1. Start with a fresh regular-session packet and prepare its worksheet. Import
   `scanner-import.json` through the private quote page's existing **Scanner
   snapshot** file control under **Snapshot imports and staging fallback**.
   Keep the frozen cohort. The import carries the packet/scan identity and
   original clocks into tab recovery and quote exports.
2. Match exact contracts once and fetch quotes. Complete the evidence reviews
   using sources actually available at their recorded times. Record original
   displayed size and pricing benchmark separately: the current quote export
   does not contain either, so it cannot fill those fields by itself. Keep the
   underlying source material with its actual observation/availability times.
3. Fill the actual reviewer identity, completion time, candidate direction,
   dated session (`YYYY-MM-DD` Eastern) and explicit risk plan. A call worksheet
   declares UP support and a put worksheet DOWN support; the packet retains the
   original stock direction independently. Opposing evidence must be reflected
   in the ratings and gates. Do not sign off a missing dimension.
4. After completing the reviews, request a fresh manual quote. Choose its
   browser request completion (`finished_at` in retained quote-request diagnostics)
   as the declared cutoff, provided the original reviewed
   evidence is still current. Record that cutoff in the corpus and each
   selected record. Reviews completed later cannot qualify at this cutoff.
   If preparation takes too long for the original bars/news/depth to remain
   current, start a new prospective packet and keep the old attempt withheld.
5. Select one reviewer explicitly in `selected_reviewer_id`; independent
   reviews may remain in `records` for consistency checks. The tool never
   averages reviewers or silently picks the most favorable review.
6. Export the quotes and run the combined intake below. Resolve missing
   evidence honestly or preserve its withholding reason.

```sh
python fixed_review_intake.py admit /private/packet.json /private/reviews.json /private/quotes.json > /private/intake.json
```

The command binds the packet, policy, reviewer, cutoff and original quote
export; validates review completeness and collection requirements; then invokes
the existing fixed scorer only for admitted reviews. It emits the audit,
withholding reasons, fixed contributions and a derived outcome input, with
canonical input hashes. An invalid newest quote never falls back to an older
passing response. Failed or unfinished latest requests block a decision; a
missing contract or empty response cannot reuse its earlier book. The original
quote receipt must be consistent with the latest completed request interval;
inconsistent browser/server clocks are withheld rather than interpreted as
precise network timing. Future responses are excluded from the scoring cutoff even
when included later in an outcome export. Missing candidates stay missing.

## Capture the actual scoring decision

Proceed with scoring-outcome capture only when `admitted_count` is positive.
An entirely withheld attempt has no capture targets or derived decision entries;
keep its reasons instead of spending a full session on incomplete examples.

Follow `capture_targets` in the intake report for the declared scoring decision.
The existing page's capture card follows the first passing quote in that tab;
that earlier transport-test clock can differ from the later reviewed decision.
Do not reset or backdate the original app clock to force agreement.

Refresh manually around the declared decision's 5/10/15-minute targets and
check the provider timestamps. Export again and rerun intake with the unchanged
reviews and cutoff. The derived `outcome_input` uses that declared decision and
the original observations; it does not rewrite the source export or invent
missing windows. Outcome evaluation and the future UI adapter remain separate
release work. No automated private quote polling is introduced.

Content hashes and labels validate supplied-input consistency, not the factual
truth of a source, the independence of reviewers, executable depth or fills.
Keep the original evidence for review. A passing intake remains an offline
research record; profitability, calibration, holdout evaluation and production
activation are still unproven.
