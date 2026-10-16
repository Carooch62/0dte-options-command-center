# Floor-preserving adaptive allocation comparison

Offline research, October 10, 2026. No scanner, dashboard, or production configuration changes. Run `python news_allocation_research.py` to reproduce the accompanying JSON using the dated EMAT review, not the current clock.

News and patterns share 78 percentage points while volume/options/risk remain 10/7/5. Therefore keeping patterns strictly above 35% requires news strictly below 43%. Use a 35.5% pattern minimum as an explicit research design choice, not an optimized parameter.

| Alternative | Formula for news, importance i in [0,1] | News range | Pattern range | Dated EMAT news/patterns |
|---|---|---|---|---|
| Linear 2 | 40 + 2i | 40–42 | 38–36 | 40.24 / 37.76 |
| Linear 2.5 | 40 + 2.5i | 40–42.5 | 38–35.5 | 40.30 / 37.70 |
| Capped original | 40 + min(15i, 2.5) | 40–42.5 | 38–35.5 | 41.83 / 36.17 |

Recommendation for the next shadow candidate: **Linear 2.5**. It preserves the stated priority and floor while retaining graded responses across the importance range. Capping the old formula preserves its initial sensitivity but saturates at importance 1/6: moderate and extreme importance then receive identical allocations. Linear 2 is also compliant, with less allocation movement. These are design comparisons, not evidence that one predicts returns better.

Because the floor leaves less than three percentage points to move from the reference allocation, strong adaptivity cannot come solely from redistributing these weights. A future composite model must distinguish the news component's evidence-based score from its coefficient. Do not lower the pattern floor or take weight from other categories without separately evaluating that design.

The original formula is retained only as a dated comparison. The gradual alternative is now integrated in shadow version 2; no alternative is selected for live rankings. Unknown or incomplete assessments produce null proposals, not automatic reference allocations. The EMAT review remains a single provisional rating against prior issuer guidance, not analyst consensus or a backtest.

Validation: 22 news-focused tests passed. Sweep checks cover 10,001 importance values per alternative for budget, strict pattern floor, priority and monotonicity; other checks cover abstention, invalid inputs, the recorded real case and saturation. No claims about profitability, normalized category scores, execution quality or option eligibility follow from this comparison.
