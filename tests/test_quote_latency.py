import copy
import unittest
from quote_latency import summarize, summarize_exports


def export():
    return {'format': 'shadow-outcome-input-v1', 'as_of': '2026-10-17T20:00:00Z', 'observations': []}


def observation(day=16, minute=0, contract='T', duration=10):
    stamp = f'2026-10-{day:02d}T18:{minute:02d}:00Z'
    return {'contract_id': contract, 'observed_at': stamp, 'received_at': stamp,
            'request_timing': dict.fromkeys(('setup_ms', 'quote_ms', 'worker_ms', 'browser_ms'), duration)}


class LatencyTests(unittest.TestCase):
    def test_one_sample_per_request_not_per_contract(self):
        d = export()
        d['observations'] = [observation(contract=str(i)) for i in range(20)]
        r = summarize(d)
        self.assertEqual(r['timed_request_count'], 1)
        self.assertFalse(r['collection_minimum_met'])
        self.assertEqual(r['durations_ms']['browser_ms']['samples'], 1)

    def test_two_date_minimum_and_nearest_rank_percentiles(self):
        d = export()
        d['observations'] = [observation(day=16+i//10, minute=i%10, duration=i+1) for i in range(20)]
        r = summarize(d)
        self.assertTrue(r['collection_minimum_met'])
        self.assertEqual(r['durations_ms']['browser_ms'], {'samples': 20, 'p50': 10, 'p95': 19})
        self.assertFalse(r['latency_verified'])

    def test_legacy_exports_do_not_manufacture_timings(self):
        d = export()
        q = observation()
        del q['request_timing']
        d['observations'] = [q]
        r = summarize(d)
        self.assertEqual(r['timed_request_count'], 0)
        self.assertIsNone(r['durations_ms']['browser_ms']['p95'])

    def test_conflicts_or_duplicates_withhold_entire_batch(self):
        for second, status in [(observation(contract='OTHER', duration=11), 'WITHHELD_CONFLICTING_TIMING'),
                               (observation(), 'WITHHELD_DUPLICATE_CONTRACT')]:
            d = export()
            d['observations'] = [observation(), second]
            r = summarize(d)
            self.assertEqual(r['timed_request_count'], 0)
            self.assertEqual(r['batches'][0]['status'], status)

    def test_invalid_numeric_timings_are_withheld(self):
        for bad in [-1, 600001, True, '10', float('nan'), float('inf')]:
            d = export()
            q = observation()
            q['request_timing']['browser_ms'] = bad
            d['observations'] = [q]
            self.assertEqual(summarize(d)['timed_request_count'], 0)

    def test_bad_clocks_and_records_cannot_supply_samples(self):
        d = export()
        q = observation()
        q['observed_at'] = '2026-10-18T18:00:00Z'
        d['observations'] = [q, None, {**observation(), 'received_at': '2026-10-16T18:00:00'}]
        r = summarize(d)
        self.assertEqual(r['excluded_observations'], 3)
        self.assertEqual(r['request_count'], 0)

    def test_private_fields_excluded_and_source_unchanged(self):
        d = export()
        q = observation()
        q['request_timing']['access_token'] = 'secret'
        d['observations'] = [q]
        original = copy.deepcopy(d)
        self.assertNotIn('secret', str(summarize(d)))
        self.assertEqual(d, original)

    def test_malformed_or_unbounded_exports_rejected(self):
        for d in [None, {}, {**export(), 'observations': [observation()]*2001}]:
            with self.assertRaises(ValueError):
                summarize(d)

    def test_multiple_exports_deduplicate_repeated_history(self):
        a, b = export(), export()
        a['observations'] = [observation()]
        b['observations'] = [observation(), observation(day=17)]
        r = summarize_exports([a, b])
        self.assertEqual(r['timed_request_count'], 2)
        self.assertEqual(r['repeated_observations_skipped'], 1)
        self.assertEqual(r['source_export_count'], 2)

    def test_merge_does_not_admit_future_record_from_earlier_export(self):
        a, b = export(), export()
        a['as_of'] = '2026-10-16T18:00:00Z'
        a['observations'] = [observation(day=17)]
        r = summarize_exports([a, b])
        self.assertEqual(r['timed_request_count'], 0)
        self.assertEqual(r['excluded_observations'], 1)

    def test_conflicting_repeat_timings_withheld_across_exports(self):
        a, b = export(), export()
        a['observations'], b['observations'] = [observation()], [observation(duration=11)]
        self.assertEqual(summarize_exports([a, b])['timed_request_count'], 0)

    def test_duplicate_within_source_is_not_hidden_by_export_deduplication(self):
        a = export()
        a['observations'] = [observation(), observation()]
        r = summarize_exports([a])
        self.assertEqual(r['timed_request_count'], 0)
        self.assertEqual(r['repeated_observations_skipped'], 0)
