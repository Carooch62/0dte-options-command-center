import copy
import unittest
from fixed_composite import fixed_composite
from component_scoring import RUBRIC
from test_component_scoring import fixture
from test_news_research import row as news_row, NOW


def reviewed():
    candidate = fixture()
    candidate.update(news_row())
    candidate['component_reviews']['news']['event_ids'] = ['contract-1']
    for review in candidate['component_reviews'].values():
        for dim in review['dimensions'].values():
            dim['observed_at'] = dim['available_at'] = NOW.isoformat()
    for gate in candidate['eligibility_evidence'].values():
        gate['observed_at'] = gate['available_at'] = NOW.isoformat()
    return candidate


class FixedCompositeTests(unittest.TestCase):
    def test_fixed_math_contributions_and_immutability(self):
        candidate = reviewed()
        for component, rating in zip(RUBRIC, [4, 3, 2, 1, 0]):
            for dim in candidate['component_reviews'][component]['dimensions'].values():
                dim['rating'] = rating
        snapshot = {'as_of': NOW.isoformat(), 'candidates': [candidate]}
        before = copy.deepcopy(snapshot)
        report = fixed_composite(snapshot)
        scored = report['scored'][0]
        self.assertEqual(scored['reference_score'], 75.25)
        self.assertEqual(sum(c['contribution'] for c in scored['reference_components'].values()), 75.25)
        self.assertEqual([c['contribution'] for c in scored['reference_components'].values()], [40,28.5,5,1.75,0])
        self.assertNotIn('adaptive_score', scored)
        self.assertFalse(report['performance_evaluated'])
        self.assertEqual(snapshot, before)

    def test_unknowns_failed_gates_and_late_reviews_withhold_without_redistribution(self):
        for failure in ('dimension', 'gate', 'reviews', 'future'):
            candidate = reviewed()
            if failure == 'dimension':
                candidate['component_reviews']['patterns']['dimensions'].pop('trend_alignment')
            elif failure == 'gate':
                candidate['eligibility_evidence']['risk']['passed'] = False
            elif failure == 'reviews':
                candidate.pop('component_reviews')
                candidate['eligibility_passed'] = True
            else:
                candidate['reviewed_at'] = '2099-01-01T00:00:00Z'
            result = fixed_composite({'as_of': NOW.isoformat(), 'candidates': [candidate]})
            self.assertEqual(result['scored'], [])
            self.assertEqual(len(result['withheld']), 1)
            self.assertEqual(sum(result['weights'].values()), 100)

    def test_ties_and_identity_rejection(self):
        a, b = reviewed(), reviewed()
        b['candidate_id'] = 'another'
        for review in b['component_reviews'].values():
            review['candidate_id'] = 'another'
        report = fixed_composite({'as_of': NOW.isoformat(), 'candidates': [a, b]})
        self.assertEqual([x['reference_rank'] for x in report['scored']], [1,1])
        with self.assertRaises(ValueError):
            fixed_composite({'as_of': NOW.isoformat(), 'candidates': [a,a]})
