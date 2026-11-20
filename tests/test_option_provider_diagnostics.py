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
        with patch.object(scanner, 'fetch_cboe', side_effect=error), patch.object(scanner, 'nasdaq_options', return_value=result), patch.object(scanner.time, 'perf_counter', side_effect=[1, 1.125, 2, 2.25]), patch.object(scanner, 'record_error'):
            actual = scanner.options('TEST')
        self.assertEqual(actual['provider_diagnostics'], [
            {'provider': 'fetch_cboe', 'status': 'SOURCE_FAILURE', 'duration_ms': 125, 'error': 'HTTPError', 'http_status': 429},
            {'provider': 'nasdaq_options', 'status': 'EMPTY_UNVERIFIED', 'duration_ms': 250},
        ])
        self.assertNotIn('secret', json.dumps(actual))
        row = {'ticker': 'TEST', 'price': 10, 'direction': 'UP'}
        scanner.enrich_options(row, actual)
        self.assertEqual(row['chain_provider_diagnostics'], actual['provider_diagnostics'])
        self.assertEqual(row['chain_status'], 'EMPTY_UNVERIFIED')

    def test_success_does_not_call_fallback_and_total_failure_keeps_both_attempts(self):
        with patch.object(scanner, 'fetch_cboe', return_value={'status': 'SUCCESS'}), patch.object(scanner, 'nasdaq_options') as fallback:
            actual = scanner.options('TEST')
            fallback.assert_not_called()
        self.assertEqual(len(actual['provider_diagnostics']), 1)
        with patch.object(scanner, 'fetch_cboe', side_effect=ValueError('private body')), patch.object(scanner, 'nasdaq_options', side_effect=requests.Timeout('private URL')), patch.object(scanner, 'record_error'):
            actual = scanner.options('TEST')
        self.assertEqual(actual['status'], 'SOURCE_FAILURE')
        self.assertEqual([x['error'] for x in actual['provider_diagnostics']], ['ValueError', 'Timeout'])
        self.assertNotIn('private', json.dumps(actual))
