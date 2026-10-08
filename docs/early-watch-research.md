# Early Watch v1 — shadow research

Adapted from publicly documented scanner concepts, not Breakaway code or market data.
This feature does not alter scores, ordering, execution states, contract gates or alerts.
The proposed 40/38 catalyst/pattern weighting is not activated by this change.

Uses the latest 12 completed five-minute bars in the current session. The latest six
bars' average high-low range must be at most 65% of the previous six, and average
volume at most 75%. Last three lows must rise for UP or highs fall for DOWN.
Price must remain before, and within 0.5% of, the previous five-bar high/low.
Requires a current session, fresh bars, company-specific catalyst and a setup not
already qualified by existing momentum rules. Invalid/insufficient histories remain
unknown. These are unvalidated hypotheses, not predictive performance claims.

The dashboard shows a separate EARLY WATCH research bucket and a per-card
Pass/Fail/Unknown checklist. Pattern and daily-trend checks are context, not new
mandatory entry gates. The volume check remains the existing local burst/acceleration
test, not historical same-time RVOL. Snapshot history preserves pattern inputs and
flags for later chronological shadow evaluation. No extra data provider or cost.

Next: evaluate alert/control cohorts over distinct sessions without hindsight,
implement same-time RVOL with sufficient historical intraday coverage, then consider
any ranking changes separately. Never infer option profitability from stock returns.
