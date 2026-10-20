import copy
import gzip
import json
import tempfile
import unittest
from pathlib import Path
from shadow_evidence import capture, make_packet, review_queue, review_template

NOW = '2026-10-14T15:00:00+00:00'


def snapshot():
    option = {'contract_id': 'TEST261016C00100000', 'strike': 100, 'side': 'call', 'expiry': '2026-10-16',
              'ask': .30, 'bid': .29, 'volume': 20, 'dte': 2, 'quote_valid': True, 'delta_ok': True,
              'near_atm': True, 'usable_spread': True, 'option_timestamp': None, 'received_at': NOW,
              'source': 'public delayed', 'account_id': 'must not copy'}
    return {'generated_at': NOW, 'scan_id': 'test', 'market_date': '2026-10-14', 'market_session': 'OPEN',
            'candidates': [{'ticker': 'TEST', 'options': [option], 'news_status': 'SOURCE_FAILURE',
                            'account_id': 'private', 'research_bars': [{'time': NOW, 'close': 100}]}]}


class EvidenceTests(unittest.TestCase):
    def test_packet_has_exact_inputs_hash_coverage_and_no_private_fields(self):
        source = snapshot(); before = copy.deepcopy(source)
        p = make_packet(source, NOW)
        self.assertEqual(source, before)
        self.assertEqual(len(p['packet_id']), 64)
        self.assertEqual(p['coverage']['included'], 1)
        self.assertNotIn('account_id', json.dumps(p))
        self.assertEqual(p['candidates'][0]['stock']['research_bars'], source['candidates'][0]['research_bars'])
        self.assertIn('EXCHANGE_QUOTE_TIME_UNKNOWN', review_queue(p)['candidates'][0]['evidence_gaps'])
        self.assertIn('NEWS_COVERAGE_INCOMPLETE', review_queue(p)['candidates'][0]['evidence_gaps'])

    def test_failed_screens_and_bounds_have_no_fallback(self):
        s = snapshot(); options = s['candidates'][0]['options']
        for i in range(30): options.append({**options[0], 'contract_id': 'TEST'+str(i)})
        p = make_packet(s, NOW)
        self.assertEqual(p['coverage']['included'], 2)
        self.assertEqual(p['coverage']['omitted'], 29)
        for o in options: o['delta_ok'] = False
        self.assertEqual(make_packet(s, NOW)['candidates'], [])

    def test_capture_is_idempotent_and_keeps_original_packet(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder); (path/'market-dashboard.json').write_text(json.dumps(snapshot()))
            first = capture(path, NOW, 'testcommit')
            saved = (path/'shadow-evidence-latest.json').read_bytes()
            self.assertEqual(capture(path, '2026-10-14T15:01:00Z')['status'], 'ALREADY_CAPTURED')
            self.assertEqual(saved, (path/'shadow-evidence-latest.json').read_bytes())
            archive = list((path/'shadow-evidence').glob('*/*.gz'))
            self.assertEqual(len(archive), 1)
            self.assertEqual(json.loads(gzip.decompress(archive[0].read_bytes()))['packet_id'], first['packet_id'])
            self.assertEqual(json.loads((path/'shadow-outcomes.json').read_text())['results'][0]['entry_status'], 'WITHHELD_ENTRY_QUOTE')

    def test_future_generation_clock_rejected(self):
        with self.assertRaises(ValueError): make_packet(snapshot(), '2026-10-14T14:59:59Z')

    def test_template_is_unrated_not_fabricated_evidence(self):
        source = snapshot()
        source['candidates'][0].update(news_status='SUCCESS', news_checked_at=NOW,
                                       news_items=[{'title': 'Synthetic fixture headline'}])
        template = review_template(make_packet(source, NOW))
        row = template['records'][0]
        self.assertIsNone(row['reviewed_at'])
        self.assertIsNone(row['component_reviews']['news']['dimensions']['novelty']['rating'])
        self.assertEqual(row['evidence_set_id'], template['packet_id'])
        self.assertEqual(row['news_status'], 'SUCCESS')
        self.assertEqual(row['news_checked_at'], NOW)
        self.assertEqual(row['news_items'], source['candidates'][0]['news_items'])
        self.assertEqual(row['component_reviews']['news']['event_ids'], [])

    def test_followups_capture_tracked_contract_even_above_price_limit(self):
        s = snapshot(); o = s['candidates'][0]['options'][0]; o['ask'] = .50
        p = make_packet(s, NOW, tracked_ids={o['contract_id']})
        self.assertEqual(p['candidates'], [])
        self.assertEqual(p['followup_quotes'][0]['ask'], .50)

