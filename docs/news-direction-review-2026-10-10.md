# Expanded directional evidence review

October 10, 2026. Offline public-source research; no live review inputs or production changes. Source URLs, disclosure dates, actual review times and benchmark limitations are retained in `tests/fixtures/news-source-cases.json`.

## Bearish component: PEP

October 8 earnings guidance lowers core constant-currency EPS growth to 1–2%. The current comparison table describes the previous outlook as the low end of 4–6%. The July 9 release independently establishes the 4–6% range, but the intermediate low-end qualifier still needs its pre-event source. Do not substitute the range midpoint for a low-end expectation.

This is a reduction in forecast growth, not a forecast of negative earnings growth. Core EPS and constant-currency core EPS are different metrics; their ranges must not be mixed. The earnings revision is bearish relative to issuer guidance, while other elements of the release are favorable. It does not establish net stock direction or consensus surprise.

## Mixed release: LEVI

October 7 and July 8 releases provide directly comparable guidance. Adjusted EPS midpoint rises from $1.49 to $1.55, approximately 4.03%. Reported revenue-growth midpoint falls from 7.25% to approximately 7%, a 0.25 percentage-point reduction; the release attributes the change to currency. Organic revenue growth moves toward the upper end of the previous range. Classify this release MIXED; do not silently convert improved profit guidance into directional support for calls.

## Admission and limits

Both disclosures are already outside the experimental 24-hour intraday horizon at this review. Exact timezone-qualified publication timestamps remain unverified. An announced approximate release time is not proof of actual publication time. Numerical materiality/surprise scores remain pending. The evaluator therefore returns NEEDS_REVIEW with no proposed weights for both cases (completeness is checked before staleness).

These are two additional evidence cards, not two fully scored current signals. Existing synthetic direction tests verify that bearish importance can oppose an upward setup and that mixed directions supply no directional support. They do not validate the factual classifications or predict returns.

Next research gate: finish point-in-time timing and benchmark provenance, then review appropriate multiday cases at actual review time. Never assign a historical review timestamp or change horizon solely to force a positive proposal. A broader sample across event types and held-out outcomes remains necessary; three guidance cases are not a representative calibration sample.

Validation: all 22 news-focused tests passed, including withholding for each of the five incomplete source cases. The separate EMAT fixture remains the one complete dated positive review.

## Follow-up provenance audit

SEC index for PEP accession 0000077476-26-000050 displays acceptance October 7 at 17:57:44 and filing date October 8. This discrepancy is unresolved; acceptance is not substituted for first-publication time. The issuer-linked LEVI Business Wire item 20261007513688 was located, but retrieved text did not establish the precise time. Both cards now retain explicit review blockers. A regression verifies that filling other fields cannot override an unresolved blocker. These follow-up code and evidence changes are local pending staging publication.
