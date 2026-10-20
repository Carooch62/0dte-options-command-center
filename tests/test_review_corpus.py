"""Synthetic intake checks; these fixtures are not historical validation evidence."""
import copy
import unittest
from component_scoring import RUBRIC
from review_corpus import audit_corpus

NOW = '2026-10-14T15:00:00+00:00'


def record(reviewer='reviewer-a'):
    evidence = {'observed_at': NOW, 'available_at': NOW, 'source': 'synthetic', 'evidence': 'Synthetic intake test'}
    return {'session': 'synthetic-session', 'as_of': NOW, 'reviewed_at': NOW,
            'reviewer_id': reviewer, 'evidence_set_id': 'synthetic-v1', 'candidate_id': 'TEST',
            'eligibility_evidence': {k: {**evidence, 'passed': True, 'policy_version': 'synthetic'} for k in ('liquidity', 'risk')},
            'component_reviews': {k: {'candidate_id': 'TEST', 'dimensions': {d: {**evidence, 'rating': 2} for d in dims}} for k, dims in RUBRIC.items()}}


class ReviewCorpusTests(unittest.TestCase):
    def test_complete_pair_and_immutable_input(self):
        rows = [record(), record('reviewer-b')]
        rows[1]['component_reviews']['news']['dimensions']['novelty']['rating'] = 4
        before = copy.deepcopy(rows)
        result = audit_corpus({'records': rows})
        self.assertEqual(result['rubric_complete'], 2)
        self.assertEqual(result['reviewer_comparisons'][0]['maximum_rating_gap'], 2)
        self.assertEqual(result['reviewer_comparisons'][0]['dimensions'], 16)
        self.assertEqual(rows, before)

    def test_changed_evidence_or_time_is_not_comparable(self):
        for change in ('evidence', 'as_of', 'evidence_set_id'):
            rows = [record(), record('reviewer-b')]
            if change == 'evidence':
                rows[1]['component_reviews']['news']['dimensions']['novelty']['evidence'] = 'Different frozen evidence'
            elif change == 'as_of':
                rows[1]['as_of'] = '2026-10-14T15:00:01+00:00'
            else:
                rows[1]['evidence_set_id'] = 'different'
            self.assertEqual(audit_corpus({'records': rows})['reviewer_comparisons'], [])

    def test_duplicate_reviewer_with_equivalent_timestamp_is_withheld(self):
        rows = [record(), record()]
        rows[1]['as_of'] = '2026-10-14T11:00:00-04:00'
        result = audit_corpus({'records': rows})
        self.assertEqual(result['rubric_complete'], 0)
        self.assertTrue(all('DUPLICATE_REVIEW' in row['reasons'] for row in result['reviews']))

    def test_missing_future_and_unverified_evidence(self):
        for kind in ('missing', 'future', 'gate', 'review_time'):
            row = record()
            if kind == 'missing':
                row['component_reviews']['news']['dimensions']['novelty'].pop('evidence')
            elif kind == 'future':
                row['component_reviews']['news']['dimensions']['novelty']['available_at'] = '2026-10-14T15:00:01+00:00'
            elif kind == 'gate':
                row['eligibility_evidence']['risk']['passed'] = False
            else:
                row['reviewed_at'] = '2026-10-14T14:59:59+00:00'
            self.assertEqual(audit_corpus({'records': [row]})['rubric_complete'], 0)

    def test_empty_and_malformed_records_reconcile(self):
        self.assertEqual(audit_corpus({'records': []})['rubric_complete'], 0)
        result = audit_corpus({'records': [None, {}]})
        self.assertEqual(result['sessions']['UNLABELED']['withheld'], 2)
        with self.assertRaises(ValueError):
            audit_corpus({'records': {}})
