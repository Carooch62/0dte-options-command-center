# EMAT: positive news shadow case

Reviewed October 10, 2026 at 00:23:53 Eastern. Research fixture only; not added to the scanner universe or live review inputs. The controlled SUCCESS input isolates assessment logic and does not establish scanner-feed coverage or option availability.

The October 9 issuer release at 08:40 Eastern raises FY2026 revenue guidance to $10–11 million. The September 10 issuer release independently records the prior $5–8 million range. Midpoints change from $6.5 million to $10.5 million: +$4 million, or 61.54%. The FY2027 range is unchanged. Sources and full rationales are in `tests/fixtures/news-emat-guidance.json`.

Provisional reviewer ratings: materiality 3, surprise 3, credibility 4, novelty 4. Surprise means deviation from prior issuer guidance, not analyst consensus. Direction is favorable for the revenue revision, not a prediction of net stock performance. The company's forecast depends on execution and is not contracted revenue. Source credibility does not establish that management will achieve the forecast.

At the actual review time, the event is about 15.73 hours old. With the experimental six-hour half-life and materiality cap, importance is 0.121840. The shadow allocation is news **41.83%**, patterns **36.17%**, volume 10%, options 7%, risk/reward 5%. The reference allocation remains 40/38/10/7/5. This is a calculation check, not evidence of optimal weights or profitable predictions.

No review is backdated. The event timestamp is the earliest issuer disclosure located; an earlier disclosure would require revising the clock. Recorded output is in `docs/news-emat-shadow-result.json`. Reproduce it by passing the fixture row and its evaluation_at timestamp to news_research.evaluate.

Regression checks verify positive allocation at the recorded review time, input immutability, unchanged ranking/eligibility effects, expiry despite later republication, and withholding when the benchmark score is missing. All 19 news-focused tests passed. Live ranking and production configuration are unchanged.

Next gate: compare floor-preserving allocations on the same research inputs. This case happens to keep patterns above 35%, but the full experimental range does not. Resolve that constraint before any promotion. Broader event sampling and held-out outcomes remain required for empirical calibration.
