import json
import unittest
from unittest.mock import patch
import requests
import scanner


class OptionProviderDiagnosticsTests(unittest.TestCase):
    def test_fallback_retains_sanitized_status_and_elapsed_time(self):
        response = requests.Response()
        response.status_code = 429
        error = requests.HTTPError('secret URL and response body', response=response)
        result = {'contracts': [], 'source': 'Nasdaq public chain', 'timestamp': None, 'status': 'EMPTY_UNVERIFIED'}
        with patch.object(scanner, 'fetch_cboe') as unsupported, patch.object(scanner, 'nasdaq_options', return_value=result), patch.object(scanner.time, 'perf_counter', side_effect=[1, 1.25]), patch.object(scanner, 'record_error'):
            actual = scanner.options('TEST')
            unsupported.assert_not_called()
        self.assertEqual(actual['provider_diagnostics'], [
            {'provider': 'fetch_cboe', 'status': 'AUTOMATED_ACCESS_UNSUPPORTED', 'duration_ms': 0},
            {'provider': 'nasdaq_options', 'status': 'EMPTY_UNVERIFIED', 'duration_ms': 250},
        ])
        self.assertNotIn('secret', json.dumps(actual))
        row = {'ticker': 'TEST', 'price': 10, 'direction': 'UP'}
        scanner.enrich_options(row, actual)
        self.assertEqual(row['chain_provider_diagnostics'], actual['provider_diagnostics'])
        self.assertEqual(row['chain_status'], 'EMPTY_UNVERIFIED')

    def test_unsupported_dashboard_never_makes_network_calls_and_fallback_errors_are_sanitized(self):
        with patch.object(scanner, 'request_json') as network:
            with self.assertRaisesRegex(RuntimeError, 'unsupported'):
                scanner.fetch_cboe('TEST')
            network.assert_not_called()
        with patch.object(scanner, 'fetch_cboe') as unsupported, patch.object(scanner, 'nasdaq_options', return_value={'status':'SUCCESS'}):
            actual = scanner.options('TEST')
            unsupported.assert_not_called()
        self.assertEqual(len(actual['provider_diagnostics']), 2)
        response=requests.Response();response.status_code=429
        with patch.object(scanner, 'nasdaq_options', side_effect=requests.HTTPError('private URL',response=response)), patch.object(scanner, 'record_error'):
            actual = scanner.options('TEST')
        self.assertEqual(actual['status'], 'SOURCE_FAILURE')
        self.assertEqual(actual['provider_diagnostics'][1]['http_status'],429)
        self.assertEqual(actual['provider_diagnostics'][1]['error'],'HTTPError')
        self.assertNotIn('private', json.dumps(actual))
