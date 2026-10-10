"""Reproduce a dated public-evidence review, not a historical trade backtest."""
import copy
import json
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from news_research import evaluate


class RealPositiveNewsTests(unittest.TestCase):
    def test_dated_review_decay_and_missing_benchmark(self):
        case = json.loads((Path(__file__).parent / 'fixtures/news-emat-guidance.json').read_text())
        row = case['row']
        before = copy.deepcopy(row)
        now = datetime.fromisoformat(case['evaluation_at'])
        result = evaluate(row, now)
        self.assertEqual(result['status'], 'ASSESSED')
        self.assertGreater(result['proposed_weights']['news'], 40)
        self.assertLess(result['proposed_weights']['news'], 43)
        self.assertEqual(result['eligibility_effect'], 'NONE')
        self.assertEqual(result['ranking_effect'], 'NONE')
        self.assertEqual(row, before)
        # Positive evidence expires; a later publication cannot renew the event.
        later = now + timedelta(days=1)
        row['news_event_evidence'][0]['published_at'] = later.isoformat()
        row['news_event_evidence'][0]['reviewed_at'] = later.isoformat()
        self.assertIsNone(evaluate(row, later)['proposed_weights'])
        missing = copy.deepcopy(before)
        missing['news_event_evidence'][0]['scores']['surprise'] = None
        self.assertIsNone(evaluate(missing, now)['proposed_weights'])
