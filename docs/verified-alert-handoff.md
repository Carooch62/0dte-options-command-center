# Verified option alert handoff — current status, November 18, 2026

The hosted quote pilot is enabled; verified Discord signal delivery remains disabled.
`ROBINHOOD_UNATTENDED_CONFIRMED=true`, `WATCH_QUOTE_PILOT_ENABLED=true`,
`WATCH_VERIFIED_ALERTS_ENABLED=false`, `ROBINHOOD_FILL_LOOKUP_ENABLED=false` and
`FAST_SCAN_ENABLED=false`. Inspect authenticated readiness/status for current
configuration; these declarations do not prove successful live operation.

The configured personal MCP workflow supports unattended collection without a
separate market-data subscription. Hosted OAuth redirect/client verification is
a separate account-specific prerequisite. Rotating refresh tokens must persist;
actual renewal followed by an authenticated option quote still needs live proof.

A specific option-contract deep link is unsupported. The implementation uses
supported general Robinhood navigation and exact ticker/expiry/strike/side manual
selection. Missing deep links are no longer an activation blocker. Never invent
an instrument URL. Discord receives contract identity and derived setup summaries,
without raw provider prices or Greeks under the current personal-use decision.

Before activation require: fresh OPEN-session scan, exact instrument metadata,
valid source clocks, live ask <= $0.30, signed delta, spread, volume and existing
setup gates; then prove renewal, successful delivery, unchanged-scan suppression,
failure/retry handling and the owner's destination. A TEST ONLY webhook receipt
and an equity export do not satisfy these checks. Do not manufacture a qualifying
candidate to force a send. Ambiguous webhook timeout can duplicate delivery;
Discord has no application idempotency key, so do not claim exactly-once delivery.

## Owner controls

Use `/private/watch/setup` for encrypted webhook status/management, TEST ONLY
messages and a manual quote pilot. `/private/watch/readiness` reports non-secret
requirements. Webhook secrets are never returned or published. The scheduled
quote pilot uses the existing five-minute tick and separate serialized coordinator;
the legacy delayed-research saved-watch monitor is a separate notification path.
Verify saved-contract synchronization independently and avoid duplicate active
notification paths. Do not send an unsolicited test from maintenance work.

Full activation/rollback: [Robinhood monitor rollout](../ROBINHOOD_MONITOR_ROLLOUT.md).
The current backlog and live-evidence gates are in [action ledger](action-ledger.md).
