# Private quote collector release — October 22, 2026

Base: production `880aa0f55b998f676d4aca03c3a62d73987a1071`.
This release extracts only the collector changes from draft PR #96.

The quote service already returns optional `bid_size`, `ask_size` and
`mark_price`. The browser now retains validated values through quote evidence
export and tab recovery at their original provider/receipt timestamps. Sizes
are displayed contracts; a reported zero remains zero and unknown sizes stay
absent. Provider marks remain distinct from independent pricing benchmarks.
Newer quotes do not borrow missing fields from older observations. Conflicting
latest copies are withheld instead of selecting arbitrary depth or mark.

The production source changes are limited to `candidate-quotes.js`,
`quote-evidence.js` and `quote-session.js`, with accompanying synthetic tests
and the mobile QA scenario. No scoring/review modules, private records, scanner
ranking changes, automatic private polling, credentials or order actions are
included. Check results and the final candidate SHA are recorded on the PR.

## Release verification

Local checks passed: 138 Python tests, 213 JavaScript tests, asset build and
whitespace checks. A synthetic compatibility check against the actual previous
production modules restored a new-format session without changing contract
identity, bid/ask, original clocks, first-passing decision or request diagnostics.
The prior allowlist drops the optional fields as documented below.

Run the existing Python/JavaScript regression suites, asset build, syntax and
diff checks. Candidate Mobile QA additionally checks the Worker dry run,
390/430-pixel export/reload/refresh behavior and connection states, plus existing
dashboard checks. Deploy through the existing main-branch workflow after the
candidate checks pass; preserve Access and existing connection configuration.

## Signed-in iPhone check after deployment

1. Open the private Quotes page in Safari and reload it to obtain the new assets.
2. Load the current batch. If it is empty or the market is closed, record that
   limitation; do not use old prices as fresh evidence.
3. When a current cohort is available, match exact contracts once and manually
   request quotes. Export before leaving the tab.
4. Confirm optional sizes/mark are present when actually supplied and that the
   provider and receipt clocks remain distinct. Missing values are valid unknowns.
5. Reload the same tab, export again, and verify retained observations and their
   clocks are unchanged. Refresh remains manual and available after recovery.

This smoke check verifies collector behavior, not scoring admission or measured
performance. Fresh market-session scoring reviews and outcomes remain separate.

## Rollback

Revert the collector release commit through the normal reviewed/deployed path;
do not reset market-data commits or erase browser storage. The previous collector
uses the same session format and ignores optional fields. Its allowlist may
drop those fields when it saves a recovered session, so keep original exports
before rollback. Matching identities, bid/ask, quote clocks, first-passing
decision clocks and request diagnostics must survive the compatibility check.
Do not reset or backdate a capture clock to manufacture a fresh test.
