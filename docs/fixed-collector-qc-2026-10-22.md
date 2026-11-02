# Fixed-score intake and private collector QC — October 22, 2026

Scope: draft PR #96 at `feabf163844efdd847acde9c0b3cbec098d751f8`,
followed by the corrections described below. Review performed on an isolated
checkout of the actual PR head. Production is not modified or deployed by this
QC pass. The production endpoint comparison found only the known candidate
source changes outside market-data files; scanner and deployment sources are
preserved.

## Findings and repairs

| Finding | Before | Correction and regression |
| --- | --- | --- |
| Newer displayed depth could contradict the review | A review declaring three contracts of depth could pass with a latest exported bid or ask size of zero | Any supplied latest provider size must be a valid safe integer covering intended quantity. An earlier review cannot override it. Missing optional fields still require separate reviewed depth evidence. Tested zero, insufficient, malformed and sufficient sizes |
| News coverage could arrive after review completion | A successful news check one second after the declared completed review could still pass | Require the coverage check at or before actual review completion, in addition to existing freshness, event and cutoff checks |
| Tied request starts depended on array order | Two zero-duration requests sharing start/finish times could select a success over a failure | Duplicate quote-request start times reject the decision as ambiguous, in either input order |
| A completed bar could postdate its source snapshot | A bar ending after snapshot generation could still satisfy decision freshness | Withhold that candidate with `SOURCE_BAR_AFTER_PACKET_GENERATION`; the original bar time cannot be replaced |
| The method fingerprint omitted admission dependencies | It covered four scoring modules but not the intake rules, corpus audit, request-clock validation, market calendar or source audit | Fingerprint all nine repository modules. Tests change each newly bound module's bytes and verify old worksheets are rejected. Prepare new prospective worksheets; preserve old code and records for reproduction |
| Optional marks accepted nondecimal encodings | JavaScript numeric coercion accepted hexadecimal, binary and octal strings | Accept positive finite numeric marks or decimal strings, including scientific notation; reject other encodings |
| Release notes understated the diff | They claimed all browser/quote files were unchanged and rollback was additive-only | Document the three collector module changes, separate collector release and rollback requirements |

The first four admission defects were reproduced with failing synthetic
regressions before their fixes. They concern offline research admission, not
evidence of a production trading or account action.

## Verification

- Full local regression suite: 194 Python tests passed. The six added intake
  regressions cover chronology, newer depth, intended quantity, ambiguous
  request order, source bar clocks and dependency fingerprint changes.
- JavaScript regression suite: 213 tests passed. Worker normalization retains
  provider sizes/mark and original clocks while excluding account metadata.
  Collector checks cover invalid optional fields and export/recovery round trips.
- The mobile browser scenario now asserts sizes/mark survive a real download,
  page reload, subsequent refresh and second download. A newer quote missing
  optional fields must not borrow them from older observations.
- Build, syntax, whitespace and current CI/mobile results are recorded on PR #96
  for the final correction commit. An earlier green run does not validate a
  newer commit.

## Boundaries and remaining evidence

Source review and tests preserve manual refresh, original provider/receipt
clocks, the standard multiplier, existing book/spread checks, protected routes,
read-only provider tool restrictions, bounded exports and 24-hour recovery.
No scoring module is imported by production scanner, pipeline, dashboard or
Worker entry points. No private quote exports or completed ratings are added
to the public repository.

This is engineering QC with synthetic fixtures. A signed-in iPhone/Safari
smoke check on the separately released collector is still required; Chromium
phone-width tests do not establish Safari behavior or current provider health.
Repository fingerprints do not lock installed dependencies or authenticate
source facts and reviewer identities. Displayed depth does not promise a fill,
and the provider mark is not an independent valuation benchmark.

The new method fingerprint intentionally invalidates older prepared worksheets.
Do not replace their hash to force admission. New prospective collection,
complete reviews, usable outcomes, scoring calibration, chronological holdout
comparison, live adapter and rollback evidence remain open release gates.
Neither this QC pass nor a green CI run establishes predictive performance or
permission to activate the fixed scoring in production.
