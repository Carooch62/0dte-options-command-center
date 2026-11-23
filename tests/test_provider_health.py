import unittest
from provider_health import provider_health

class ProviderHealthTests(unittest.TestCase):
    def test_counts_calls_not_contracts_and_keeps_missing_timings_unknown(self):
        rows=[{'chain_provider_diagnostics':[{'provider':'fetch_cboe','status':'AUTOMATED_ACCESS_UNSUPPORTED','duration_ms':0}, {'provider':'nasdaq_options','status':'SUCCESS','duration_ms':100,'private':'SECRET'}]}, {'chain_provider_diagnostics':[{'provider':'nasdaq_options','status':'SOURCE_FAILURE','duration_ms':300,'http_status':429}]}, {'chain_provider_diagnostics':[{'provider':'nasdaq_options','status':'EMPTY_UNVERIFIED','duration_ms':float('nan')}]}]
        result=provider_health(rows);p=result['providers']['nasdaq_options']
        self.assertEqual(p['calls'],3);self.assertEqual(p['timed_calls'],2)
        self.assertEqual(p['duration_p50_ms'],200);self.assertEqual(p['duration_p95_ms'],290)
        self.assertEqual(p['http_status_counts'],{'429':1});self.assertNotIn('fetch_cboe',result['providers'])
        self.assertNotIn('SECRET',str(result))
        self.assertIsNone(provider_health([rows[2]])['providers']['nasdaq_options']['duration_p50_ms'])
