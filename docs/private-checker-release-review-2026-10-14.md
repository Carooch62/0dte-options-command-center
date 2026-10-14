# Private candidate checker release review — 2026-10-14

Decision: do not merge staging PR #55 as the limited private quote-check release.

## Verified evidence
- GitHub scan run 38502356011 latest attempt completed successfully, including combined regression tests and staging result publication.
- Current-session snapshot generated 2026-10-14T14:02:44.429237+00:00, 1,510 included contract identities.
- Actual snapshot contract SPY261014P00772000 exactly matched Robinhood UUID 3cbfb6be-3bb2-4c37-bad8-a12ced3713c0 (SPY, 772 put, 2026-10-14, active/tradable, standard multiplier).
- Connector quote updated at 2026-10-14T14:31:47.746183608Z: bid 0.73, ask 0.74. Local candidateQuotes evaluation at collection returned QUOTE_CHECK_PASSED, age 0.27 seconds, spread 1.36%. This was a connection sample, above the user's 0.30 ceiling.
- 20 local targeted tests passed for matching, timestamp/book/deadline rejection, imports, loader environment checks, failed-refresh price clearing, retained retry mappings, connection authorization handling and staging isolation.
- Earlier desktop synthetic import and fresh-to-stale checks passed; 390/430px GitHub mobile QA passed. These do not establish current real-data hosted live refresh.

## Blockers and scope
PR #55 includes scanner/ranking-related source, adaptive-news research, component scoring and extensive generated/history data. Comparison with main is diverged: staging ahead 35 and behind 280 commits at review. File-list and comparison outputs are scope evidence, not a complete conflict analysis. Preserve current production UI/navigation updates; do not replace them with old staging copies.

A limited release should start from current main and selectively port candidate-quotes.js, candidate-quotes-panel.js, candidate-quotes.html, their tests, and only necessary asset inclusion/navigation and private-quote error handling. Review each dependency against main rather than copying the old Worker or configuration wholesale. Exclude scanner Python changes, adaptive scoring, generated data/history, staging resource configuration and ranking changes.

## Hosted test required
Staging intentionally blocks private brokerage requests. Test real snapshot and metadata imports on the hosted staging checker first. A separate approved private deployment or reviewed limited release is required for end-to-end live refresh; do not disable staging isolation. Verify access protection and exact contract matching, two advancing received timestamps, 60-second aging, missing quotes and authorization failures, and no ranking mutations. The dedicated checker currently displays a sign-in instruction and clears quotes on failure; reconnection is through the brokerage page.

Rollback: retain the prior deployed commit/version and revert the limited checker/asset changes if identity, stale-price handling or authentication regression appears. Do not merge PR #55 for rollback convenience.

## Separate pending work
Open-session version-2 adaptive-news assessment verification and empirical component-scoring consistency/outcome validation remain pending. A successful scan health status does not establish those checks.
