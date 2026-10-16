import unittest
from news_allocation_research import compare, POLICIES, report


class AllocationResearchTests(unittest.TestCase):
    def test_full_range_preserves_floor_priority_budget_and_monotonicity(self):
        previous = {name: 40 for name in POLICIES}
        for n in range(10001):
            for name, weights in compare({'status': 'ASSESSED', 'importance': n/10000}).items():
                self.assertAlmostEqual(sum(weights.values()), 100)
                self.assertGreater(weights['patterns'], 35)
                self.assertGreater(weights['news'], weights['patterns'])
                self.assertGreater(weights['patterns'], weights['volume'])
                self.assertEqual([weights[k] for k in ('volume','options','risk_reward')], [10,7,5])
                self.assertGreaterEqual(weights['news'], previous[name])
                previous[name] = weights['news']

    def test_unknown_does_not_become_zero_or_reference_proposal(self):
        for status in ('NEEDS_REVIEW','COVERAGE_UNKNOWN','NO_CURRENT_MATERIAL_EVENT'):
            self.assertTrue(all(v is None for v in compare({'status': status}).values()))
        for value in (None, True, -1, 1.1, float('nan'), float('inf')):
            with self.assertRaises(ValueError):
                compare({'status':'ASSESSED','importance':value})

    def test_real_case_and_saturation_tradeoff(self):
        real = report()['real_case']
        self.assertEqual(real['alternatives']['linear_2_5']['news'], 40.30)
        self.assertEqual(real['alternatives']['capped_original']['news'], real['original']['news'])
        low = compare({'status':'ASSESSED','importance':.25})
        high = compare({'status':'ASSESSED','importance':1})
        self.assertEqual(low['capped_original'], high['capped_original'])
        self.assertLess(low['linear_2_5']['news'], high['linear_2_5']['news'])
