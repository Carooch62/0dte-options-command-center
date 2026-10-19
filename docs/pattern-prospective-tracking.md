# Capture-time pattern tracking

Each newly captured staging evidence packet now contains `pattern_observations` for every received stock, independently of the selected $0.30 option batch. Fields are allowlisted: ticker, lifecycle method/status, preserved baseline direction/forming/early-watch flags and bounded lifecycle episode fields. Accounts, holdings and credentials are excluded. Stocks with missing, stale or invalid pattern data remain in coverage counts; missing stocks are not synthesized.

The existing validated-scan capture step writes `data/pattern-prospective.json`. This runs when the staging pipeline captures a new scan; it does not create a timer, increase scan frequency or start private quote polling. Repeating the same scan is idempotent. Existing archived packets remain unchanged; missing tracking data is not reconstructed from their stock bars.

## Two different time bases

Episode `formed_at`, `confirmed_at`, `retested_at` and `ended_at` remain completed-bar reconstruction times. Ledger `first_observed_at`, `observed_forming_at`, `observed_confirmation_at`, `last_observed_at` and each transition's `observed_at` use original packet capture times. They identify the earliest observation in the supplied retained packet set, not the earliest possible detection, network latency or independently authenticated availability. No packet may be captured after the requested report cutoff; all episode clocks must already exist by its scan generation time.

An episode first seen INVALIDATED, EXPIRED or CONFIRMED is recorded in that state. Its bar-end history cannot manufacture earlier observed formation or confirmation. The summary counts a forming-then-confirmation observation only when separate retained captures actually show FORMING followed later by CONFIRMED. Terminal observations that carry a historical confirmation timestamp do not count as having observed that confirmation state.

## Identity, changes and gaps

Key episodes by ticker, lifecycle method and direction/formation-time episode ID. Frozen trigger, structural invalidation and formation volume must remain identical. Regressed states, changed known event times, duplicate episodes and contradictory observations at the same capture time withhold the episode from summary counts. Conflicting copies of the same packet ID exclude both copies. Identical repeated packets are deduplicated. Repeated identical states update last-seen metadata without inflating the transition list; a newly observed retest is retained.

A missing scan, absent ticker, invalid history or disappearing episode never implies expiry, invalidation or NO_SETUP. Evidence gaps and coverage counts stay visible. Baseline flags count stock-capture observations and preserve their original stock direction; they are not independently paired UP/DOWN trades. Neither repeated scans nor multiple contracts for a ticker create independent outcome samples.

The report uses the evidence capture step's rolling archive inputs. First observation means first in that retained window; older archived source packets remain available for an explicitly broader offline report. Retention changes must not be presented as a newly observed setup.

## Offline reproduction

`python pattern_tracking.py PACKET.json MORE_PACKETS.json --as-of 2026-10-19T19:00:00Z`

Use the original packets and their clocks. The report contains no return estimates, execution claims, predictive accuracy or automatic threshold tuning. Production ranking/eligibility remain unchanged. Prospective observations establish an audit trail; outcome linkage, source coverage checks and chronological holdout sessions are still required before changing scores or asserting improvement.
