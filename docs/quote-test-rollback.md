# Quote test rollback record

Prepared October 20, 2026. This records recovery steps; it does not roll anything back or change credentials.

## Known code checkpoints

| Change | Reviewed commit | Scope |
| --- | --- | --- |
| PR 88 quality fixes | `8daa9596f27d9fe342421867f25a62dd2e183afd` | Qualification, health, evidence retention and failure handling |
| PR 89 dashboard delivery | `a43cfd698b57acfe87b2dcbe32ae3e8c7a62b691` | Smaller initial same-day snapshot and on-demand later expirations |
| PR 90 connection bootstrap | `d6c129b16943f591bbe8a1f16b2fa4dfc19da772` | Bounded metadata retries; uncertain metadata cannot disable the connection |
| PR 85 session reuse | `c69dbd78c8325803e7695ff5274e59f53b8a5535` | Read-only negotiated session reuse; no quote-price cache |

The audited repository/data checkpoint is `a461414abd508f73f38da3b6ee708136439cce7f`. Code and generated scan commits have different purposes. Preserve current source data, scan timestamps and private evidence during code recovery.

## Select the smallest recovery

1. Export the affected private quote session and record the failing URL, scan ID, operation, time and release. Preserve failed/unknown states. Never place private exports, credentials or screenshots containing private data in the public repository.
2. If the dashboard fails only on the compact snapshot path, prepare a revert of **PR 89** in an isolated branch from current `main`. Revert its source/assets/generation changes together. The full original `data/market-dashboard.json` is retained; do not overwrite it with an older snapshot. Keep PR 88 and PR 90 fixes.
3. If only private session reuse fails, first retry an explicit manual refresh; a failed cached session is evicted. If reproducible, prepare a targeted revert of **PR 85**, resolving later diagnostics changes so PR 88's strict validation/export behavior remains intact. Initialization on every manual request is the fallback. Do not weaken token separation or authorization checks to recover speed.
4. For bootstrap failures, inspect deployment prerequisite names and Access protection, with secret values redacted. Keep **PR 90's preserve-on-uncertainty behavior**. Repair missing prerequisites through the existing protected setup workflow. Do not revert to the earlier script that wrote `false` after one incomplete metadata response. Do not expose or rotate credentials as a generic troubleshooting step.

Use a normal reviewed revert commit/PR. Never force-reset `main`, replay an old data tree, or roll back all releases together without isolating the failure. Conflicts with later commits need deliberate resolution and review.

## Validate and restore

Run Python/JavaScript tests, build browser assets, run the relevant mobile checks and credential-free Worker dry run. Inspect the diff for retained clocks, full snapshot availability, protected private routes and absence of credential/private data changes. Merge the reviewed fix and verify the relevant deployment workflows finish successfully.

For a dashboard recovery, confirm Pages serves the intended source and same-day/later-expiry selections render correctly. For a Worker recovery, confirm the deployment log reports prerequisites ready, all private Access routes protected and no missing binding names. A readiness flag is configuration evidence; one signed-in manual live quote request must still verify the connection. Confirm exports retain original clocks and explicit unknown/failure states.

Record the actual recovery commit and successful workflow IDs after any recovery. Do not invent a Cloudflare version ID or claim restoring a code commit alone restores secret state. No rollback was required for this preparation.
