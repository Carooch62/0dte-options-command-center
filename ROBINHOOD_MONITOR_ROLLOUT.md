# Robinhood monitor rollout

Support case 022550842 confirms unattended MCP use without separate approval or a market-data subscription. Custom OAuth redirect approval remains account-specific. Refresh tokens rotate on each successful renewal. No numeric rate limit or supported option-contract deep link was provided.

## Implementation

- `ROBINHOOD_COORDINATOR` stores AES-GCM encrypted authorization in a Durable Object. Credential reads, callback saves, disconnects and refreshes serialize through the owner object. Legacy KV credentials migrate on first use; old authorizations have no saved refresh token and require one reconnect.
- Renewal starts two minutes before expiry. Replacement refresh tokens persist before new access is returned. Ambiguous renewal failures require reconnect instead of reusing a possibly consumed token; HTTP 429 persists a cooldown.
- The pilot uses a separate named object. Overlapping ticks share one execution. Scan checkpoints and successful delivery markers use strongly consistent storage. A delivery timeout can still be ambiguous; Discord webhooks offer no application idempotency key.
- Exact identity, current open-session scan, quote age, ask <= $0.30, spread, delta and volume checks remain mandatory. Missing contract links use the Robinhood home page with explicit manual-selection instructions.
- Discord receives contract identity and derived setup information only. Raw provider prices and Greeks are excluded. This is an implementation choice, not a claim that support approved Discord distribution.

## Activation and live verification

1. Deploy the Durable Object migration and code through the existing Worker deployment workflow. Preserve Access protection, encryption secrets and the registered redirect configuration.
2. Confirm `ROBINHOOD_CONNECTION_ENABLED=true`, `ROBINHOOD_UNATTENDED_CONFIRMED=true`, `WATCH_QUOTE_PILOT_ENABLED=true`. Keep `WATCH_VERIFIED_ALERTS_ENABLED=false` for quote-only checks.
3. Sign in through the private brokerage page and reconnect once to obtain a saved refresh token. The ChatGPT Robinhood connection does not provide credentials to this hosted client.
4. Inspect authenticated `/private/watch/readiness` and `/private/plaid/robinhood/status`. Readiness describes configuration, not proof of live quote latency or successful renewal.
5. During a regular market session with a recent triggered candidate, POST `/private/watch/pilot` from the same origin with `X-Requested-With: ContractWatch`. It uses the same coordinator as scheduled checks. Inspect counts and freshness without logging credentials or quote bodies.
6. Verify renewal across actual access expiry, then enable `WATCH_VERIFIED_ALERTS_ENABLED=true` and verify a qualifying signal reaches the owner's private Discord destination. Successful sends checkpoint only after Discord acknowledges them.
7. Inspect repeated cron results and unchanged-scan suppression. Do not describe the monitor as live until these checks pass. The existing scan coordinator continues to prevent overlapping scanner dispatches; the quote pilot runs on the existing five-minute watch tick.

Rollback: disable `WATCH_QUOTE_PILOT_ENABLED` and `WATCH_VERIFIED_ALERTS_ENABLED`. Retain the Durable Object class, binding and migration so encrypted state is preserved. Disconnect in the private UI and revoke the client in Robinhood to remove provider access.
