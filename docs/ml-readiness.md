# Research readiness audit

Successful scanner workflows refresh `data/ml-readiness.json`. This is a research coverage report, not a signal or model recommendation.

Run `python ml_readiness.py` from the repository root. The JSON report audits retained live and daily archived option observations, deduplicates scan/contract pairs and lists source failures. Retrieval/payload time does not substitute for quote time. Missing theta and spreads remain unknown; older records are not backfilled.

Readiness needs timestamped entry/follow-up coverage across distinct sessions, stable feature definitions and an audited chronological split. Retained signal observations are selected samples; collect candidate controls before testing a general ranking model. Reserve whole sessions and leave a gap for overlapping target horizons. Keep the final test period untouched. A larger arbitrary trade count does not satisfy these requirements.

The next model step is a simple baseline evaluated in shadow mode against existing rules, after these gates are met. Delayed ask-to-bid observations are research targets, not executed P/L; fees and executable fills require separate evidence. Private brokerage data does not belong in this public report.
