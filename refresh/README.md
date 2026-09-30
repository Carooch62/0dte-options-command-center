# Refresh contract

`POST /refresh` takes `{ "scan_mode": "manual", "request_id": "<UUID>" }` and returns HTTP 202 with the same request ID. The Worker dispatches `market-scan.yml` on main. The workflow run title and published `scan_id` contain that ID.

`GET /health?request_id=<UUID>` returns the matching recent workflow run, its status, conclusion, and link. A missing run means the request is not visible in GitHub's recent-run list yet; it does not imply successful publication. The dashboard accepts completion only when the requested scan ID is present in `market-dashboard.json`.

Auto-check only downloads data. A failed run publishes `scan-health.json` while retaining the last validated market snapshot. The GitHub token stays in the Cloudflare secret `GITHUB_TOKEN`.
