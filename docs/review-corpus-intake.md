# Reviewed corpus intake (staging only)

Run `python review_corpus.py reviews.json > review-audit.json` from the repository root. This is an offline audit; it never updates scanner scores or rankings. An empty corpus produces zero complete records and no reviewer comparisons, not a success claim about validation.

The input is an object with a `records` array. Each record contains the existing `component_scoring.py` input (`candidate_id`, `component_reviews`, `eligibility_evidence`) plus:

| Field | Meaning |
| --- | --- |
| `session` | Declared collection session identifier; use one documented convention |
| `as_of` | Timezone-aware decision cutoff |
| `reviewed_at` | Actual review completion time, at or before the cutoff and after evidence availability |
| `reviewer_id` | Stable, distinct reviewer identifier |
| `evidence_set_id` | Identifier of the frozen evidence packet |

All labels must be nonempty strings without leading or trailing whitespace. All 16 rubric dimensions need integer ratings 0–4 and the existing source, evidence, observed and available timestamps. Both liquidity and risk gates require passed evidence and policy versions. Do not backdate retrospective reviews: if a review was completed after the historical decision cutoff it cannot qualify at that cutoff. Keep it separately for retrospective rubric calibration.

Collect prospective examples across documented sessions using frozen source material, actual availability times, contract identity and declared gate policies. Preserve the packet externally alongside its identifier. Have reviewers work independently before reconciling differences. The tool compares only complete records with the same session, normalized cutoff, candidate identity, packet identifier and identical serialized evidence (excluding ratings). Duplicate reviews by one reviewer for the same candidate/session/cutoff are withheld, including equivalent timezone representations. Different packets never become comparable merely by sharing a label.

The report includes session counts, per-record withholding reasons, and pairwise exact agreement, mean absolute rating gap and maximum gap on the 0–4 scale. These are descriptive rubric consistency measures; repeated pairs are not independent samples. Reviewer identity and independence are declared, not authenticated. Packet fingerprints confirm identical input strings, not source truth.

`RUBRIC_COMPLETE` means intake completeness only. Run the separate `shadow_replay.py` workflow for replay admission, including news coverage and allocation requirements. Apply documented source freshness policies separately. Calibration, representative coverage and performance require real reviewed examples and an outcome study; synthetic unit fixtures establish none of those. This change supplies no genuine historical corpus and makes no adaptive-performance claim.
