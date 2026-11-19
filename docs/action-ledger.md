# Stock project action ledger

Updated November 18, 2026. This is the canonical follow-up ledger. A passed test,
merged PR, deployed feature and verified market-hours operation are different
states. Keep source/PR, release, live evidence, blocker and next action together.
Never publish private account/quote/credential records here.

| ID | Requested work | Implementation / next evidence |
| --- | --- | --- |
| A01 | Staging branch, reader and ongoing collection | MERGED via PR137/PR138. Supported branch and recurring workflow aligned; first run correctly skipped off-hours collection. Actual fresh OPEN packets remain pending. See staging-collection.md. |
| A02 | Current support/alert runbooks | DEPLOYED via PR137. Corrected: unattended permission granted; manual option navigation supported; quote pilot on and signals off; OAuth remains separate. |
| A03 | Unknown freshness QC | DEPLOYED via PR137. Boundary now requires RECENT; normalized pipeline and call/put regression cases checked. |
| A04 | Canonical dashboard and evidence export | RELEASED via PR137. Root/dashboard aliases select Liquid; private export has explicit UTC date control. Legacy glass/v2 remain available for rollback, not current feature parity. |
| A05 | Equal-budget news coverage | INSTALLED in supported staging via PR138. TOP50 vs TOP40_ROTATE10 only behind isolated staging marker; prospective multi-session comparison outstanding. |
| A06 | Final delayed-bar collection | INSTALLED via PR137. Separate calendar-aware capture workflow; verify real normal/early-close output, completeness and review addendum. |
| A07 | Pattern/RVOL/1–2pm research | RELEASED research collection via PR137/PR138. Source-bar session labels and frozen public controls retained; event days unknown without calendar evidence. No production boost. See research-experiment-plan.md. |
| A08 | Quote capture/renewal | BLOCKED LIVE EVIDENCE: exact current option, 5/10/15 windows and real rotating-token renewal still required in authorized Safari. Equity export is not this evidence. |
| A09 | Saved-watch and Discord | Code exists; BLOCKED LIVE EVIDENCE: owner save/server sync, qualifying transition, delivery and retry/dedup checks. Signals remain off. |
| A10 | Fill lookup | BLOCKED PROVIDER: hosted authorization and exact authorized account/schema. Manual fill/exit journal previously released; lookup remains off. |
| A11 | Speed acceptance / one-minute cadence | Existing optimizations released; comparable quote p50/p95 across >=20 successful requests and >=2 open sessions outstanding. Measure runner/checkout/pipeline/publish separately. FAST_SCAN stays off. |
| A12 | Scoring / early first-hour hypotheses | DEFERRED EVIDENCE: fixed/adaptive components, reviewed provenance and chronological holdout. Existing 12-bar rule preserved. |
| A13 | Swing/ML/ETF research promotion | DEFERRED EVIDENCE: separate horizons, controls, costs, sufficient features and reserved sessions; no training or tuning from one winner. |
| A14 | Old automation duplication | Old monitors paused; keep the newer broker review and follow-up roles distinct. Do not reactivate legacy monitors. |
| A16 | Linked Cloudflare preview builds | Pre-existing separate Workers Builds check still fails without diagnostic detail, including the previous release. Actual GitHub Worker deployment succeeds. Inspect the Cloudflare build logs/configuration before attempting a fix; do not weaken deployment checks. |
| A17 | Static publishing performance | Current tracked snapshot approximately 977 MB, including 822 MB historical archives. Pages checkout/build is a separate delivery bottleneck. Design a smaller publishing artifact while preserving archive access and compare actual publish times before changing it. |
| A15 | Unsupported or declined scope | Exact contract deep links unsupported; paid data/SMS and native/PWA app excluded under current website/$0 plan. Manual trading only. |

## Follow-up contract

Before changing an item, read its current source and evidence. For a completed
session, record each item once with actual source commit/run/PR and verification
result. A missed window is missing, not successful. Use focused review PRs for
small supported fixes; algorithm/alert activation requires its independent gates.
No changes to production weights/eligibility from one day's closing review.

## Release status

PR137 merged the implementation and PR138 synchronized supported staging while
preserving the staging data subtree byte-for-byte. Production verification passed
178 Python + 278 JavaScript tests; staging additionally retains two collector
privacy/idempotency tests (180 Python + 278 JavaScript). Candidate Mobile QA,
Contract Watch QA and Worker dry run passed for both reviewed heads.

Worker deployment [44431582267](https://github.com/Carooch62/0dte-options-command-center/actions/runs/44431582267) succeeded;
version 30f64d9e-af34-41d2-9677-2a7fcb80c9fc. Protected private routes remain protected.
Staging run [44431882173](https://github.com/Carooch62/0dte-options-command-center/actions/runs/44431882173)
correctly skipped collection outside the regular session, without publishing new
evidence. That is a calendar-gate check, not successful market-hours collection.

No production alert, fill or scan-cadence flags were changed. Verified alerts,
automatic fill lookup and fast scans remain off; quote pilot remains on.
Actual authorization, renewal, market-hours capture and multi-session strategy
evidence remain open. Deployment does not satisfy those gates.

Pages deployment [44431765568](https://github.com/Carooch62/0dte-options-command-center/actions/runs/44431765568) succeeded for the released code. The earlier Pages run was superseded by the scanner data commit, not a code-build failure.
