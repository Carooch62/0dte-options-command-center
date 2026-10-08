import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

import scanner


class PreviousSessionCloseTests(unittest.TestCase):
    def test_stale_metadata_cannot_reverse_premarket_direction(self):
        now = datetime(2026, 10, 8, 8, 35, tzinfo=scanner.ET)
        for ticker, price, closing_price, stale_close in (
                ('PENG', 70.16, 72.61, 64.21), ('BULL', 5.84, 5.89, 7.28)):
            with self.subTest(ticker=ticker):
                stamps = [now.replace(day=7, hour=15, minute=55), now.replace(minute=25)]
                values = [closing_price, price]
                payload = {'timestamp': [s.timestamp() for s in stamps],
                           'meta': {'previousClose': stale_close, 'chartPreviousClose': stale_close},
                           'indicators': {'quote': [{'open': values, 'high': values, 'low': values,
                                                    'close': values, 'volume': [100, 100]}]}}
                row = scanner.scan_one(ticker, now, payload)
                self.assertEqual(row['previous_close'], closing_price)
                self.assertEqual(row['previous_close_date'], '2026-10-07')
                self.assertEqual(row['previous_close_source'], 'COMPLETED_PRIOR_SESSION')
                self.assertEqual(row['day_move'], round(scanner.pct(price, closing_price), 2))
                self.assertLess(row['day_move'], 0)

    def test_missing_close_omits_daily_change_and_daily_score_boost(self):
        now = datetime(2026, 10, 8, 8, 35, tzinfo=scanner.ET)
        payload = {'timestamp': [now.replace(minute=25).timestamp()],
                   'meta': {'previousClose': 10},
                   'indicators': {'quote': [{'open': [20], 'high': [20], 'low': [20],
                                            'close': [20], 'volume': [100]}]}}
        row = scanner.scan_one('TEST', now, payload)
        self.assertIsNone(row['day_move'])
        self.assertIsNone(row['previous_close_date'])
        self.assertEqual(row['score'], 0)

    def test_early_close_and_holiday_weekend_use_exchange_session(self):
        now = datetime(2026, 11, 30, 8, 30, tzinfo=scanner.ET)
        closing = datetime(2026, 11, 27, 12, 55, tzinfo=scanner.ET)
        bars = [{'time': closing, 'close': 100},
                {'time': closing + timedelta(minutes=65), 'close': 120}]
        self.assertEqual(scanner.previous_session_close({}, bars, now),
                         (100, 'COMPLETED_PRIOR_SESSION'))
        self.assertEqual(scanner.previous_session(now).date().isoformat(), '2026-11-27')

    def test_partial_or_older_session_close_is_unavailable(self):
        now = datetime(2026, 10, 8, 8, 30, tzinfo=scanner.ET)
        for time in [now.replace(day=7, hour=15, minute=50),
                     now.replace(day=6, hour=15, minute=55),
                     now.replace(day=7, hour=16, minute=0)]:
            self.assertEqual(scanner.previous_session_close(
                {'meta': {'previousClose': 100}}, [{'time': time, 'close': 100}], now),
                (None, 'UNAVAILABLE'))

    def test_chart_requests_prior_sessions(self):
        with patch.object(scanner, 'request_json', return_value={'chart': {'result': [{}]}}) as fetch:
            scanner.chart('PENG')
        self.assertEqual(fetch.call_args.kwargs['params']['range'], '5d')


if __name__ == '__main__':
    unittest.main()
