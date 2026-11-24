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

## November 20 connection guidance — unblock review

U05 has a concrete status-copy gap: the candidate quote page can show a successful
request beside unconditional instructions to sign in again. The review change
makes setup guidance conditional on a request requiring sign-in or renewal,
acknowledges a quote request completed in this visit, and preserves an explicitly
checked connection status. Restored requests do not become new live verification.
Later failures remain visible and retry remains manual. The panel asset version
changes so the updated copy is fetched.

Local verification: all 30 candidate quote panel tests pass, including new
success/status/failure/reload regressions; panel syntax check passes. These are
synthetic tests. This change is review-only, not deployed or owner accepted.
No private evidence, contracts, quote values, execution records or identifiers
are included in this review. Remaining owner evidence is reviewed privately;
U01's two-session speed and actual rotating-token renewal gates remain open.
A successful request does not establish renewal, setup eligibility or delivery.

U02 reconciliation remains complete privately; fees/net results remain unknown.
U03's current iwm-control-v1 report on staging-next-20261117 still reports zero
coverage-eligible sessions (report checked_at 2026-11-20T03:34:29.517948+00:00).
U04 remains evidence-gated; U06 still requires actual open-position delivery
acceptance. No prior owner reminder is repeated by this update.

The [official NYSE calendar](https://www.nyse.com/markets/hours-calendars)
confirms November 20 is a regular 09:30–16:00 ET cash-equity session,
November 26 is closed and November 27 closes at 13:00 ET. Eligible options'
13:15 early close is a separate product rule, not an extra XNYS stock horizon.
Existing collectors/scans continue without a dispatch, cancellation or data rewrite.
PR152 remains complete. Historical Pages URL compatibility, Pages source
configuration/activation, comparable real publishing timing and actual Cloudflare
preview build logs/settings remain queued. The available GitHub interface cannot
read Pages configuration; no cause is inferred for Cloudflare's separate build
status and no working deployment gate is weakened.


### PR157 CI follow-up

[Scanner/dashboard verification 44788750182](https://github.com/Carooch62/0dte-options-command-center/actions/runs/44788750182)
passed on the initial review head. [Candidate Mobile QA 44788750645](https://github.com/Carooch62/0dte-options-command-center/actions/runs/44788750645)
failed because the setup link label had changed from “Open” to “open”, breaking
the existing exact accessible-name assertion at scripts/test-candidate-mobile.mjs:160.
The follow-up restores the established accessible label while retaining conditional
guidance. The browser assertion and deployment gates are unchanged. All 30 panel
tests still pass locally; latest-head browser CI must pass independently. The
change remains in PR157, not deployed. No acceptance gate or owner reminder changes.

## November 23 independent unblock check — review only

Rechecked main and the private reconciliation case without repeating the closing
review or importing private records. U02 execution/quantity reconciliation stays
complete; fee evidence and net results remain outstanding. No later evidence is
backdated to its scan-generation clock.

The prospective `iwm-control-v1` report on `staging-next-20261117`, blob
`f327f7d9a7929779f01b5cbeeef24e88476278e4`, was checked at
2026-11-21T00:13:46.801395+00:00 and still reports zero coverage-eligible
sessions, no sessions/results and WAITING_FOR_FIVE_COVERED_SESSIONS. U03/U04
remain gated; retrospective source manifests are not substituted. Existing
workflows may collect prospective inputs without manual dispatch or cancellation.

U01's owner-session 5/10/15 clocks, 20 passing quotes across two OPEN sessions
and actual rotating-token renewal remain unverified. U06 still needs an actual
open-position checkpoint and owner-confirmed Discord acceptance. Previously
recorded owner actions are unchanged and are not repeated. U05's connection-copy
fix remains in PR157; refreshing it with current main preserves its scope.
Prior head `c05a4c592c323a1cfd0ad75f69382980a625233a` passed
[verification 44794779907](https://github.com/Carooch62/0dte-options-command-center/actions/runs/44794779907)
and [mobile QA 44794779896](https://github.com/Carooch62/0dte-options-command-center/actions/runs/44794779896).
Those are synthetic checks, not deployment or owner acceptance.

The [official XNYS calendar](https://www.nyse.com/markets/hours-calendars)
confirms November 23–25 regular 09:30–16:00 ET stock sessions, November 26
closed and November 27 closing at 13:00 ET. Eligible options' 13:15 close does
not extend the stock-only outcome window. Session availability alone does not
supply any missing quote, research or delivery evidence.

A fresh actual Pages baseline is available from
[run 45189596751](https://github.com/Carooch62/0dte-options-command-center/actions/runs/45189596751),
source `e6a7a01aefbfe6bb06957f8c295d65ebfb45b90b`: Checkout
14:00:45–14:03:13Z (148 s), Jekyll build 14:03:13–14:03:24Z (11 s),
upload 14:03:24–14:03:41Z (17 s), deploy 14:03:50–14:04:16Z (26 s),
on November 23. Build and deploy use distinct GitHub-hosted runner instances.
This is the existing publishing path, not a candidate comparison or proven
speedup. PR152 packaging/offline analysis stay complete. Historical Pages URL
compatibility, source configuration/activation and comparable candidate publishing
remain queued. Actual Cloudflare preview logs/settings are still unavailable
through the connected interface; no cause is inferred and no deployment gate
is changed. No private identifiers, quotes, fills or owner-file links are published.

Refresh validation: 188 Python and 332 JavaScript tests pass locally after
installing the declared Python dependencies; panel syntax, browser asset build
and diff checks pass. The installed XNYS exchange calendar independently matches
the official November 23–27 stock-session schedule. Current-head browser CI
remains independent of these local checks. No code beyond the existing PR157
connection-guidance change is added by this refresh.

## November 23 Cloudflare build quota evidence and cleanup

Owner-provided dashboard evidence supersedes the unexplained-build status:
build fb53f6f9 for review head 59417fa is explicitly SKIPPED, and the
Worker settings report builds paused after all 3,000 included monthly build
minutes were consumed. The displayed reset is November 30, 2026 at 18:59 EST.
This establishes the current account quota pause, not a code compilation error
or proof that every older failed check had the same cause.

The screenshot shows main as production branch, include path `*`, asset build
command `node scripts/build-assets.mjs`, and deploy command
`npx wrangler deploy`. The earlier review build shows `npx wrangler preview`.
No branch-specific private bindings should be copied into previews.

Proposed first cleanup, NOT APPLIED to the account: keep include `*` and
existing exclusions, add `data/*` and `docs/*` to Cloudflare build watch
exclusions. The Worker asset allowlist in scripts/build-assets.mjs copies no
data or documentation; live public data is fetched separately. Thus data-only
scanner/archive updates and documentation-only changes do not need a Worker
rebuild. Code, asset, configuration and build-script changes remain eligible
to trigger builds. Verify the next data-only push skips intentionally and
a later code change builds after quota availability returns. Cloudflare may
bypass path matching for empty pushes, 3,000+ changed files or 20+ commits.

Source: https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/
and https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/.
The existing filtered GitHub deploy-worker workflow is a separate production
delivery path and remains unchanged. No build/check bypass, plan upgrade,
history/cache purge, runtime setting, secret, storage binding, cron, scan,
score, eligibility or alert change is made. Keep current production and known
rollback versions. Removing historical build logs does not reverse consumed
build time. A consolidation of duplicate production deployment paths requires
an explicit reviewed configuration decision; do not silently disable either.

Account configuration still needs to be applied and verified in an authorized
Cloudflare session. The earlier browser sign-in returned 403; a screenshot
does not grant that browser an authenticated session. The PR records a
prepared settings cleanup, not a completed account change or production release.

## November 23 build diagnostics prerequisite

Owner reports the separate `CLOUDFLARE_DIAGNOSTICS_API_TOKEN` repository secret
saved. A manual GET-only diagnostics workflow is prepared in review; three
synthetic tests pass for denied access and response privacy. This is not a live
permission check. Actual run, private log/settings review and root-cause evidence
remain pending. No working deployment gates or production configuration change.
See publication-evidence-tools.md. Pages compatibility/activation and comparable
publish timing remain queued independently.

## November 23 diagnostic access verified; historical failures remain separate

PR159 merged as ec8f0efdccf66ab76bbd57e17bdf506621fac6da. Live manual
[diagnostic run 45230435757](https://github.com/Carooch62/0dte-options-command-center/actions/runs/45230435757)
succeeded: metadata, settings, history and five first log pages were accessible;
previews were enabled. Two sampled outcomes succeeded, one skipped and two
were unknown. No recognized error category appeared. This establishes read
access only, not historical failure resolution.

PR159's Cloudflare preview check subsequently succeeded for build
60256d7d-698e-4350-aa5c-8b79d5c2d1d6. PR152 build
c2a4779d-51c6-40ce-811e-f783f28ca357 and PR155 build
556ae2ec-a6a5-4cad-8cc1-dcf066f5e977 still have failed GitHub checks.
A targeted read-only follow-up adds explicit build IDs so those older log pages
can be compared with the successful preview. It retains unknown outcomes when
an explicit build is absent from recent history and validates IDs before requests.
Five synthetic tests pass; historical log inspection remains pending a live run.
No root cause, recovery date or production configuration fix is inferred.

## November 23 production readiness continuation

PR160 merged as 79b79de86c2b29845736678da3a12de07364f1c9 after scanner CI
45231227692 and its Cloudflare preview succeeded. The targeted live diagnostic
run remains outstanding: the available connector has no workflow-dispatch action
and the current browser is signed out. Run Cloudflare build diagnostics (read only)
on main with its default historical build IDs; retain the sanitized result.
PR157 incorporates this main release while preserving both ledger histories;
its connection-guidance change requires fresh head CI and preview validation.
Earlier quota screenshots remain historical evidence; later preview successes
do not establish the cause of earlier failures or prove account path changes.
Live owner quote/token/Discord acceptance and prospective research gates remain
independent. No scores, eligibility or live alert activation changes.

## November 23 accuracy and delivery implementation

See accuracy-speed-release.md for observed staging run gaps and the isolated
public research dispatch repair. The review adds IWM exclusion/coverage reasons,
provider call duration/status summaries, and visible verified-delta coverage.
No production speed improvement or strategy acceptance is inferred. Prospective
collection requires source synchronization and actual next-session packets;
private first-session quote evidence remains distinct from two-session timing,
rotating-token renewal, fee reconciliation and owner-confirmed Discord receipt.
The user reports Workers Paid; documented entitlements are assessed separately
from verified billing state and actual resource usage. Pages historical URL
compatibility, activation and comparable publish timing remain explicit gates.

## November 23 collection/diagnostic release verified

PR163 synchronized reviewed source to supported staging as
2515f570e8061a922da605b59d683924844b0ef5, preserving data tree
8c77cb32b9788ee9a7e607876b8c831892a3b393 byte-for-byte and retaining
staging-only regression coverage. PR162 merged as
9dfe16c1366f8366dd7b2a2d9946262f0bc39c0a after latest-head scanner CI,
phone/private-workflow QA, desktop/phone Contract Watch QA and candidate packaging
passed. Main checks: 45293690115, 45293690081, 45293690210, 45293690214.
Staging checks: 45293699116, 45293699032, 45293699033; production packaging
correctly skips isolated staging reviews because production delivery data is absent.

Worker deployment 45294045316 succeeded on November 23 at 19:04:23 ET
(November 24 00:04:23Z), version 22e2a8e1-9a8e-4959-b096-c65e658815a2.
Its log confirms STAGING_COLLECTION_ENABLED=true. The new dispatcher uses a
small validated scan-health calendar record; old/failed/non-OPEN health cannot
trigger it. Production scan cadence, trading alert flags and scoring are unchanged.
Installation is verified; a subsequent OPEN-session dispatch and fresh packet
are still outstanding. Local inspection of the preserved staging tree found zero
frozen input packets, which explains why no prospective IWM session is usable.
Missing sessions are not backfilled. U03/U04 remain evidence-gated.

The compact public Pages candidate uploaded as artifact 14874818355 in run
45293690214 (compressed artifact 1,728,774 bytes). It is not activated and this
size is not a measured production speedup. Historical URL compatibility, source
configuration/activation and comparable publish timing remain queued. A historical
post-close public snapshot has 74 provider timings with p50 2,429.5 ms and p95
3,514.6 ms; this is not a market-hours speed benchmark. New reports retain sample
counts, unknowns and provider failures without raising request concurrency.

The privately supplied November 23 quote export advances first-session 5/10/15
capture evidence. Two-session request timing, actual rotating-token renewal,
fee/net evidence and real open-position Discord receipt remain separate gates.
No private account, contract, price, fill, fee or token records are published here.

### November 23 quality audit: evidence integrity fixes (review)

Regression checks reproduced incomplete chain results being shown as complete,
pre-open snapshots qualifying as OPEN-session quote evidence, malformed frozen
IWM records aborting report generation, and tied conflicting bar observations
producing input-order-dependent outcomes. Coverage now requires numeric,
reconciled source-status counts. Quote polling/session evidence requires a snapshot
generated within the declared session. IWM reporting excludes malformed inputs,
conflicting packet identities and ambiguous first bars, reports exclusions, and
never substitutes later revisions. A corrupt packet file is counted rather than
preventing a report from the remaining valid records. Staging capture also requires
a nonempty request ID matching both validated health and snapshot; three missing
IDs no longer satisfy that check.

Local validation: 196 Python tests and 346 Node tests pass; browser asset and
compact candidate builds, JavaScript syntax and whitespace checks pass. These
are synthetic regression/build results, not owner-session, prospective-session,
token-renewal, fee, Discord-delivery or profitability acceptance. No production
ranking/eligibility settings, trading alerts or stored evidence were changed.
Main and isolated staging review/deployment results will be recorded separately.


### November 23 quality audit: merged and deployed

PR166 merged as 4574a6f68a331b0bde2a8a5e92aef164c7907fe7 after scanner
CI 45301457471, phone/private workflow QA 45301457386 and desktop/phone
Contract Watch QA 45301457389 passed at reviewed head afc9c949431b6d17599fc9c0822657a0ec9fc87f.
Worker deployment 45301660261 succeeded at November 23 20:00:55 ET
(November 24 01:00:55Z), version cbe624b5-d42a-4eda-a1df-8d713f87bae9.
Registered-client/protected prerequisite setup also passed; this does not prove
owner token renewal or market-hours quote acceptance.

PR167 applied the same source/test fixes to isolated staging and merged as
846a69c1d58f7437d8597aa76a531f284314bd76 after scanner CI 45301494023,
phone/private workflow QA 45301493940 and Contract Watch QA 45301493993 passed.
Local staging checks: 198 Python /346 Node tests passed. Its review commit
cebccd9c4ebd7176cd3f8f75076cdb42a99c19a3 preserved data tree
4600d4147075d65ea204943af94dbb65c771bf9a exactly. A subsequent existing
IWM review independently updated its report at 415059e045958b01b7508bd416b1cdbb8d6555b6;
that report still has zero accepted current-spec observations and zero covered
sessions. No prospective evidence was invented or backfilled by this audit.

A nonblocking deployment annotation reports legacy checkout/setup-node action
runtimes being forced from Node 20 to Node 24. Keep explicit action-runtime
maintenance queued for a separate tested change; current deploy/bundle/browser
gates passed and remain intact. Production score/eligibility promotion and live
owner acceptance remain deferred to their existing evidence gates.


### November 23 dashboard workspace UI (review)

Improve the existing Liquid dashboard through a presentation-only release:
compact layout chooser, clearer data/scan controls, readable freshness warnings,
larger labels and touch targets, a ticker/ask toolbar, and candidate cards ahead
of optional contract-watch and shadow research panels. Preserve the existing
quote/journal/entry-plan controls, source limitations, disclosure persistence,
selection/ranking behavior and live acceptance gates. Add a keyboard skip link
and a focusable candidate section; retain reduced-transparency/contrast support.
The stylesheet is included in the explicit asset allowlist and deploy/browser QA
path filters. Expand synthetic board checks to 320/390/768/1280px, candidate-first
reading order, status readability, keyboard navigation and layout-menu access.
Local Node regressions pass (346); static assets and syntax checks pass. Desktop
preview inspection uses labeled synthetic fixtures only. Hosted browser checks
must pass before merge; no real quotes, fills or private account data are used.

### November 24 private Access failure diagnosis (review)

After the owner updated the application's AUD binding, an independent browser
check still returned the Worker's generic private sign-in rejection, including
on the top-level sign-in route. No successful quote, renewal or capture clock is
inferred. The existing verifier collapses missing assertions, invalid local
configuration, rejected claims and signing-key failures into one boolean, so the
observed response does not identify a cause.

A small diagnostic change exposes only fixed failure categories on GET of the
existing private sign-in route. Other private responses retain their generic
rejection. No binding values, assertion/header/cookie contents, claims, account
records or provider errors are returned or logged. Signature, issuer, audience,
owner identity and time checks remain mandatory; failed checks cannot read
broker credentials or private storage. The category is diagnostic evidence only,
not proof that a Cloudflare policy or owner connection is configured correctly.
Deployed diagnosis remains pending. Do not rotate unrelated settings or replace
the owner email (which also identifies stored connections) without evidence.

PR170 merged as a7fe7304e416560be5ae75d18dd4ea8f1afd68f5. Scanner/dashboard
CI 45442436953 and hosted mobile/Worker-bundle QA 45442437186 passed;
Worker deployment 45442892627 succeeded. A subsequent live browser GET of the
sign-in route returned CLAIMS_REJECTED. This establishes that an assertion
reaches the Worker and local configuration passes format checks; it does not
establish signature validity or identify which claim differs. Authentication and
quote capture remain blocked. No claim values or private records are recorded.

The follow-up diagnostic verifies the signature against the configured team's
keys before distinguishing issuer, audience, owner or time rejection. Forged
assertions cannot obtain these detailed categories. Ordinary private requests
retain their existing early claim rejection. All 348 Node regressions pass,
including signed mismatches and forged assertions with mismatched claims.


### November 24 signed owner mismatch confirmed live

PR171 merged as 80b2598b76e22ea0e8781fa0f0edcae75195fdad after scanner/dashboard
CI 45443381309 and mobile/Worker-bundle QA 45443381189 passed. Deployment
45443716792 succeeded. The subsequent browser sign-in check returned
OWNER_REJECTED after signature verification. The configured team's signature,
issuer and audience checks passed; the signed identity did not match the
configured owner. Time validity is checked after owner identity and is not
inferred from this rejection. No owner email, claim or token value is published.

The next owner check is the identity used for the latest Private Brokerage
Access login in its audit log. Do not blindly rotate CF_ACCESS_EMAIL: it also
selects legacy credential and position-plan storage. Preserve existing mappings
before an intentional owner change. No reconnect, token renewal, successful
quote capture or Discord acceptance is inferred. Suppress duplicate requests
until the identity/configuration evidence changes.
