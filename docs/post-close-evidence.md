# Separate final delayed-bar capture

The final delayed-bar research workflow attempts capture after regular and early
closes in both DST offsets. `closing_capture.py` admits only today's actual XNYS
close plus 20–65 minutes. Holidays, an absent same-session source cohort, and
out-of-window manual runs do not fetch. A scheduled attempt does not guarantee
that the provider has returned a final bar.

Evidence is written only to `data/closing-evidence/DATE.json`. It never replaces
market-dashboard, scan history, candidate batches or pre-entry decision records.
The latest recorded intraday cohort is fixed as its universe, recovered from
retained scan history if a manual after-hours dashboard has replaced it. Each row must have a completed
bar ending exactly at the official close; older bars stay FINAL_BAR_MISSING and
source failures remain explicit. Original source clocks and post-close receipt
time are separate. No option profit, current executable price or fill is inferred.

Same-quarter-hour retries are idempotent. A fully complete capture stops further
fetches for that day; later incomplete retries archive the prior attempt before
updating the day's latest evidence. The workflow has no brokerage/Alpaca secrets.

The earlier audit overstated normal pipeline behavior: AFTER HOURS manual runs
can scan; CLOSED runs retain the snapshot. This dedicated capture solves missing
scheduled final-bar collection and clear separation, rather than enabling a
previously impossible manual after-hours scan.

Closing reviews should state their cutoff, consult this evidence when available,
and add a follow-up only for material new evidence. It cannot be used as an input
that was known before a user's entry. Verify a real normal and early-close capture
before describing final-session collection as validated.
