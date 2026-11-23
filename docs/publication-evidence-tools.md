# Publication and offline evidence tools

Run `node scripts/build-pages-candidate.mjs` to produce a candidate static bundle and pages-candidate-size.json. It includes browser assets and the current dashboard delivery files. Brokerage archive/history readers already use repository raw URLs. Source archives are not deleted or rewritten. The active Pages source remains unchanged: existing direct historical Pages URLs need a compatibility decision before a switch. Measure actual checkout/build/upload/deploy time on the same runner before claiming faster production publishing. Candidate byte reduction alone is not a measured speedup.

Run `node scripts/analyze-quote-exports.mjs /private/path/session1.json /private/path/session2.json` locally. Redirect results only to a private location. Each exact contract is analyzed separately. Duplicate exports do not inflate counts; conflicting duplicate samples fail. Clocks and OPEN metadata are rechecked rather than trusting passing labels. Reports remain bounded to 500 samples per contract and disclose omissions. Token renewal, exchange latency and Discord receipt remain unverified. No private export is included in repository tests.

The browser contract-watch suite now exports synthetic journal entries, clears the synthetic local journal, restores it, and imports again to verify exact preservation and duplicate suppression. It runs at phone and desktop widths. This does not access or clear the owner's real journal.

The separate Cloudflare Workers Builds check reports only a build identifier and dashboard link through GitHub. The actual GitHub Worker deployment succeeds. Cloudflare build logs/settings remain required to diagnose the separate integration; do not weaken checks or change the working production deployment based on an unexplained failure.

## Manual read-only build diagnostic check

`Cloudflare build diagnostics (read only)` uses the separate repository secret
`CLOUDFLARE_DIAGNOSTICS_API_TOKEN` plus the existing `CLOUDFLARE_ACCOUNT_ID`.
It performs GET requests only, without deployment, build triggers or configuration
writes. Output contains request status, preview-enabled state, build IDs/outcomes
and fixed error categories from at most five builds' first log pages. Raw provider
bodies, commands, variables and log messages are never printed or uploaded.
Unknown errors remain unknown; categories alone do not establish a root cause.
A 401/403 is access evidence, not a reason to change deployment gates.

Source: https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/
and the logs endpoint's documented read permission. User reports the diagnostic
secret saved November 23, 2026; its validity and actual access remain unverified
until a manual run. Three synthetic regression tests cover denied access,
GET-only requests and omission of sensitive response content.

The follow-up diagnostic workflow accepts up to five comma-separated build UUIDs.
Defaults select the exact failed PR152/PR155 builds and the successful PR159
preview for comparison. Blank input retains recent-build sampling. IDs are
validated before requests and are passed through an environment variable rather
than inserted into shell code. Explicit builds absent from recent history retain
unknown outcomes; no successful outcome is fabricated from readable logs.
