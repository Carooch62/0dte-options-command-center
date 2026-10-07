import unittest
from datetime import datetime, timezone
from unittest.mock import Mock
from marketdata_research import fetch_sample, normalize

S = 'AAPL271217C00250000'
NOW = datetime(2026, 10, 7, 20, tzinfo=timezone.utc)


class MarketDataResearchTests(unittest.TestCase):
    def payload(self, **changes):
        return {'s': 'ok', 'optionSymbol': [S], 'bid': [1], 'ask': [1.1],
                'updated': [1791316800], 'theta': [0], **changes}

    def test_snapshot_clock_age_and_unknown_execution_fields(self):
        q = normalize(self.payload(), S, NOW)
        self.assertEqual(q['quote_timestamp'], '2026-10-06T20:00:00+00:00')
        self.assertEqual(q['observed_snapshot_age_seconds'], 86400)
        self.assertTrue(q['theta_available'])
        self.assertIsNone(q['delta'])
        self.assertIsNone(q['bid_event_timestamp'])
        self.assertFalse(q['entry_time_greeks_verified'])
        self.assertIsNone(normalize(self.payload(), S, NOW, historical=True)['theta'])

    def test_rejects_wrong_contract_bad_clocks_and_crossed_quotes(self):
        for change in ({'optionSymbol': ['WRONG']}, {'updated': [1791316800000]},
                       {'updated': [NOW.timestamp() + 1]}, {'bid': [2]},
                       {'delta': [float('nan')]}, {'ask': [True]}):
            with self.assertRaises(ValueError):
                normalize(self.payload(**change), S, NOW)

    def test_cached_success_and_secret_only_in_header(self):
        client = Mock()
        client.get.return_value.status_code = 203
        client.get.return_value.json.return_value = self.payload()
        sample = fetch_sample([S, S], token='synthetic-test-token', session=client)
        self.assertEqual(len(sample['quotes']), 1)
        client.get.assert_called_once()
        call = client.get.call_args
        self.assertNotIn('synthetic-test-token', call.args[0])
        self.assertEqual(call.kwargs['headers']['Authorization'], 'Bearer synthetic-test-token')
        self.assertFalse(call.kwargs['allow_redirects'])
        self.assertFalse(sample['live_scanner_integration'])
        self.assertNotIn('synthetic-test-token', str(sample))

    def test_limits_and_auth_fail_before_request(self):
        client = Mock()
        for symbols, kwargs in (([S], {}), (['SPY261016C00781000'], {'demo': True}),
                                (['invalid'], {'demo': True})):
            with self.assertRaises(ValueError):
                fetch_sample(symbols, session=client, **kwargs)
        client.get.assert_not_called()
        client.get.return_value.status_code = 429
        with self.assertRaises(ValueError):
            fetch_sample([S], demo=True, session=client)
        self.assertEqual(client.get.call_count, 1)
