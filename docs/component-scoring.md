# Five-component shadow scoring, v1

This is a provisional human-reviewed rubric, not a validated predictive model. It is isolated from the live scanner. Fixed weights remain news 40%, patterns 38%, volume 10%, options 7%, risk/reward 5%. Adaptive replay changes weights on identical complete inputs, never the evidence or gates.

## Rating scale

Each dimension requires an integer 0–4 and a concrete evidence explanation: 0 adverse/absent after adequate observation, 1 weak, 2 mixed/moderate, 3 strong, 4 exceptionally strong. Missing observation is missing, never 0 or 2. Reviewers must specify candidate direction, horizon and exact contract in candidate_id. Score = sum(rating / 4 × dimension weight) × 100. Scores are favorable support, not probability of profit.

| Component | Dimensions and within-component weights | Evidence and interpretation |
|---|---|---|
| News | directional support 40%; materiality 30%; surprise 20%; novelty 10% | Issuer/primary release and contemporaneous review. Directional support: 0 opposes candidate, 2 mixed, 4 clearly supports it. Materiality: 0 immaterial to economics, 2 meaningful but bounded, 4 major earnings/cash-flow impact. Surprise: 0 fully expected, 2 partial deviation, 4 large documented deviation from prior expectations. Novelty: 0 recycled, 2 incremental update, 4 first material disclosure. Unknown direction remains missing. Credibility and publication timing must also pass the existing news assessment. No news requires documented coverage; missing headlines do not prove no catalyst. |
| Patterns | setup structure 40%; trend alignment 35%; trigger confirmation 25% | Timestamped completed bars across declared timeframes, key levels, and invalidation. Structure: 0 broken, 2 incomplete, 4 clean documented setup. Alignment: 0 conflicting, 2 mixed, 4 consistent across declared timeframes. Trigger: 0 invalidated, 2 pending/partial, 4 completed-bar confirmation. Early setups can score below confirmed ones; no future bars. |
| Volume | relative volume 50%; directional participation 30%; follow-through 20% | Same-time historical volume baseline with dates and completed bars. Relative volume: 0 materially below baseline, 2 around baseline, 4 unusually high versus documented distribution. Participation: 0 opposite direction, 2 mixed, 4 sustained candidate-direction participation. Follow-through: 0 reversal, 2 partial continuation, 4 sustained completed-bar continuation. Unavailable baseline remains missing. |
| Options | spread quality 50%; depth quality 30%; pricing quality 20% | Exact-contract bid/ask, quote timestamp, displayed sizes, intended size and contemporaneous pricing benchmark. Spread: 0 unacceptable under declared policy, 2 adequate, 4 tight. Depth: 0 inadequate, 2 enough displayed depth, 4 ample; volume/open interest alone cannot prove executable depth. Pricing: 0 materially unfavorable versus documented benchmark, 2 fair, 4 favorable. Without a benchmark, pricing is missing. |
| Risk/reward | payoff quality 50%; invalidation quality 30%; execution feasibility 20% | Explicit entry, exit, loss budget, underlying target/invalidation, remaining time and scenario assumptions. Payoff: 0 poor net reward/loss, 2 adequate under declared policy, 4 favorable. Invalidation: 0 undefined, 2 measurable but noisy, 4 clear nearby level. Feasibility: 0 implausible before deadline, 2 plausible, 4 well-supported. Include spread/slippage/fees; no hindsight targets. |

Numeric rating thresholds beyond these ordinal anchors must be recorded in a policy version before corpus review. This v1 is not an automatic raw-feature mapping. Inter-reviewer consistency, historical baselines, calibration and outcome validation remain outstanding. News severity used for allocation is separate from candidate-direction news support; overlap between components should be audited before interpreting gains.

## Evidence contract and gates

Input `component_reviews[component]` contains matching `candidate_id` and `dimensions[dimension]`. Every dimension contains `rating`, `observed_at`, `available_at`, `source`, `evidence`. Times must be timezone-aware and observed_at <= available_at <= as_of. Store original observation timestamps even when the review is later made; available_at must include review availability. Do not backdate retrospective reviews. Source labels are audit metadata, not proof of factual validity.

`eligibility_evidence.liquidity` and `.risk` each require strict `passed: true`, `policy_version`, `observed_at`, `available_at`, `source`, `evidence`. The policy must specify freshness limits, spread/depth and sizing requirements, premium/loss limits and contract deadline. Gate reviewers must assess data age at as_of; chronology alone does not establish freshness. Failure or missing evidence cannot be offset by high scores. Production gate thresholds are unchanged.

Run `python component_scoring.py INPUT.json` to record scores, or give the same reviewed input to `python shadow_replay.py INPUT.json` to score and compare. The five original scanner components are not filled with guesses. Existing pre-scored legacy replay fixtures remain supported as a separate input path; v1 rubric records require the evidenced gates.

## Validation boundary

Synthetic tests verify arithmetic and refusal behavior only. Historical snapshots without complete contemporaneous reviews remain excluded. Report exclusions, chronological session partitions, fixed/adaptive rank differences and ties. No profitability or improvement claim follows from a rank reversal. Current hosted quote checks and an open-session version-2 news assessment remain separate pending checks.
