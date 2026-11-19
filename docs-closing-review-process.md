# Closing-review evidence rollout

Private server quote capture is automatic for successful manual quote calls and pilot option observations. Quotes are encrypted in the existing owner Durable Object. They are never published to GitHub, sent to Discord as raw prices, or treated as executions. Export today's UTC records from the private brokerage page, or use `/private/plaid/robinhood/evidence?day=YYYY-MM-DD` while authenticated. Each UTC day retains up to 2000 records within 64 KiB; exports disclose omitted records. The most recent 30 captured dates are retained. Export for longer retention.

Manual quote records preserve provider identity and clocks; pilot records additionally bind exact metadata and the source scan. Browser imports, account transactions and user execution evidence are not accepted by this server capture endpoint. Existing private fill imports remain local. Identical receipts are deduplicated and conflicting duplicates fail explicitly. Source quote clocks and receipt times remain separate; no exchange-latency claim is made.

Closing reviews should use the last available same-session scan before the supported comparison time. Provider transaction time stays provisional until user-supplied execution evidence is available. Direction mismatch, unqualified setup, stale scan and absent exact-contract evidence are labelled in review and exports. These labels do not change scanner rankings or grade an untraded contract as a missed winner. Repeat provider transaction IDs are already deduplicated; conflicting identities stay excluded.

Production news records now preserve publication, retrieval and search-check timestamps alongside publisher, URL and coverage status. NOT_SCANNED remains unknown rather than no catalyst. No production selection, scoring weights or notification flags change.

The separate `staging-next-20261117` branch receives a standalone public evidence collector and an optional additional-news coverage probe. The probe records later retrieval times and runtime and never backdates a later headline into an earlier decision. Its extra 50-search budget is explicit; it is not an equal-budget performance comparison. Observe multiple future market sessions before deciding whether rotation or scoring should change. No historical win rate is manufactured from these records.

Verification still required: first authenticated server evidence export after deployment, live option capture tied to a current scan, actual token renewal, and several fresh staging sessions. Existing successful equity fetching does not establish those outcomes. Production Discord signals remain disabled until the separately defined activation checks pass.

Current collection branch, equal-budget experiment and remaining release/live gates:
[staging collection](docs/staging-collection.md), [experiment protocol](docs/research-experiment-plan.md),
[post-close evidence](docs/post-close-evidence.md), [action ledger](docs/action-ledger.md).
Live scan-bound option capture and renewal remain separate outstanding checks. Historical extra-budget
probe instructions above do not describe the new equal-budget switchback.
