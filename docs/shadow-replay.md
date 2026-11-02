# Paired scoring replay — research foundation

Run `python shadow_replay.py INPUT.json`. Input has timezone-aware `as_of` and `candidates`. Each candidate requires unique `candidate_id`, strict boolean `eligibility_passed`, the existing news-review inputs, and `research_components` with news/patterns/volume/options/risk_reward.

Each component contains score (finite 0–100), available_at, source, and method_version. All scores must mean favorable support for the candidate's particular direction/contract; raw news severity is NOT a direction-aware news score. Do not feed bullish importance into a bearish candidate as positive support. Source and method fields are provenance labels, not automated factual verification. A reviewed scoring method and freshness policy remain required before empirical use.

The tool recomputes the news allocation at as_of and compares weighted component sums on the same admitted population. It excludes incomplete, future-dated, or unqualified candidates from BOTH arms, lists reasons, preserves score ties using competition ranks, and never mutates input. It trusts the supplied eligibility decision; it does not replace existing liquidity/risk gates or establish eligibility itself. Candidate coverage must be reported alongside rankings to avoid hiding selection bias.

The provisional human-reviewed five-component rubric is implemented in `component_scoring.py` (see `component-scoring.md`); automatic mappings from raw scanner features are NOT implemented: current scanner fields such as volume_ratio, pattern labels, and existing score cannot be silently treated as comparable 0–100 component scores. Before empirical evaluation, validate/version each mapping, record source availability and observation timing, distinguish direction from severity, and retain missing values. Use an identical frozen corpus and partition by chronological sessions before evaluating later returns with realistic execution costs. Do not infer performance from the synthetic rank-reversal test.

Market-closed scans retain the old hosted snapshot; no market-calendar override has been added. Fresh hosted version-2 assessment validation remains pending a normal open-session staging scan. Public evidence tests and offline replay can proceed separately. Trade imports remain outside training and automatic updates.


## Admission of reviewed rubric records

Rows using `component-rubric-v1` require their underlying `component_reviews`, not only saved scores and a method label. Replay recomputes those scores from the reviews. Missing, incomplete or future reviews are withheld from both comparison arms, even if a saved score previously passed. Legacy pre-scored fixtures remain a separate path; they do not establish that the reviewed rubric is validated. Source and method labels must be nonempty strings.

The October 14 full staging integration check passed 142 Python and 123 JavaScript tests before the admission fix (run 38582982559). This resolves the earlier regression-validation blocker caused by the missing local calendar package; it does not establish model performance. Updated checks must pass on the admission-fix commit.

Current hosted candidate quote loading and matching were tested separately. A passing quote check supplies quote evidence only; it does not automatically populate pricing benchmarks, pattern reviews, risk scenarios or news support ratings. The current scoring rubric remains provisional.
