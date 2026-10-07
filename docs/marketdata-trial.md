# Private Market Data trial evaluation

Verified October 7, 2026 against provider documentation:

- [Starter Trial](https://www.marketdata.app/docs/account/plans/starter-trial/): $0 for 30 days, no credit card, no automatic billing; 10,000 credits/day. Options are **at least 24 hours delayed**, not 15 minutes. Paid Starter is $30 monthly or $144 annually; an annual commitment needs a separate decision.
- [Option quotes](https://www.marketdata.app/docs/api/options/quotes/): `updated` identifies snapshot capture/refresh time. Historical date requests are end-of-day observations and have no historical Greeks.
- [Dates](https://www.marketdata.app/docs/api/dates-and-times/): Unix seconds UTC. A snapshot clock does not establish separate bid/ask event times or an executable entry quote.
- [Authentication](https://www.marketdata.app/docs/api/authentication/): Bearer header; 200 and 203 are success. Single-IP restrictions mean evaluation should use one machine, not rotating GitHub Actions runners.
- [Pricing/license](https://www.marketdata.app/pricing/): internal use. Keep samples off the public dashboard and out of GitHub.

The adapter is deliberately separate from scanning, ranking and ML training. It fetches at most five explicitly named contracts sequentially, without full-chain requests, retries or redirects. It preserves missing Greeks, records actual reception time, validates clocks and bid/ask, and labels every observation as research. Files go only into ignored `private-research/` with owner-only file permissions. Do not manually upload these files to the repository.

## Start without an account

From the repository, with requirements installed:

```sh
python marketdata_research.py --demo AAPL271217C00250000
```

This is the provider's documented unauthenticated AAPL example. On October 7 the successful HTTP 203 demo returned a snapshot dated October 6, 20:00 UTC, with non-null delta and theta. That verifies response shape, not reliability of future authenticated account data.

## Account evaluation

Create a [free Starter Trial account](https://www.marketdata.app/signup/) and request an API token in its dashboard. Keep that token in a private environment variable named `MARKETDATA_TOKEN` on the single evaluation machine; never paste it into chat or commit it. Then run:

```sh
python marketdata_research.py AAPL271217C00250000
python marketdata_research.py --date 2026-10-06 AAPL271217C00250000
```

No account has been connected by committing this adapter. There is no scheduled collection, Worker secret, paid activation, or live scanner integration. First compare returned timestamps, observed age, spreads and missing Greeks across distinct sessions. Preserve collection time so retrospective quotes cannot become supposedly available pre-entry evidence. Trial data cannot establish current 0DTE entry readiness. Next decision: whether authenticated samples are useful enough to justify a private hosted adapter and a separately authorized subscription; provider deployment/IP and license conditions must fit that design first.
