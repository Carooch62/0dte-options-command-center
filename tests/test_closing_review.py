import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import scanner
from option_expander import select_candidates
from execution_engine import update_history


class ClosingReviewTests(unittest.TestCase):
    now = datetime(2026, 10, 2, 8, 30, tzinfo=scanner.ET)

    def bar(self, day=1, hour=15, minute=55, close=19.35):
        return {'time': self.now.replace(day=day, hour=hour, minute=minute), 'close': close}

    def test_partial_prior_session_cannot_override_previous_close(self):
        value, source = scanner.previous_session_close(
            {'meta': {'previousClose': 19.35, 'chartPreviousClose': 22.02}},
            [self.bar(hour=10, minute=0, close=19)], self.now)
        self.assertIsNone(value)
        self.assertEqual(source, 'UNAVAILABLE')

    def test_missing_metadata_requires_previous_session_closing_bar(self):
        self.assertEqual(scanner.previous_session_close({}, [self.bar()], self.now)[0], 19.35)
        self.assertIsNone(scanner.previous_session_close({}, [self.bar(hour=10)], self.now)[0])
        self.assertIsNone(scanner.previous_session_close({}, [], self.now)[0])
        stale = {'time': datetime(2026, 9, 30, 15, 55, tzinfo=scanner.ET), 'close': 19}
        self.assertIsNone(scanner.previous_session_close({}, [stale], self.now)[0])
        self.assertIsNone(scanner.previous_session_close({'meta': {'chartPreviousClose': 22.02}}, [], self.now)[0])

    def test_watchlist_coverage_is_budgeted_and_unique(self):
        rows = [{'ticker': str(i), 'score': 100-i} for i in range(100)]
        rows += [{'ticker': t, 'score': 0} for t in ['JD', 'DKNG', 'SOFI']]
        with patch.dict('os.environ', {'OPTION_PRIORITY_TICKERS': 'JD,DKNG,SOFI'}):
            selected, pinned, rotation = select_candidates(rows, 70, 5)
            self.assertEqual(len(selected), 70)
            self.assertEqual(len({x['ticker'] for x in selected}), 70)
            self.assertEqual({x['ticker'] for x in selected[:3]}, {'JD', 'DKNG', 'SOFI'})
            self.assertEqual((pinned, rotation), (3, 10))
            rows[-1]['chain_attempted'] = True
            selected, _, _ = select_candidates(rows, 2)
            self.assertEqual(len(selected), 2)
            self.assertNotIn('SOFI', [x['ticker'] for x in selected])
            self.assertEqual(select_candidates(rows, 0)[0], [])

    def test_history_preserves_ranking_and_contract_rejection_evidence(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'history.json'
            data = {'candidates': [{'ticker': 'JD', 'score': 2.5, 'previous_close': 26.37,
                    'recent_move': -.4, 'move_30m': -.7, 'move_60m': -1.2,
                    'invalidation_price': 26.4, 'chase_risk': 'HIGH',
                    'second_wave_event': 'DIRECTION_CHANGE',
                    'previous_close_source': 'PROVIDER_PREVIOUS_CLOSE', 'chain_attempted': True,
                    'options': [{'contract_id': 'JD-put', 'side': 'put', 'volume': 100,
                                 'preferred_price': False, 'rejection_reasons': ['WIDE_SPREAD']}]}]}
            update_history(data, path)
            row = json.loads(path.read_text())[0]['candidate_state'][0]
            self.assertEqual((row['rank'], row['score'], row['previous_close']), (1, 2.5, 26.37))
            self.assertEqual(row['contract_count'], 1)
            self.assertEqual(row['default_price_rejection_count'], 1)
            self.assertEqual(row['contract_rejections'], {'WIDE_SPREAD': 1})
            self.assertEqual([row[k] for k in ('recent_move', 'move_30m', 'move_60m')], [-.4, -.7, -1.2])
            self.assertEqual(row['invalidation_price'], 26.4)
            self.assertEqual(row['chase_risk'], 'HIGH')
            self.assertEqual(row['second_wave_event'], 'DIRECTION_CHANGE')
