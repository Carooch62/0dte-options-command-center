# Capture explanations and request timing

The capture card now includes the completed/total count for its current horizon. Keep refreshing manually while a window remains open and incomplete. Per-contract countdowns explain the evidence available:

| Explanation | Meaning |
| --- | --- |
| Passing quote captured | The existing timestamp and quote-check criteria passed. |
| Provider timestamp is before the target | A quote arrived during the window, but its provider timestamp was still too early. Refresh again before the deadline. |
| Spread or freshness check failed | A provider timestamp was in the window but its retained quote check failed. |
| No contract quote received | No observation for that contract arrived during the window. This does not establish whether the user tapped refresh; a request may have failed or the contract may have been missing. |
| No usable provider timestamp | Retained observations do not explain a valid timestamp inside the window. Keep it unverified. |

These are display explanations, not new acceptance criteria. The target remains the original first passing receipt plus 5/10/15 minutes. Provider timestamps at the target or target+60 seconds remain inclusive. A later receipt can still carry a qualifying provider timestamp inside the window under the existing policy; a provider timestamp outside it cannot. No clocks restart, no missed observations are invented, no quote checks are weakened, and no automatic requests are added. Historical exports remain evaluable.

Request timing details show existing setup, quote-retrieval, whole-Worker and browser durations, plus whether setup was reused. Unknown durations remain unknown. The intervals overlap and must not be added. Whole-Worker duration includes access verification, connection lookup and normalization in addition to setup and retrieval, but existing exports do not time those residual stages separately. Subtracting browser and Worker durations is not a precise network measurement.

For the cross-session test, preserve the deployed fetching/reuse behavior and use the same collection protocol. A remaining Worker-duration subtotal can guide investigation but cannot identify an authentication, storage or normalization bottleneck by itself. Do not change those paths merely because an unlabelled remainder is large. Private quote exports and their diagnostic analysis stay outside this repository.
