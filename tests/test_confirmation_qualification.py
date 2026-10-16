"""Exercise confirmation through normalization and the execution layer."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import unittest

from execution_engine import enrich, execution_state
from schema_normalizer import normalize


NOW = datetime(2026, 10, 8, 15, 0, tzinfo=timezone.utc)


def fixtures(side):
    sign = 1 if side == 'call' else -1
    direction = 'UP' if sign == 1 else 'DOWN'
    option = {
        'contract_id': 'TEST:2026-10-08:' + side + ':100',
        'side': side, 'expiry': '2026-10-08', 'dte': 0, 'strike': 100,
        'bid': .19, 'ask': .20, 'volume': 100,
        'delta': .4 * sign, 'delta_verified': True,
        'option_timestamp': NOW.isoformat(), 'minimum_delay_minutes': 0,
    }
    row = {
        'ticker': 'TEST', 'price': 100 + sign * .1, 'direction': direction,
        'move_5m': .3 * sign, 'recent_move': .4 * sign,
        'volume_ratio': 2, 'volume_acceleration': 1.3,
        'bar_end': NOW.isoformat(),
        'bar_timestamp': (NOW - timedelta(minutes=5)).isoformat(),
        'trigger_price': 100, 'zero_dte': True, 'options': [option],
        'news_items': [{'title': 'TEST wins contract', 'age_hours': 1}],
    }
    data = {'generated_at': NOW.isoformat(), 'market_session': 'OPEN',
            'candidates': [row]}
    previous = {
        'generated_at': (NOW - timedelta(minutes=5)).isoformat(),
        'candidates': [{'ticker': 'TEST', 'direction': direction,
                        'price': 100 - sign * .1, 'trigger_price': 100,
                        'move_5m': .3 * sign, 'volume_acceleration': 1.3}],
    }
    return data, previous


def evaluate(data, previous):
    return enrich(normalize(data, NOW), previous)['candidates'][0]


class ConfirmationQualificationTests(unittest.TestCase):
    def test_qualified_calls_and_puts_still_confirm(self):
        for side in ('call', 'put'):
            with self.subTest(side=side):
                row = evaluate(*fixtures(side))
                self.assertTrue(row['setup_qualified'])
                self.assertEqual(row['execution_readiness'], 'VERIFIED_DELAYED')
                self.assertEqual(row['execution_state'], 'CONFIRMED')

    def test_missing_background_or_stale_catalyst_preserves_trigger_only(self):
        news_cases = [[], [{'title': 'Market today', 'age_hours': 1}],
                      [{'title': 'TEST wins contract', 'age_hours': 37}]]
        for side in ('call', 'put'):
            for news in news_cases:
                with self.subTest(side=side, news=news):
                    data, previous = fixtures(side)
                    data['candidates'][0]['news_items'] = deepcopy(news)
                    row = evaluate(data, previous)
                    self.assertFalse(row['setup_qualified'])
                    self.assertEqual(row['execution_readiness'], 'WATCH_ONLY')
                    self.assertTrue(row['trigger_crossed'])
                    self.assertEqual(row['execution_state'], 'TRIGGERED')

    def test_execution_layer_requires_explicit_qualification(self):
        for side in ('call', 'put'):
            for qualification in (False, None, 'true', 1):
                with self.subTest(side=side, qualification=qualification):
                    data, previous = fixtures(side)
                    row = normalize(data, NOW)['candidates'][0]
                    if qualification is None:
                        row.pop('setup_qualified')
                    else:
                        row['setup_qualified'] = qualification
                    # Stale/inconsistent readiness must not bypass qualification.
                    state, crossed = execution_state(row, previous['candidates'][0])
                    self.assertTrue(crossed)
                    self.assertEqual(state, 'TRIGGERED')

    def test_invalid_or_unverified_contract_cannot_confirm(self):
        changes = [
            {'delta': None, 'delta_verified': False},
            {'bid': .21}, {'bid': 0},
            {'option_timestamp': None},
            {'option_timestamp': (NOW - timedelta(minutes=21)).isoformat()},
            {'option_timestamp': (NOW + timedelta(minutes=5)).isoformat()},
            {'expiry': '2026-10-09', 'dte': 1},
        ]
        for side in ('call', 'put'):
            for change in changes:
                with self.subTest(side=side, change=change):
                    data, previous = fixtures(side)
                    data['candidates'][0]['options'][0].update(change)
                    row = evaluate(data, previous)
                    self.assertTrue(row['setup_qualified'])
                    self.assertNotEqual(row['execution_readiness'], 'VERIFIED_DELAYED')
                    self.assertTrue(row['trigger_crossed'])
                    self.assertEqual(row['execution_state'], 'TRIGGERED')

    def test_stale_bars_or_closed_session_cannot_confirm(self):
        for side in ('call', 'put'):
            for reason in ('stale', 'closed'):
                with self.subTest(side=side, reason=reason):
                    data, previous = fixtures(side)
                    if reason == 'stale':
                        data['candidates'][0]['bar_end'] = (NOW - timedelta(minutes=9)).isoformat()
                    else:
                        data['market_session'] = 'AFTER HOURS'
                    row = evaluate(data, previous)
                    self.assertFalse(row['setup_qualified'])
                    self.assertNotEqual(row['execution_readiness'], 'VERIFIED_DELAYED')
                    self.assertNotEqual(row['execution_state'], 'CONFIRMED')

    def test_qualification_and_quote_do_not_replace_trigger_cross(self):
        for side in ('call', 'put'):
            with self.subTest(side=side):
                data, previous = fixtures(side)
                previous['candidates'][0]['price'] = data['candidates'][0]['price']
                row = evaluate(data, previous)
                self.assertTrue(row['setup_qualified'])
                self.assertEqual(row['execution_readiness'], 'VERIFIED_DELAYED')
                self.assertFalse(row['trigger_crossed'])
                self.assertNotEqual(row['execution_state'], 'CONFIRMED')


if __name__ == '__main__':
    unittest.main()
