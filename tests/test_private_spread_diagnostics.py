import copy
import importlib.util
from pathlib import Path
import unittest

from test_candidate_batch_audit import fixtures

spec = importlib.util.spec_from_file_location('spread_diagnostics', Path(__file__).resolve().parents[1] / 'scripts/diagnose-private-spreads.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def inputs():
    source, batch = fixtures()
    o = source['candidates'][0]['expiry_groups']['week']['options'][0]
    o.update(source='Delayed research', option_timestamp=None, payload_timestamp='2026-10-20T15:00:00Z',
             timestamp_basis='PAYLOAD_TIME_NOT_QUOTE_TIME', minimum_delay_minutes=15)
    export = dict(format='shadow-outcome-input-v1', as_of='2026-10-20T15:02:00Z',
                  scanner_context=dict(scan_id='fixture', generated_at=source['generated_at']),
                  observations=[dict(contract_id=o['contract_id'], bid=.01, ask=.41,
                                     observed_at='2026-10-20T15:01:00Z', received_at='2026-10-20T15:01:01Z',
                                     quote_check='REQUIRES_RECHECK', quote_check_reasons=['WIDE_SPREAD'])])
    return source, batch, export


class SpreadDiagnosticsTests(unittest.TestCase):
    def test_source_and_live_are_separate_and_missing_quote_time_stays_unknown(self):
        args = inputs()
        original = copy.deepcopy(args)
        report = module.diagnose(*args)
        row = report['contracts'][0]
        self.assertEqual(report['source_batch_audit'], 'PASS')
        self.assertEqual(row['research']['status'], 'SPREAD_PASSED')
        self.assertEqual(row['research']['quote_time_status'], 'UNKNOWN')
        self.assertEqual(row['computed_book_checks'], {'WIDE_SPREAD': 1})
        self.assertEqual(row['live_asks_above_030'], 1)
        self.assertEqual(row['diagnostic_contradictions_at'], [])
        self.assertEqual(args, original)

    def test_wrong_scan_or_generation_clock_or_staging_packet_fails_closed(self):
        for field, value in [('scan_id', 'another'), ('generated_at', '2026-10-20T14:00:00Z'), ('packet_id', 'a'*64)]:
            s, b, e = inputs()
            e['scanner_context'][field] = value
            with self.assertRaises(ValueError): module.diagnose(s, b, e)

    def test_source_batch_forgery_is_rejected(self):
        s, b, e = inputs()
        b['candidates'][0]['options'][0]['scanner_ask'] = .1
        with self.assertRaises(ValueError): module.diagnose(s, b, e)

    def test_duplicate_dedup_and_conflict_rejection(self):
        s, b, e = inputs()
        e['observations'] *= 2
        self.assertEqual(module.diagnose(s, b, e)['identical_duplicates_skipped'], 1)
        e['observations'][1] = dict(e['observations'][0], ask=.42)
        with self.assertRaises(ValueError): module.diagnose(s, b, e)

    def test_bad_clocks_and_unknown_contract_fail_closed(self):
        for change in [dict(contract_id='OTHER'), dict(received_at='bad'), dict(observed_at='2026-10-20T15:03:00Z'),
                       dict(received_at='2026-10-20T14:00:00Z', observed_at='2026-10-20T14:00:00Z')]:
            s, b, e = inputs()
            e['observations'][0].update(change)
            with self.assertRaises(ValueError): module.diagnose(s, b, e)

    def test_both_spread_limits_and_invalid_books(self):
        for bid, ask, status in [(.08, .11, 'WIDE_SPREAD'), (.09, .11, 'SPREAD_PASSED'),
                                 (1, 1.11, 'WIDE_SPREAD'), (.17, .23, 'SPREAD_PASSED'),
                                 (0, .01, 'INVALID_BOOK'), (True, 2, 'INVALID_BOOK'), (2, 1, 'INVALID_BOOK')]:
            self.assertEqual(module.book(bid, ask)['status'], status)

    def test_empty_evidence_does_not_invent_success_or_whole_request_counts(self):
        s, b, e = inputs()
        e['observations'] = []
        r = module.diagnose(s, b, e)
        self.assertEqual(r['observation_count'], 0)
        self.assertIsNone(r['contracts'][0]['first_live_book'])
        self.assertEqual(r['contracts'][0]['quote_checks'], {})

    def test_exported_pass_cannot_hide_wide_book(self):
        s, b, e = inputs()
        e['observations'][0].update(quote_check='QUOTE_CHECK_PASSED', quote_check_reasons=[])
        self.assertEqual(module.diagnose(s, b, e)['contracts'][0]['diagnostic_contradictions_at'], ['2026-10-20T15:01:01Z'])

    def test_missing_contract_is_not_a_pass_and_equivalent_receipt_clocks_group_together(self):
        s, b, e = inputs()
        other = copy.deepcopy(s['candidates'][0])
        other['ticker'] = 'DEF'
        other['expiry_groups']['week']['options'][0]['contract_id'] = 'DEF-1'
        s['candidates'].append(other)
        b['candidates'].append(dict(ticker='DEF', options=[dict(b['candidates'][0]['options'][0], ticker='DEF', contract_id='DEF-1')]))
        for name in ('scanned_contracts', 'price_qualifying_contracts', 'qualifying_contracts', 'total_contracts', 'included_contracts'):
            b[name] = 2
        r = module.diagnose(s, b, e)
        self.assertEqual(r['contracts'][1]['missing_from_observed_receipt_batches'], 1)
        self.assertEqual(r['contracts'][1]['quote_checks'], {})
        e['observations'].append(dict(e['observations'][0], contract_id='DEF-1', received_at='2026-10-20T11:01:01-04:00'))
        self.assertEqual(module.diagnose(s, b, e)['observed_receipt_batches'], 1)

    def test_available_option_clock_does_not_substitute_payload_or_trade_time(self):
        for stamp, expected in [(None, 'UNKNOWN'), ('2026-10-20 14:59:00', 'UNKNOWN'), ('2026-10-20T14:59:00Z', 'AVAILABLE')]:
            s, b, e = inputs()
            s['candidates'][0]['expiry_groups']['week']['options'][0]['option_timestamp'] = stamp
            self.assertEqual(module.diagnose(s, b, e)['contracts'][0]['research']['quote_time_status'], expected)

    def test_malformed_status_and_reasons_do_not_become_unknown_passes(self):
        for fields in [dict(quote_check={}), dict(quote_check_reasons='WIDE_SPREAD'), dict(quote_check_reasons=[{}])]:
            s, b, e = inputs()
            e['observations'][0].update(fields)
            with self.assertRaises(ValueError): module.diagnose(s, b, e)
