# Real-source news review — October 10, 2026

Research only. These cases validate abstention, not profitable predictions or calibrated weights. They are test fixtures, not live news reviews. No account data is included.

| Case | Source evidence | Review conclusion | Current evaluator result |
|---|---|---|---|
| DDS transfer announcement | Issuer announcement September 18, 2026; planned trading commencement October 5 | Use disclosure date, not future effective date. This announcement is outside both experimental horizons by October 10. | NEEDS_REVIEW; no proposal |
| DDS ceremony | Exchange release October 9 celebrates transfer; says trading began October 5 | Ceremony does not make the original transfer newly disclosed. Separate any genuinely new economic development before assigning another event. | NEEDS_REVIEW; no proposal |
| AMD/OpenAI agreement | Issuer filing October 6, 2025; initial deployment planned for second half of 2026 | Deployment year must not be mistaken for announcement year. Original disclosure is outside both experimental horizons. | NEEDS_REVIEW; no proposal |

Sources are linked in `tests/fixtures/news-source-cases.json`. Exact timezone-qualified publication timestamps and pre-event expectation benchmarks were not established. Materiality remains unscored. Date-only evidence is retained separately; no midnight timestamps or surprise scores are invented. The evaluator checks completeness before staleness, so its actual result is NEEDS_REVIEW, not STALE. Review conclusions about old disclosures are separate from that machine result.

The comparison is reference allocation 40/38/10/7/5 versus **no adaptive proposal** in all three cases. Withheld does not mean zero news importance, proof of no other catalyst, or a recommendation to trade. These cases do not establish current market-feed coverage: SUCCESS in each test is a controlled input used to isolate review validation.

Remaining work: collect a fresh material event with a documented pre-event benchmark, exact timestamps and company-scale economics. Review it at the actual review time; do not backdate the review for a historical performance claim. A positive real-event calibration remains outstanding. Existing synthetic scenarios exercise positive weights, direction, decay and bounds; they are not empirical validation.

The proposed 40–55% news range can reduce patterns to 23%, below the earlier preference to keep patterns above 35%. Keep this experimental range out of production pending an explicit allocation decision and outcome testing. A narrower range can preserve that floor, but should not be silently substituted or described as empirically optimal.
