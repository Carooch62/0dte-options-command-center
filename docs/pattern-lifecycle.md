# Completed-bar pattern lifecycle, v1

The current v1 detector already measures range compression, quiet volume, directional structure and proximity to a level. This addition preserves that detector and records what happens after a qualifying formation. It is nested at `pattern_research.lifecycle`, retained in research snapshots and shadow evidence. It does not change scanner scores, eligibility, original trigger/invalidation fields, catalyst checks, the existing early-watch flag or execution states.

## Provisional rules

Run both UP and DOWN hypotheses independently over chronological prefixes; never apply the final bar's direction retrospectively. Formation requires 12 consecutive completed five-minute bars. Use the original thresholds: recent-six/prior-six mean range <= 0.65, mean volume <= 0.75, rising lows or falling highs across the last three bars, and a close within 0.5% on the unbroken side of the prior-five-bar trigger.

On formation, freeze that trigger, the recent-six-bar opposite extreme as structural invalidation, and recent-six mean volume. Subsequent bars cannot move these levels. A later completed close strictly beyond the trigger with volume >= 1.2 times frozen formation mean volume confirms the setup. The confirmation is a technical hypothesis, not a catalyst/contract check or entry authorization.

Any subsequent touch of structural invalidation invalidates the setup. A bar crossing both trigger and invalidation is conservatively INVALIDATED with BOTH_LEVELS_TOUCHED; OHLC does not reveal intrabar order. After confirmation, a close back inside or on the trigger invalidates with BREAKOUT_CLOSED_BACK_INSIDE. A later bar touching the trigger and closing beyond it records a held retest. The formation is valid through six subsequent bars; the following bar expires it. Invalidation takes precedence over confirmation or expiry. A fresh formation may start on a later bar after an episode ends.

Output states are FORMING, CONFIRMED, INVALIDATED, EXPIRED and NO_SETUP. Episode records retain original formation, confirmation, retest and end clocks plus frozen levels. Completed 15/30-minute close changes supply ALIGNED/AGAINST/MIXED context only; they are not independent trend confirmation or score inputs. Existing daily trend context remains separate.

## Data and timing boundaries

Only numeric finite HLC/volume values are accepted; volume must be positive. Reject missing/naive timestamps, duplicate/out-of-order/gapped bars, interpolated data, mixed local dates and more than 78 bars. Bar starts must align to five minutes in the 09:30–16:00 New York window. The scanner separately uses the exchange calendar; this helper's time-of-day check alone does not verify holidays or early closes. No interpolation, sorting, skipped invalid completed bars or cross-session carry is used. An incomplete/future bar is excluded before its prices or volume are read. History more than eight minutes behind the cutoff is withheld.

`formed_at`, `confirmed_at`, `retested_at` and `ended_at` are reconstructed bar-end times, not authenticated first-live detection times. Output explicitly marks COMPLETED_BAR_RECONSTRUCTION and availability_verified false. Delayed source bars may only have arrived later; this module cannot establish availability or exchange-to-screen latency. Prospective frozen scan packets are needed to compare actual detection timing. No return, execution or improvement claim follows from a pattern label.

## Comparison and validation

`python pattern_lifecycle.py INPUT.json` accepts `research_bars` plus timezone-aware `as_of`, and prints a prefix timeline for the preserved detector and the new lifecycle. Scanner output omits that verbose timeline but retains episodes, latest states and comparison counts. Prefix counts are overlapping observations, not independent samples or trades.

Synthetic tests cover symmetric calls/puts, frozen levels, completed-close and volume requirements, retests, failed breakouts, ambiguous bars, expiry, chronology, stale data, cutoff invariance, immutable inputs and unchanged scanner outputs.

The saved staging packet `13ae06276863857c513d979a223c42174d9c10131bab3c836924582d2e441b67`, captured 2026-10-19T14:56:35.560949Z, contains seven distinct tickers among eleven candidates. At that cutoff, all seven histories were usable: 42 evaluated prefixes, two baseline forming observations, two latest FORMING states and zero confirmed episodes. Duplicate contracts for the same ticker were counted once. This descriptive check does not show earlier detection or predictive value. Capture further sessions and retain invalidated, expired and no-setup cases before outcome comparisons or score changes.
