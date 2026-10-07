# Research readiness audit

Successful scanner workflows refresh `data/ml-readiness.json`. This is a research coverage report, not a signal or model recommendation.

Run `python ml_readiness.py` from the repository root. The JSON report audits retained live and daily archived option observations, deduplicates scan/contract pairs and lists source failures. Retrieval/payload time does not substitute for quote time. Missing theta and spreads remain unknown; older records are not backfilled.

Readiness needs timestamped entry/follow-up coverage across distinct sessions, stable feature definitions and an audited chronological split. Retained signal observations are selected samples; collect candidate controls before testing a general ranking model. Reserve whole sessions and leave a gap for overlapping target horizons. Keep the final test period untouched. A larger arbitrary trade count does not satisfy these requirements.

The next model step is a simple baseline evaluated in shadow mode against existing rules, after these gates are met. Delayed ask-to-bid observations are research targets, not executed P/L; fees and executable fills require separate evidence. Private brokerage data does not belong in this public report.

## Quote clock investigation — October 7, 2026

The sampled live Cboe public SPY payload returned theta and `last_trade_time` for contracts, with one payload-level timestamp but no separate bid/ask timestamp. The scanner keeps quote time unknown. Last-trade time, payload time and retrieval time are retained separately and cannot establish quote freshness or execution timing. A source offering a documented Quote Datetime field is needed to close this gap; Cboe DataShop Option Quotes documents that field and optional Greeks (https://datashop.cboe.com/option-quote-intervals). This investigation does not establish access, price or licensing suitability for that product.

Candidate archives now include a bounded contract sample for WATCH/PASS as well as signal candidates: up to three preferred and the first three returned contracts, deduplicated by contract ID. Selection is explicitly filter/provider ordered; it is not an unbiased full-chain control sample. Prospective collection only; historical values remain unknown.
