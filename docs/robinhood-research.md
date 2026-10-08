# Robinhood private research workflow

Implemented October 7, 2026. Added-cost budget: $0. The authenticated Robinhood Quotes chat plugin provides read-only quote, contract, order and bar collection. The hosted Worker does not inherit that OAuth connection. No trading calls are used by this workflow.

## Collection order

1. Read the scanner shortlist and record its scan ID, publication time and selection reason. Include WATCH/PASS controls deliberately; keep their selection labels.
2. Resolve chains and exact contracts, then collect quotes in batches of at most 20. Retain instrument UUID, multiplier, expiry and `sellout_datetime`. Record actual response-reception time and verify the official session calendar before labeling session_status `open`.
3. Preserve bid/ask, sizes, provider `updated_at`, delta/theta and all raw fields. `updated_at` is a quote-refresh clock; separate bid/ask event and Greek-calculation clocks are unknown. Repeated observations may have the same quote clock but different Greeks. The display's 60-second age flag is a reporting check, not a trading threshold or proof of latency. Entry delta ranges use absolute delta (1–14 days .30–.50; swing .70–.80); theta is reported without inventing a new cutoff.
4. Fetch option orders for the user's relevant accounts and explicit UTC date range. Follow every pagination cursor. Retain per-execution IDs, prices, quantities and original fractional-second timestamps. Do not turn cancelled/unfilled orders into fills. Preserve `placed_agent`, including `expiring_option`. Account keys must be stable private aliases; omit account numbers.
5. Fetch regular-session five-minute underlying bars. Keep raw bars, bounds, interval and collection time. Ignore interpolated/unfinished bars in research calculations. The volume formulas here are explicitly reported and do not replace scanner calculations; approximate bar VWAP is not tick VWAP.

## Private snapshot format

`robinhood-research-v1` contains `retrieved_at`, `accounts`, `observations` and `bars` arrays:

- accounts: `{account_key, coverage_note, orders}` using the tool's order records. Coverage notes include queried date range and whether pagination finished.
- observations: `{instrument, quote, received_at, session_status, selection, scan_id?}` using the exact resolved instrument and quote. Keep shortlist/control selection reasons. Never label a held contract as a scanner-selected candidate without evidence.
- bars: tool results `{symbol, interval, bounds, bars}`. This version accepts one regular session per series.

Import on the protected `/brokerage.html` page. Data stays in page memory and is never POSTed, saved in localStorage, committed, or included in public assets. Quote age is recalculated every 30 seconds; no new prices are fetched by the website. Export before leaving. Subsequent snapshot imports retain collected quote observations; the latest file supplies order and underlying coverage. Keep complete order coverage in each import.

Order review pairs only adjacent, equal-quantity long opening/closing executions for the same account and contract. Overlapping lots, partial fills and uncovered closes remain unmatched for review. Fees are absent in these tool responses: gross is reported, net is unknown. Plaid transaction IDs and Robinhood execution IDs are different namespaces; no guessed join is made. Current Greeks are not historical entry Greeks. A subsequent import with a different account alias would prevent cross-snapshot comparison.

## Remaining hosted integration

Automatic collection requires a separately authorized private backend connection. Do not copy ChatGPT OAuth tokens into Worker secrets or build a public proxy. Confirm provider OAuth registration, deployment permissions, data-use terms and any charges before implementing scheduled Worker access. A manual private snapshot is the working bridge today; it does not provide a live dashboard quote feed.

For machine learning, retain original collection times and a broad, explicitly labeled control sample. Split by whole chronological sessions only after enough distinct sessions, reliable quotes and matched outcomes exist. Do not feed post-entry snapshots into entry features. This export intentionally reports `ml_ready: false`.


## Hosted connection foundation (October 8)

`robinhood-live.js` adds a separate, guarded OAuth client and private quote-test API. `brokerage.html` now has its connection controls. This is **not an activated live scanner feed**. The public scanner and its delayed-data labels remain unchanged. No Robinhood data is written to GitHub or public assets.

Private connection testing and later scanner activation:

1. Confirm Robinhood permits this personal hosted Cloudflare client, quote collection, polling frequency and intended display; confirm pricing. The official external-agent onboarding article directs other platforms to support. OAuth discovery advertises dynamic registration, but that does not establish hosted use approval. No registration, paid subscription or consent has been initiated by this implementation.
2. Register a separate public OAuth client for the exact HTTPS Worker callback `/private/plaid/robinhood/callback`. Provider discovery advertises authorization-code PKCE S256, token-endpoint authentication `none`, resource `https://agent.robinhood.com/mcp/trading` and scope `internal`. The broad provider scope is **not** a provider-enforced read-only grant. Our code only permits `get_equity_quotes` and `get_option_quotes`; no arbitrary MCP operations or trading calls are exposed.
3. Reuse the existing private encrypted KV store and Cloudflare Access configuration, keeping the Worker restricted to the owner's verified email. Protect both `/brokerage.html` and `/private/plaid/robinhood/*` with the same Access application/audience. Callback requests also require a valid Access assertion and the initiating browser's encrypted, ten-minute HttpOnly cookie. Ensure the callback request reaches the handler with its query string intact.
4. Set Worker secrets `ROBINHOOD_CLIENT_ID` and `ROBINHOOD_REDIRECT_URI`. Use the exact Worker origin for that URI. Existing prerequisites: `PLAID_STORE`, `PLAID_ENCRYPTION_KEY` (32-byte base64), `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `CF_ACCESS_EMAIL`. The deployment script enables manual connection testing only when client registration is configured, required bindings exist, and the brokerage page, status and callback all redirect unauthenticated requests to the same Cloudflare Access team. Unattended polling remains disabled pending step 1. Never copy the chat connector's tokens or use Robinhood passwords in Worker secrets.
5. Sign in via the protected Worker brokerage page, review Robinhood's consent and test quotes. Tokens are encrypted at rest, never returned to the browser, and never logged. This initial connection deliberately does not use refresh tokens: the page shows authorization expiry and requires reconnection. Local disconnect erases stored authorization; provider revocation must also be performed in Robinhood.
6. Compare consecutive stock bid/ask/trade clocks, exact option UUID quotes, prices and Greeks with Robinhood during a regular session. Stock event clocks remain separate. Option `updated_at` is a refresh clock, not proof of bid/ask event or Greek latency. Missing, future, old, crossed, zero-book and incomplete results cannot become verified fresh quotes. Receipt time never replaces a provider timestamp.
7. After authenticated validation, implement permitted refresh-token rotation with serialized storage, instrument/chain resolution, real-time regular-session bars, rate limits, and a private scanner consumer. The GitHub Actions scanner currently consumes Yahoo/CBOE and cannot consume this private OAuth session. Do not publish account-linked market data or substitute a public proxy. Revalidate scoring with complete historical bars and timestamps before switching the feed.

API routes: authenticated `GET /private/plaid/robinhood/status`; same-origin `POST connect`, `disconnect`, `quotes`; authenticated OAuth `GET callback`. Quote bodies are `{kind:"equity", symbols:["JD","AAL"]}` or `{kind:"option", instrument_ids:["<Robinhood UUID>"]}`, at most 20 per batch. The connection status remains `CONNECTED_UNVERIFIED`; quote responses explicitly report `latency_verified:false` and `scanner_feed:"DELAYED_RESEARCH"`.

Validation includes encrypted PKCE callback exchange, state/issuer and origin rejection, Access authentication, activation gating, market-data allowlisting, quote identity/coverage checks, event-clock age, unknown clocks, zero/crossed books and official dated close preservation. These mocked protocol tests are not a live Robinhood compatibility test.


### Registration and deployment progress

On October 8, Robinhood's advertised dynamic-registration endpoint accepted this separate public PKCE client with the exact protected Worker callback. Registration returned no client secret or user authorization. This confirms registration compatibility; it does not confirm permission for unattended polling or distribution of market data.

The deployment workflow installs the public client ID and callback as Worker secrets and prints only prerequisite binding names and Access route coverage. The Robinhood endpoints now live under the existing protected `/private/plaid/robinhood/` prefix. The deployment script checks unauthenticated route protection and enables manual connection testing only if all required bindings exist. Cloudflare Access policies are unchanged; the handler still verifies the signed owner-email claim. Automatic collection and live scanner substitution remain unimplemented and disabled.


The registered callback was moved into the existing protected prefix after a direct unauthenticated check returned the expected Cloudflare Access redirect. The earlier public-route registration has never received user consent or tokens. This release completes the private sign-in surface; the user must authorize the new client directly with Robinhood before any authenticated quote compatibility test.


## First live authorization failure — October 8, 10:48 ET

The user's first browser authorization attempt ended on Robinhood's generic application-connection error page. The previous registration HTTP 200, deployment success and mocked authentication tests did **not** establish that Robinhood accepts the hosted callback. Registration returned the gateway's default client ID/name; returned redirect metadata is not evidence of callback allowlisting.

The deployment now sets `ROBINHOOD_CONNECTION_ENABLED=false` and reports `PAUSED_PENDING_PROVIDER_VALIDATION`. Route protection and encrypted-storage readiness are reported separately. The page disables Connect and explains the pause. This supersedes earlier activation notes: no repeat sign-in should be requested until hosted callback compatibility is established. No scanner provider substitution has occurred.

A first-hand report from another hosted implementation describes the same error after public HTTPS callback rejection: https://github.com/Simple-With-Us/Socratic-Trade/blob/main/docs/robinhood-connection-guide.md . Robinhood's official onboarding article directs other platforms to contact support: https://robinhood.com/us/en/support/articles/onboarding-an-external-agent/ . Callback rejection is a leading hypothesis, not a confirmed account-specific error: an anonymous authorization-API check returned 401, and no authenticated provider diagnostic is available here. The screenshot alone cannot distinguish callback rejection from another authorization error.

Provider validation should cover the exact callback `https://0dte-options-command-center.h69htk56cq.workers.dev/private/plaid/robinhood/callback`, resource `https://agent.robinhood.com/mcp/trading`, scope `internal`, authorization-code PKCE S256, and read-only personal quote use. Request an approved client/callback or the provider-supported hosted setup. Do not impersonate another platform's client, forward codes from a different redirect, or export the chat connector's tokens. After provider validation, test the real authorization callback and quotes before enabling automatic collection.
