# Secure Refresh Endpoint

The GitHub Pages dashboard must never contain a GitHub token. This directory documents the external serverless endpoint used by the Refresh Now button.

## Contract

`POST /refresh`

The endpoint should authenticate the caller as appropriate for the deployment, then invoke the repository's `market-scan.yml` workflow using GitHub's workflow-dispatch API.

Required GitHub API operation:

`POST /repos/Carooch62/0dte-options-command-center/actions/workflows/market-scan.yml/dispatches`

Request body:

```json
{"ref":"main","inputs":{"scan_mode":"manual"}}
```

The GitHub credential must be stored as a server-side secret (for example `GITHUB_TOKEN`), never in `index.html` or client-side JavaScript.

The endpoint should return a short JSON response such as:

```json
{"ok":true,"status":"scan_requested"}
```

The dashboard should then poll `data/market.json` and wait for `generated_at` to change.
