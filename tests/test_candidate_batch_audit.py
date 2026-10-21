"""Fault injection against the independent public snapshot audit."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('audit_batch', Path(__file__).resolve().parents[1] / 'scripts/audit-candidate-batch.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def fixtures():
    option = dict(contract_id='ABC261023C00010000', expiry='2026-10-23', side='call', strike=10,
                  bid=.18, ask=.20, delta=.40, delta_verified=True, dte=3, volume=40,
                  quote_valid=True, near_atm=True, delta_ok=True, usable_spread=True, contract_score=10)
    source = dict(generated_at='2026-10-20T15:00:00Z', market_date='2026-10-20', scan_id='fixture',
                  market_session='OPEN', candidates=[dict(ticker='ABC', price=10, options=[],
                  expiry_groups={'week': dict(options=[option])})])
    batch = dict(format='candidate-identities-v1', selection_policy='published-research-screens-v1',
                 environment='production', source='main / market-dashboard.json', ranking_effect='NONE',
                 generated_at=source['generated_at'], scan_id='fixture', market_session='OPEN',
                 scanned_contracts=1, price_qualifying_contracts=1, qualifying_contracts=1,
                 research_rejected_contracts=0, total_contracts=1, included_contracts=1,
                 omitted_contracts=0, max_per_ticker=2, candidates=[dict(ticker='ABC', options=[dict(
                 contract_id=option['contract_id'], ticker='ABC', expiry='2026-10-23', side='call',
                 strike=10, scanner_ask=.2)])])
    return source, batch


class CandidateAuditTests(unittest.TestCase):
    def test_future_expiry_source_is_audited(self):
        self.assertEqual(module.audit(*fixtures())['status'], 'PASS')

    def test_selected_identity_ask_and_counters_cannot_drift(self):
        for field, value in [('strike', 11), ('scanner_ask', .3), ('contract_id', 'OTHER')]:
            s, b = fixtures()
            b['candidates'][0]['options'][0][field] = value
            self.assertIn('candidates', module.audit(s, b)['mismatched_fields'])
        s, b = fixtures()
        b['omitted_contracts'] = 2
        self.assertIn('omitted_contracts', module.audit(s, b)['mismatched_fields'])

    def test_missing_screen_and_raw_evidence_contradiction_are_detected(self):
        s, b = fixtures()
        del s['candidates'][0]['expiry_groups']['week']['options'][0]['delta_ok']
        self.assertEqual(module.audit(s, b)['status'], 'FAIL')
        for field, value in [('delta', .9), ('bid', .01), ('dte', 4)]:
            s, b = fixtures()
            s['candidates'][0]['expiry_groups']['week']['options'][0][field] = value
            self.assertTrue(module.audit(s, b)['raw_evidence_failures'])

    def test_conflicting_duplicate_is_not_hidden(self):
        s, b = fixtures()
        duplicate = copy.deepcopy(s['candidates'][0]['expiry_groups']['week']['options'][0])
        duplicate['ask'] = .25
        s['candidates'][0]['options'] = [duplicate]
        self.assertTrue(module.audit(s, b)['conflicting_duplicate_identities'])

    def test_ticker_and_global_caps_and_stable_score_order(self):
        s, b = fixtures()
        row = s['candidates'][0]
        base = row['expiry_groups']['week']['options'][0]
        row['expiry_groups']['week']['options'] = []
        for i, score in enumerate([1, 8, 8]):
            o = dict(base, strike=10+i/10, contract_id=f'ABC-{i}', contract_score=score)
            row['options'].append(o)
        for i in range(11):
            other = copy.deepcopy(row)
            other['ticker'] = f'T{i}'
            s['candidates'].append(other)
        result = module.audit(s, b)
        self.assertEqual(result['expected_batch_counts']['included_contracts'], 20)
        self.assertEqual(result['expected_batch_counts']['qualifying_contracts'], 36)
        self.assertEqual(result['expected_batch_counts']['omitted_contracts'], 16)
        self.assertEqual([r['options'][0]['contract_id'] for r in result['selected'][:2]], ['ABC-1', 'ABC-2'])
        # A forged batch accepting the lowest score instead of the stable tied leaders fails.
        b['candidates'][0]['options'][0]['contract_id'] = 'ABC-0'
        self.assertIn('candidates', module.audit(s, b)['mismatched_fields'])

    def test_compact_projection_is_rejected(self):
        s, b = fixtures()
        s['delivery_window'] = 'today'
        with self.assertRaises(ValueError):
            module.audit(s, b)
