# Stock project action ledger

Updated November 19, 2026. This is the canonical follow-up ledger. A passed test,
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
| A06 | Final delayed-bar collection | RELEASED via PR148. Recovered November 19 201/201 stock final bars at the actual late collection time. Bounded late recovery and visible partial/source failures installed; normal/early-close scheduled operation remains an independent acceptance check. |
| A07 | Pattern/RVOL/1–2pm research | RELEASED research collection via PR137/PR138. Source-bar session labels and frozen public controls retained; event days unknown without calendar evidence. No production boost. See research-experiment-plan.md. |
| A08 | Quote capture/renewal | Auto-refresh and private plans RELEASED via PR147; private clock/latency export implemented in the follow-up release. BLOCKED LIVE EVIDENCE: exact current option, 5/10/15 windows and real rotating-token renewal still required in authorized Safari. Equity export is not this evidence. |
| A09 | Saved-watch and Discord | PR147 added separately opted-in private position checkpoint alerts (five-minute checks); this does not enable the saved-watch signal system. BLOCKED LIVE EVIDENCE: owner save/server sync, qualifying transition, delivery and retry/dedup checks. Signals remain off. |
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

PR137 did not change production alert, fill or scan-cadence flags. PR147 subsequently released the separately opted-in private position monitor; no actual active position or successful Discord receipt is inferred. Automatic fill lookup, saved-watch verified signals and fast scans remain gated; quote pilot remains on.
Actual authorization, renewal, market-hours capture and multi-session strategy
evidence remain open. Deployment does not satisfy those gates.

Pages deployment [44431765568](https://github.com/Carooch62/0dte-options-command-center/actions/runs/44431765568) succeeded for the released code. The earlier Pages run was superseded by the scanner data commit, not a code-build failure.


## Current upgrade queue and unblock conditions

This table supersedes older implementation summaries above; live evidence remains independent of deployment. See upgrade-acceptance.md for exact acceptance steps.

| ID | Current work | Resume when | Acceptance / next action |
| --- | --- | --- | --- |
| U01 | Private quote export and request metrics implemented; market acceptance pending | Exchange OPEN, owner can access the private dashboard, exact current contract | Retain/export 5/10/15-minute windows; at least 20 passing quotes over two sessions for comparable speed; actual rotating-token renewal separately observed. |
| U02 | Connected read-only broker executions and position reconciliation are available; hosted automatic fill integration remains gated | Fee evidence for verified net P&L; hosted authorization/schema for automatic journal integration | Reconcile exact contract, times, partial fills and later sells through the available read-only path now. Preserve private results outside this repository. Missing fees/net P&L remain unknown; do not import ambiguous fills. |
| U03 | IWM 15/30/60-minute stock-only matcher and scheduled staging report implemented | Five coverage-eligible prospective sessions under iwm-control-v1 | Review report coverage, arm/direction/time-of-day confounding and frozen catalyst/pattern context. Missing horizons stay missing; no automatic tuning. |
| U04 | Catalyst, pattern and afternoon scoring improvements deferred | U03 and existing equal-budget news / pattern cohorts have reviewed multi-session evidence | Propose versioned hypotheses, use held-out sessions, preserve risk/liquidity gates and perform explicit production review. |
| U05 | Quote status/latency/export visibility implemented; broader UI follow-up evidence-gated | Owner market-hours acceptance identifies a specific usability gap | Verify phone layout, quote age, selected contract, active versus paused plans and connection state; do not describe an enabled setting as verified delivery. |
| U06 | Background position delivery operational check blocked | Actual open position, current passing exact-contract quote, reviewed levels, owner TEST ONLY receipt | Verify trigger crossing, deduplication and pause/retry behavior. Do not enable old closed positions or inject synthetic market data into production. |

Blocked work must retain its ID, exact prerequisite, owner/session requirement and evidence needed. Recheck the queue independently of whether a new closing review was posted. Do not create duplicate trading/exit monitors. A future follow-up may implement authorized small fixes and produce review PRs; algorithm promotion and live alert activation retain their separate evidence requirements.

A dedicated conditional follow-up now rechecks this queue hourly on weekdays during New York business/trading hours, separately from Closing Review Follow-up. It resumes supported work or reports a newly required owner action, suppressing duplicate notifications. The calendar and actual evidence, not the scheduled check alone, determine readiness.

Follow-up release: [PR150](https://github.com/Carooch62/0dte-options-command-center/pull/150) merged quote-validation export, the IWM stock outcome matcher/scheduled report and this unblock queue. Verification passed 186 Python, 317 Node and 18 Worker tests plus phone/desktop browser suites and Worker dry run. [Worker deployment 44668572840](https://github.com/Carooch62/0dte-options-command-center/actions/runs/44668572840) and [isolated IWM review 44668598111](https://github.com/Carooch62/0dte-options-command-center/actions/runs/44668598111) succeeded. The initial report correctly waits for five covered sessions; no live quote/alert acceptance is implied. Broker read access was checked independently: executable record retrieval is possible now, while fees and hosted autofill remain separate prerequisites. No private reconciliation details are stored here.

## November 20 dashboard/scanner quality follow-up — review pending

The checked public snapshot `816d0728-5008-4080-aee3-2e7423cfc768` received
200/205 stock rows and 72/75 successful option-chain requests; core ETFs were
present. The 61,704 ms pipeline included 46,095 ms of option expansion. These
are one-scan measurements, not a provider latency benchmark or a proven speedup.

A focused review branch corrects the collapsed filter summary (the default
ACTIVE view previously said “All candidates”), makes All stocks select all
states, names stock-count gaps and failed chain symbols, and treats failed or
unverified chains as incomplete even when every planned chain was attempted.
Sanitized per-provider durations, error categories and HTTP status codes are
retained with new public chain observations; older observations remain unknown.
No response bodies, URLs, credentials or private account records are collected.

Local verification: 188 Python and 323 Node tests pass; browser asset build,
syntax and diff checks pass. Phone/desktop browser assertions are extended in
the existing Contract Watch QA suite; its CI outcome is independent of local
unit tests. Review changes are not deployed or live accepted. Provider retries,
concurrency, scan budget, scores, eligibility and alerts are unchanged. U01/U06
owner acceptance and U03/U04 prospective evidence gates remain open. PR152
packaging is complete; Pages activation/compatibility, comparable publish timing
and actual Cloudflare preview diagnostics remain queued.

## November 20 empty candidate board diagnosis — review pending

Public scan `4140bb62-a804-4f6e-8716-9b0857045ed9`, generated at
2026-11-20T16:05:18.343537Z, contains 198 stock rows (45 non-PASS states),
but no eligible same-day or 1–7-day contracts. Its new provider diagnostics
record 71 Cboe HTTP 403 failures; the Nasdaq fallback succeeds for 69 symbols
but supplies no verified Greeks. All 12,594 same-day option observations lack
verified delta. This is one observed snapshot, not a claim about every scan
today, nor evidence that no suitable contracts exist in the market.

The Display setting is saved on each device. Matching contracts only can hide
every stock when no option passes; the owner's actual saved settings remain
unobserved. The review fix adds a board-level stock/matching-contract count,
explicit missing-delta context and a matching-only recovery explanation. It
versions the changed coverage helper to avoid reusing its old cached exports.
No source access workaround, fabricated Greeks or relaxed eligibility is added.

Local verification: 324 Node tests, syntax, asset build and diff checks pass.
Phone/desktop browser coverage is added for both expiry views, saved matching-only
filters, All stocks recovery and an old unversioned dependency. Local Chromium
is blocked by the runtime socket restriction; browser CI remains independent.
Changes remain review-only; actual source recovery and owner-session acceptance
are still outstanding. No private data or production flags change.

## November 20 source-recovery review

PR154 subsequently merged the board explanation; GitHub Worker deployment
[44772612223](https://github.com/Carooch62/0dte-options-command-center/actions/runs/44772612223)
succeeded. This release does not restore verified option data.
The public Pages HTML was independently checked and serves the board-availability
release marker; this is asset delivery verification, not owner quote acceptance.

The source review found an explicit automated-extraction prohibition on Cboe's
delayed dashboard. A follow-up review removes that request path and keeps Nasdaq
observations as research-only when delta is missing. A separate bounded private
recovery batch permits explicit metadata matching and quote/Greek review, without
turning missing-delta contracts into production eligibility or alert candidates.
Read-only capability checks succeeded privately; actual hosted owner-session
validation is pending. See option-source-recovery.md for source decisions,
historical-versus-prospective evidence and exact remaining acceptance steps.

U01/U05 recovery work is review-only. U02 fee/net evidence, U03/U04 prospective
session gates and U06 actual owner-confirmed delivery remain open. Production
scores, eligibility, live alert settings and unrelated automations are unchanged.

Review implementation [PR155](https://github.com/Carooch62/0dte-options-command-center/pull/155),
commit `2eb2fd36cbdd53681a1a2969741856bb327a063a`, passed
[scanner/dashboard verification 44774751415](https://github.com/Carooch62/0dte-options-command-center/actions/runs/44774751415)
and [phone/desktop recovery plus Worker dry run 44774751882](https://github.com/Carooch62/0dte-options-command-center/actions/runs/44774751882).
Those checks use synthetic broker responses. The review is not deployed and
does not establish hosted owner authorization, token renewal or live acceptance.

## November 20 PR155 released — owner acceptance pending

This release status supersedes the review-only state above. [PR155](https://github.com/Carooch62/0dte-options-command-center/pull/155)
merged as `31aec9952f7743a845c26c302e0d05101bef785f`.
Latest-head [scanner/dashboard CI 44775253503](https://github.com/Carooch62/0dte-options-command-center/actions/runs/44775253503)
and [mobile/recovery QA 44775253499](https://github.com/Carooch62/0dte-options-command-center/actions/runs/44775253499)
passed using synthetic broker responses.
[Worker deployment 44775631361](https://github.com/Carooch62/0dte-options-command-center/actions/runs/44775631361)
succeeded at 2026-11-20T16:40:33Z, version
`2b146a53-0d62-4c0c-8bbe-ed8354f85949`. Its setup check confirmed protected
routes and existing connection configuration; no bindings or connection flag
were changed. No hosted quote success or token renewal is inferred.

Normal [scan 44775631463](https://github.com/Carooch62/0dte-options-command-center/actions/runs/44775631463)
succeeded and published both research identity files in commit `73f24aa`.
The preserved source generation clock is 2026-11-20T16:40:34.691729Z;
publication push completed at 16:41:49Z, not at the source generation clock.
The same-day batch retains 18 of 21 research identities; the 1–7-day batch
retains all four. Both explicitly have zero qualifying contracts and no
eligibility effect. These are public-source identities, not broker quote results.

U01/U05 next owner action: in the authorized private Quotes session, open
Missing-delta recovery, select same-day, load the research batch, then explicitly
match and fetch; repeat for 1–7-day and retain private exports. Verify exact
identity, age, book and Greeks; preserve any website authorization failure.
The current branch-preview configuration has no private broker connection, so
use the existing owner-protected site. Do not copy private bindings to previews.
This release makes that check newly actionable; suppress repeated reminders
until evidence changes. U01 5/10/15 clocks, >=20 passing quotes over two OPEN
sessions and actual rotating-token renewal remain independently outstanding.
U02 fees/net, U03/U04 prospective evidence, U06 actual open-position Discord
receipt and the queued Pages/Cloudflare infrastructure work remain unchanged.
No public eligibility, scores or live alert activation changed.
