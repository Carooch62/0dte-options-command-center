"""Synthetic evidence-integrity regressions; no market performance claims."""
import copy
import unittest
from datetime import timedelta
from news_research import evaluate, COVERAGE_MAX_AGE_SECONDS
from shadow_replay import replay
from fixed_release_fixtures import row, event, NOW
from test_component_scoring import fixture


def reviewed_candidate():
    candidate = fixture()
    candidate.update(row())
    candidate['component_reviews']['news']['event_ids'] = ['contract-1']
    for review in candidate['component_reviews'].values():
        for dimension in review['dimensions'].values():
            dimension['observed_at'] = dimension['available_at'] = NOW.isoformat()
    for gate in candidate['eligibility_evidence'].values():
        gate['observed_at'] = gate['available_at'] = NOW.isoformat()
    return candidate


def run(candidate):
    return replay({'as_of': NOW.isoformat(), 'candidates': [candidate]})


class CatalystIntegrityTests(unittest.TestCase):
    def test_unknown_and_future_collection_clocks_withhold(self):
        for checked in (None, '', '2026-10-08T15:00:00', (NOW + timedelta(seconds=1)).isoformat()):
            result = evaluate(row(news_checked_at=checked), NOW)
            self.assertEqual(result['status'], 'COVERAGE_UNKNOWN')
            self.assertIsNone(result['proposed_weights'])

    def test_freshness_boundary_and_event_age_are_separate(self):
        limit = COVERAGE_MAX_AGE_SECONDS['INTRADAY']
        for age, expected in ((limit - .001, 'ASSESSED'), (limit, 'COVERAGE_STALE'), (limit + 1, 'COVERAGE_STALE')):
            self.assertEqual(evaluate(row(news_checked_at=(NOW-timedelta(seconds=age)).isoformat()), NOW)['status'], expected)
        # A fresh fetch cannot renew an old catalyst.
        self.assertEqual(evaluate(row([event(event_at=(NOW-timedelta(hours=24)).isoformat())]), NOW)['status'], 'NO_CURRENT_MATERIAL_EVENT')

    def test_empty_stale_fetch_does_not_claim_absence(self):
        result = evaluate(row([], news_items=[], news_checked_at=(NOW-timedelta(hours=1)).isoformat()), NOW)
        self.assertEqual(result['status'], 'COVERAGE_STALE')
        current = evaluate(row([], news_items=[]), NOW)
        self.assertEqual(current['status'], 'NO_REPORTED_NEWS')

    def test_multiday_uses_explicit_separate_coverage_limit(self):
        r = row([event(horizon='MULTIDAY')], news_checked_at=(NOW-timedelta(minutes=30)).isoformat())
        self.assertEqual(evaluate(r, NOW, 'MULTIDAY')['status'], 'ASSESSED')
        r['news_checked_at'] = (NOW-timedelta(hours=1)).isoformat()
        self.assertEqual(evaluate(r, NOW, 'MULTIDAY')['status'], 'COVERAGE_STALE')

    def test_invalid_duplicate_cannot_be_hidden_in_either_order(self):
        for kind in ('blocker', 'future', 'missing', 'malformed'):
            bad = event()
            if kind == 'blocker': bad['review_blockers'] = ['Unverified benchmark']
            if kind == 'future': bad['reviewed_at'] = (NOW+timedelta(seconds=1)).isoformat()
            if kind == 'missing': bad['evidence']['surprise'] = ''
            if kind == 'malformed': bad = None
            for events in ([event(), bad], [bad, event()]):
                result = evaluate(row(events), NOW)
                self.assertEqual(result['status'], 'NEEDS_REVIEW')
                self.assertIsNone(result['proposed_weights'])

    def test_conflicting_explanations_require_reconciliation(self):
        bad = event()
        bad['evidence']['surprise'] = 'Different contemporaneous benchmark'
        self.assertEqual(evaluate(row([event(), bad]), NOW)['status'], 'CONFLICTING_REVIEWS')

    def test_event_links_must_identify_assessed_events(self):
        for links, reason in ((None, 'EVENT_LINKS_REQUIRED'), ([], 'EVENT_LINKS_REQUIRED'),
                              (['contract-1', 'contract-1'], 'EVENT_LINKS_REQUIRED'),
                              ([{}], 'EVENT_LINKS_REQUIRED'), (['missing'], 'LINKED_EVENT_NOT_ASSESSED')):
            candidate = reviewed_candidate()
            candidate['component_reviews']['news']['event_ids'] = links
            result = run(candidate)
            self.assertEqual(result['scored'], [])
            self.assertIn('NEWS:'+reason, result['withheld'][0]['reasons'])

    def test_score_cannot_precede_its_event_review(self):
        candidate = reviewed_candidate()
        for dimension in candidate['component_reviews']['news']['dimensions'].values():
            dimension['observed_at'] = dimension['available_at'] = (NOW-timedelta(seconds=1)).isoformat()
        self.assertIn('NEWS:SCORE_PRECEDES_EVENT_REVIEW', run(candidate)['withheld'][0]['reasons'])

    def test_valid_links_are_exported_and_input_is_immutable(self):
        candidate = reviewed_candidate()
        before = copy.deepcopy(candidate)
        result = run(candidate)
        self.assertEqual(result['scored'][0]['news_event_ids'], ['contract-1'])
        self.assertEqual(result['scored'][0]['news_directional_support'], 'ALIGNED')
        self.assertEqual(candidate, before)
        candidate['component_reviews'] = None
        self.assertEqual(run(candidate)['scored'], [])


if __name__ == '__main__':
    unittest.main()
