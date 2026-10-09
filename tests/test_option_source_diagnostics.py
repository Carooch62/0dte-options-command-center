import copy
import unittest
from unittest.mock import Mock, patch
import requests
import scanner
import pipeline
import json
import tempfile
from pathlib import Path

NEGATIVE={'data':{'totalRecord':0,'table':{'rows':None}},
          'message':'Options are not available for this symbol','status':{'rCode':200}}

class OptionSourceDiagnostics(unittest.TestCase):
    def test_unknown_empty_coverage_remains_degraded(self):
        with tempfile.TemporaryDirectory() as folder:
            stage=Path(folder);(stage/'data').mkdir()
            raw={'universe_size':1,'candidates':[{'chain_attempted':True}],
                 'coverage':{'chains_attempted':1,'chain_status_counts':{'EMPTY_UNVERIFIED':1}},'scan_id':'test'}
            (stage/'data/market.json').write_text(json.dumps(raw))
            (stage/'data/market-dashboard.json').write_text(json.dumps({'schema_version':7,'candidates':[{'execution_state':'WATCH'}]}))
            self.assertEqual(pipeline.validate(stage)['status'],'DEGRADED')

    def test_explicit_provider_negative_is_not_a_failure_or_verified_no_expiry(self):
        with patch.object(scanner,'request_json',return_value=NEGATIVE):
            result=scanner.nasdaq_options('MAAS')
        self.assertEqual(result['status'],'EMPTY_UNVERIFIED')
        self.assertEqual(result['availability'],'NO_OPTIONS_REPORTED')
        row={'ticker':'MAAS','price':10,'direction':'UP'}
        scanner.enrich_options(row,result)
        self.assertEqual(row['option_availability'],'NO_OPTIONS_REPORTED')
        self.assertFalse(row['preferred_contracts'])
        self.assertTrue(all(g['chain_status']=='EMPTY_UNVERIFIED' for g in row['expiry_groups'].values()))

    def test_ambiguous_or_error_response_still_fails(self):
        for path,value in [('message','Unavailable'),('status',{'rCode':500}),('data',{'totalRecord':1,'table':{'rows':None}})]:
            payload=copy.deepcopy(NEGATIVE);payload[path]=value
            with self.subTest(path=path),patch.object(scanner,'request_json',return_value=payload):
                with self.assertRaises(ValueError):scanner.nasdaq_options('TEST')

    def test_http_status_survives_successful_negative_fallback(self):
        response=requests.Response();response.status_code=403
        error=requests.HTTPError('sensitive response must not be stored',response=response)
        with patch.object(scanner,'fetch_cboe',side_effect=error),patch.object(scanner,'request_json',return_value=NEGATIVE):
            result=scanner.options('MAAS')
        self.assertEqual(result['errors'],['fetch_cboe:HTTPError:HTTP_403'])
        self.assertEqual(result['status'],'EMPTY_UNVERIFIED')

    def test_custom_timeout_is_preserved_on_retry(self):
        success=Mock();success.json.return_value={'ok':True}
        with patch.object(scanner.requests,'get',side_effect=[requests.Timeout(),success]) as get,patch.object(scanner.time,'sleep'):
            scanner.request_json('https://example.test',timeout=3)
        self.assertEqual([c.kwargs['timeout'] for c in get.call_args_list],[3,3])

    def test_access_denied_is_not_retried(self):
        response=requests.Response();response.status_code=403
        with patch.object(scanner.requests,'get',return_value=response) as get:
            with self.assertRaises(requests.HTTPError):scanner.request_json('https://example.test')
        self.assertEqual(get.call_count,1)
