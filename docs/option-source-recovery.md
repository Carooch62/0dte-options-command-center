# Option-source recovery

Checked November 20, 2026. Source access, private capability checks, synthetic
tests, deployment and owner acceptance are separate evidence states.

## Source decision

The checked scanner records Cboe HTTP 403 failures. A single ordinary diagnostic
request also returned 403; its response does not establish the upstream cause.
[Cboe's delayed dashboard](https://www.cboe.com/data/quotes/quote_table/dashboard)
explicitly prohibits automated extraction and warns that it blocks such access.
The review removes that automated request rather than changing hosts, cookies,
headers or network identities. The legacy payload parser remains fixture-only.

Nasdaq remains public research input. Its returned chains have no verified
Greeks; missing delta must continue to block production eligibility.

[Alpaca's documented free indicative feed](https://docs.alpaca.markets/us/docs/historical-option-data)
uses derived quotes rather than actual OPRA bid/ask. Its
[chain endpoint](https://docs.alpaca.markets/us/reference/optionchain) advertises
Greeks, but free indicative prices must not be relabeled as executable market
quotes. No subscription, new account or paid feed is activated here.

Connected read-only Robinhood chain metadata and quote retrieval were tested
privately. Both expiry categories returned identity-matched quote responses
with recent refresh clocks and numeric delta, gamma and theta. Private contract
and quote details are excluded here. This is a capability check of the chat
connection, not evidence that the independently authorized website client has
passed acceptance, nor proof of Greek calculation time or sustainable throughput.

## Bounded private research path

`scripts/write-recovery-batches.mjs` reads only the public scanner snapshot and
creates separate same-day and 1–7-day identity files. It never reads broker data.
It selects public Nasdaq observations missing verified delta, while requiring
the existing static positive book, ask <= $0.30, volume >=20, 3% strike distance,
direction, expiry and tight-spread checks. At most 20 identities and two per
ticker are included in each window. Source generation clocks are preserved.

These files are explicitly research-only, use a distinct validation policy and
have zero qualifying contracts. They are not inputs to the normal eligible
batch, scoring, saved-watch pilot or alerts. Loading one does not fetch broker
quotes. It merely permits an explicit exact-metadata match and private quote
request through the existing owner-protected routes. Live prices and Greeks
stay in private responses and the existing private tab/evidence flow.

The private quote page displays delta, gamma and theta; it distinguishes missing,
outside-range and stale quote evidence. The 0–14 DTE delta preference remains
absolute delta 0.30–0.50. A quote or preferred-delta result never establishes
setup eligibility or changes the public candidate board. There is no automatic
quote polling or order path. Missing Greek calculation clocks stay unknown.

An offline projection of public source scan
`4140bb62-a804-4f6e-8716-9b0857045ed9` (generated 16:05:18Z) found 19 same-day
research identities, with 14 retained after limits, and two 1–7-day identities.
This projection was made later during implementation, not published at the
source generation clock; it is not prospective availability or an option result.

## Validation and remaining acceptance

Local checks pass 188 Python, 330 Node and 18 Worker tests, plus syntax, asset
build and whitespace checks. Synthetic tests cover both windows, policy
separation, bounds, failed/invalid sources, exact metadata, private field
sanitization and Greek conflicts. Browser CI
[44774751882](https://github.com/Carooch62/0dte-options-command-center/actions/runs/44774751882)
passed the existing phone suite, new phone/desktop private recovery flow and
Worker dry run for implementation `2eb2fd36cbdd53681a1a2969741856bb327a063a`.
Local Chromium is unavailable due to the runtime socket restriction. No live
acceptance is inferred from synthetic tests or the separate chat capability check.

After the reviewed deployment to the existing owner-protected site, the owner
uses the authorized private Quotes page: open Missing-delta recovery, choose one window, load the
research identities, then explicitly match and fetch. Repeat for the other
window. Check exact identity, clock age, book and Greeks; retain private exports.
If the website's authorization fails, preserve that failure separately from the
working chat connection. Do not copy connector credentials into the website.

U01's actual 5/10/15 windows, at least 20 passing quotes over two sessions and
real token rotation remain separate requirements. Private Discord, fee/net
reconciliation and prospective IWM research requirements remain unchanged.
Automatic public option eligibility has not been restored by this review.

## November 20 release evidence

[PR155](https://github.com/Carooch62/0dte-options-command-center/pull/155) merged as
`31aec9952f7743a845c26c302e0d05101bef785f`. Latest-head scanner/dashboard
[44775253503](https://github.com/Carooch62/0dte-options-command-center/actions/runs/44775253503)
and mobile/recovery/Worker-dry-run
[44775253499](https://github.com/Carooch62/0dte-options-command-center/actions/runs/44775253499)
passed with synthetic broker responses.

[Worker deployment 44775631361](https://github.com/Carooch62/0dte-options-command-center/actions/runs/44775631361)
succeeded; version `2b146a53-0d62-4c0c-8bbe-ed8354f85949` was deployed at
2026-11-20T16:40:33Z. The setup check confirmed protected routes and existing
connection configuration, with no missing bindings, no client metadata changes
and no connection-flag update. This is deployment/setup evidence, not successful
owner authorization or quote retrieval.

There is no broker-connected preview environment in the current configuration.
Branch previews intentionally lack private brokerage storage/connection. Owner
validation must use the existing protected site; no private bindings are copied
to previews. The separate Cloudflare Workers Builds failure remains queued for
actual build-log/settings inspection; no gate was weakened.
