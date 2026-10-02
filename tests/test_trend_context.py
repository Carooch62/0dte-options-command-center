import copy
import unittest
import json
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from market_clock import calendar
from trend_context import summarize, enrich, completed_session
from schema_normalizer import normalize
import pipeline

NOW = datetime(2026, 10, 2, 14, 0, tzinfo=timezone.utc)


def payload(up=True, count=35):
    sessions = calendar().sessions_in_range('2026-08-01', '2026-10-01')[-count:]
    values = [30 + (i if up else -i) * .1 for i in range(len(sessions))]
    return {'timestamp': [calendar().session_open(s).timestamp() for s in sessions],
            'indicators': {'quote': [{'close': values, 'high': [v + .2 for v in values],
                                     'low': [v - .2 for v in values]}],
                           'adjclose': [{'adjclose': values.copy()}]}}


class TrendContextTests(unittest.TestCase):
    def test_completed_horizons_and_direction(self):
        for up, direction in [(True, 'UP'), (False, 'DOWN')]:
            result = summarize(payload(up), NOW)
            self.assertEqual(result['status'], 'READY')
            self.assertEqual(result['as_of'], '2026-10-01')
            self.assertEqual(result['overall_direction'], direction)
            self.assertEqual([p['sessions'] for p in result['periods'].values()], [5, 10, 21])
            self.assertTrue(all(p['direction'] == direction for p in result['periods'].values()))
            self.assertTrue(all((p['change_pct'] > 0) == up for p in result['periods'].values()))

    def test_partial_current_daily_bar_excluded_and_early_close_respected(self):
        data = payload()
        data['timestamp'].append(calendar().session_open('2026-10-02').timestamp())
        for values in data['indicators']['quote'][0].values():
            values.append(99)
        data['indicators']['adjclose'][0]['adjclose'].append(99)
        self.assertEqual(summarize(data, NOW)['as_of'], '2026-10-01')
        self.assertEqual(summarize(data, NOW.replace(hour=20, minute=21))['as_of'], '2026-10-02')
        self.assertEqual(completed_session(datetime(2026, 11, 27, 18, 10, tzinfo=timezone.utc)), '2026-11-25')
        self.assertEqual(completed_session(datetime(2026, 11, 27, 18, 21, tzinfo=timezone.utc)), '2026-11-27')

    def test_split_adjustment_prevents_false_downtrend(self):
        data = payload()
        size = len(data['timestamp'])
        data['indicators']['quote'][0] = {'close': [60.] * (size-1) + [30.],
                                        'high': [62.] * (size-1) + [31.],
                                        'low': [58.] * (size-1) + [29.]}
        data['indicators']['adjclose'][0]['adjclose'] = [30.] * size
        result = summarize(data, NOW)
        self.assertEqual(result['overall_direction'], 'MIXED')
        self.assertTrue(all(p['change_pct'] == 0 for p in result['periods'].values()))

    def test_missing_adjustments_short_history_and_session_gaps_are_unknown(self):
        data = payload()
        del data['indicators']['adjclose']
        self.assertEqual(summarize(data, NOW)['overall_direction'], 'UNKNOWN')
        self.assertIsNone(summarize(payload(count=8), NOW)['periods']['month']['change_pct'])
        data = payload()
        for values in [data['timestamp'], *data['indicators']['quote'][0].values(), data['indicators']['adjclose'][0]['adjclose']]:
            del values[-3]
        result = summarize(data, NOW)
        self.assertIsNone(result['periods']['week']['change_pct'])
        self.assertEqual(result['overall_direction'], 'UNKNOWN')

    def test_cache_realigns_without_fetch_and_failure_preserves_historical_context(self):
        data = {'candidates': [{'ticker': 'JD', 'direction': 'DOWN', 'score': 2.1}]}
        result, cache = enrich(copy.deepcopy(data), {}, NOW, fetch=lambda _: payload(False))
        self.assertEqual(result['candidates'][0]['trend_context']['alignment'], 'ALIGNED')
        data['candidates'][0]['direction'] = 'UP'
        def unavailable(_):
            raise AssertionError('cache should avoid fetch')
        result, _ = enrich(copy.deepcopy(data), cache, NOW, fetch=unavailable)
        self.assertEqual(result['candidates'][0]['trend_context']['alignment'], 'AGAINST_TREND')
        result, cache = enrich(copy.deepcopy(data), cache, NOW.replace(hour=20, minute=21), fetch=unavailable)
        context = result['candidates'][0]['trend_context']
        self.assertEqual(context['status'], 'SOURCE_FAILURE')
        self.assertEqual(context['as_of'], '2026-10-01')
        self.assertEqual(context['alignment'], 'UNKNOWN')
        self.assertEqual(result['candidates'][0]['score'], 2.1)

    def test_context_never_changes_normalized_entry_signals_or_filters(self):
        data = {'market_session': 'OPEN', 'candidates': [{'ticker': 'JD', 'direction': 'DOWN',
                'price': 26, 'score': 2, 'day_move': -1, 'move_5m': -.2, 'recent_move': -.3,
                'bar_end': NOW.isoformat(), 'volume_ratio': .8, 'volume_acceleration': .9, 'options': []}]}
        original = normalize(copy.deepcopy(data), NOW)
        enriched, _ = enrich(copy.deepcopy(data), {}, NOW, fetch=lambda _: payload(False))
        actual = normalize(enriched, NOW)
        actual['candidates'][0].pop('trend_context')
        self.assertEqual(actual, original)

    def test_optional_stage_timeout_does_not_fail_intraday_publication(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            def run(command, cwd, **kwargs):
                stage = Path(cwd) / 'data'
                if command[-1].endswith('scanner.py'):
                    for name in pipeline.FILES:
                        (stage / name).write_text('{}')
                    (stage / 'market.json').write_text(json.dumps({'candidates': [{'ticker': 'JD'}]}))
                    (stage / 'market-dashboard.json').write_text(json.dumps({'scan_id': 'test', 'coverage': {}, 'generated_at': NOW.isoformat()}))
                if command[-1].endswith('trend_context.py'):
                    raise subprocess.TimeoutExpired(command, 120)
            with patch.object(pipeline, 'ROOT', root), patch.object(pipeline, 'session_info', return_value={'session': 'OPEN'}), patch.object(pipeline.subprocess, 'run', side_effect=run), patch.object(pipeline, 'validate', return_value={'status': 'SUCCESS'}):
                self.assertEqual(pipeline.run(), 0)
            raw = json.loads((root / 'data/market.json').read_text())
            self.assertEqual(raw['candidates'][0]['trend_context']['alignment'], 'UNKNOWN')
