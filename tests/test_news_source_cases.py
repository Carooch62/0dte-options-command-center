"""Source-backed abstention cases; never load these into live review inputs."""
import copy
import json
import unittest
from datetime import datetime
from pathlib import Path

from news_research import evaluate


class SourceCaseTests(unittest.TestCase):
    def test_incomplete_real_evidence_never_becomes_a_weight_proposal(self):
        cases = json.loads((Path(__file__).parent / 'fixtures/news-source-cases.json').read_text())
        now = datetime.fromisoformat('2026-10-10T04:20:51+00:00')
        for case in cases:
            with self.subTest(title=case['event']['title']):
                event = case['event']
                row = {'ticker': event['ticker'], 'news_status': 'SUCCESS',
                       'news_items': [{'title': event['title']}],
                       'news_event_evidence': [event], 'score': 9,
                       'setup_qualified': False}
                before = copy.deepcopy(row)
                result = evaluate(row, now)
                self.assertEqual(result['status'], 'NEEDS_REVIEW')
                self.assertIsNone(result['proposed_weights'])
                self.assertIn('surprise', result['events'][0]['missing'])
                self.assertIn('valid_as_of_timestamps', result['events'][0]['missing'])
                self.assertEqual(result['ranking_effect'], 'NONE')
                self.assertEqual(result['eligibility_effect'], 'NONE')
                self.assertEqual(row, before)
