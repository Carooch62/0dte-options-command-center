import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('private_comparison', Path(__file__).resolve().parents[1] / 'scripts/compare-private-quotes.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def export():
    return {'format': 'shadow-outcome-input-v1', 'as_of': '2026-10-20T15:01:00Z',
            'observations': [{'contract_id': c, 'observed_at': '2026-10-20T15:00:00Z',
                              'received_at': '2026-10-20T15:00:01Z', 'bid': .1, 'ask': .2,
                              'request_timing': dict(setup_ms=400, quote_ms=100, worker_ms=600, browser_ms=800)}
                             for c in ['A', 'B']]}


class ComparisonTests(unittest.TestCase):
    def test_pending_dedup_and_unknown_are_preserved(self):
        result = module.compare([export(), export()], [])
        self.assertIsNone(result['post_release'])
        self.assertEqual(result['status'], 'AWAITING_POST_RELEASE_EXPORT')
        b = result['baseline']
        self.assertEqual(b['timed_request_count'], 1)
        self.assertEqual(b['observation_count'], 2)
        self.assertEqual(b['provider_quote_age_at_receipt_seconds']['p50'], 1)
        self.assertEqual(b['setup_groups']['unknown']['browser_ms']['samples'], 1)
        self.assertIsNone(b['request_attempts']['retained_valid_count'])

    def test_post_group_stays_separate_and_never_auto_passes(self):
        after = export()
        for q in after['observations']:
            q['request_timing'].update(setup_ms=0, browser_ms=300, setup_reused=True)
        result = module.compare([export()], [after])
        self.assertEqual(result['baseline']['durations_ms']['browser_ms']['p50'], 800)
        self.assertEqual(result['post_release']['setup_groups']['reused']['browser_ms']['p50'], 300)
        self.assertFalse(result['improvement_verified'])
        self.assertEqual(result['shared_contract_ids'], ['A', 'B'])

    def test_conflicting_copies_raise_instead_of_choosing_one(self):
        before = export()
        conflicting = copy.deepcopy(before)
        conflicting['observations'][0]['bid'] = .15
        with self.assertRaises(ValueError):
            module.compare([before, conflicting], [])
