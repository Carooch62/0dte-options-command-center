# Private option quotes and position checkpoint alerts

## Implemented behavior

The private Liquid dashboard supports optional foreground quote polling. It starts
off, requires a fresh first quote and a current OPEN-session snapshot, and waits
60 seconds after request completion. Only one quote refresh runs at a time. Hidden
tabs pause requests; reopening does not cause a catch-up burst. Transient failures
back off to at most 16 minutes; sign-in/setup/authorization failures and expired
contracts stop the loop. Closing/changing the selected contract stops its loop.
Displayed counts distinguish successful responses from passing fresh quote checks.
Browser request time does not establish exchange latency. This is not streaming.

Matching browser-local fills and saved exit levels remain separate from quoted
prices. Public Pages and the private Worker have different browser storage; use
journal export/import deliberately. Existing price-reference ladders remain
illustrative, editable examples rather than calibrated strategy recommendations.

The private position service stores owner-reviewed exact-contract plans encrypted
with AES-GCM in a dedicated SQLite Durable Object. Plans include actual premium,
quantity/time, explicitly reviewed loss/profit bids, source-fill fingerprint, revision
and enable state. No plan is created or enabled automatically from a scanner result.
Owner Access JWTs and same-origin mutation checks protect the API. Revisions reject
stale overwrites from another device. A saved paused plan makes no quote requests.

Before enabling a plan, the owner must send a labeled TEST ONLY message, confirm
receiving it in the private Discord channel, and confirm the actual fill/exit levels.
The server verifies the same tested webhook, a current exchange-calendar session,
and fresh exact-contract bid/ask evidence. Missing authorization or prerequisites
block activation. After hours, save paused and enable during a verified session.
No real position or notification is activated by deployment alone.

Background checks run on the existing five-minute Worker tick, independent of
Safari and entry scanner eligibility. The initial limit is three active plans and
50 saved plans; existing records are never silently overwritten at the storage
limit. Exact contracts shared by multiple fills reuse one quote lookup. A current-day
calendar snapshot provides actual open/close boundaries; missing/invalid calendar
proof prevents quote checks. Expired plans pause. Unchanged scanner results, entry
ask <= $0.30, delta, news and entry spread limits do not gate exits. Missing, stale,
ambiguous, crossed, inactive/nonstandard or mismatched quote evidence is unknown;
a reported zero bid size suppresses notification. Missing size does not establish
liquidity. Quote observations never guarantee an executable fill or identify every
halt instantaneously. Quote-check counts/reasons are available privately.

Fresh BID crossings of the user's saved levels generate review reminders. Messages
name the exact option, position/revision and loss/profit reason without raw provider
prices or Greeks. Mentions are disabled. No broker orders or automatic sales occur.
Five-minute polling plus request/delivery time can miss brief crossings.

Persisted per-position/revision/checkpoint markers prevent blind duplicate sends.
A delivery is claimed before the external request; uncertain timeouts remain pending
or DELIVERY_UNKNOWN, with no automatic resend. Explicit failures remain recorded for
owner review. A new revision can rearm after the owner checks Discord. Provider or
authorization failures back off, capped at 15 minutes. Destination changes pause old
plans until a new delivery test and explicit review.

When a monitored local fill is edited, closed or deleted, the private dashboard
attempts to pause its saved monitor. Cached opaque owned IDs let cancellation survive
reloads. Missing records on an unrelated/new device do not erase other plans. Network
failure or conflicting revisions leave a visible unconfirmed-pause warning; the
server may still monitor until the pause succeeds. Remote plans can be loaded and
paused explicitly. An already in-flight Discord message can still arrive. Actual
broker exits remain manual: the journal cannot infer a sale from a quote.

## Validation boundary

Synthetic unit and real-browser tests cover scheduling, source freshness, authorization,
encryption, revision conflicts, activation/test receipts, stale/missing/crossed books,
calendar gating, expiry, cancellation during quote lookup, provider backoff, uncertain
webhook outcomes and exact fill matching. Mock messages do not prove actual phone
notification delivery. Each owner must complete the actual TEST ONLY receipt step.
Live repeated quote timing and real rotating-token renewal remain operational
observations, not guarantees established by this code release.
