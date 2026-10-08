# Same-time relative volume — shadow v1

The existing `volume_ratio` remains a local intraday burst measure. This upgrade
adds a separate `relative_volume_research` observation without changing scores,
rankings, setup qualification, EARLY WATCH, contract selection, or entry gates.

## Definition

Latest completed regular-session five-minute volume divided by the mean volume
of the same Eastern-clock five-minute slot on the preceding four exchange
sessions. At least three valid, distinct sessions are required. The existing
five-day chart response is reused: no extra requests or paid provider needed.
Some responses will contain too little history; that is unknown, not zero.
This is **bar RVOL**, not cumulative session RVOL or local burst/acceleration.

## Safeguards and limitations

- Only current regular-session completed bars, no more than eight minutes old.
- Prior sessions selected using the exchange calendar; holidays, weekends,
  early closes and DST are handled by regular-session boundaries and ET slots.
- Missing, duplicate, interpolated, off-grid or invalid-volume observations
  are excluded. Missing bars are not filled with zero. A genuine zero-volume
  bar is retained; a zero mean denominator produces unknown.
- Current and baseline observations come from one provider response; no mixing
  Yahoo and fallback-feed volume (IEX volume is not consolidated SIP volume).
- Dates, count, slot, numerator, denominator, provider and timestamps travel
  with each row and are saved in candidate history for later evaluation.
- UI displays OBSERVED, never PASS, for a usable value. Stale values and failed
  downloads display UNKNOWN. Older scans have no fabricated RVOL observations.
- Three or four sessions is a small, event-sensitive baseline. Corporate actions,
  provider revisions, coverage changes and unusual prior days can distort it.
  No threshold is validated and no strategy edge or live quotes are implied.

Next: evaluate timestamped observations chronologically against matched controls
and fresh option bid/ask outcomes before considering longer history or gates.
