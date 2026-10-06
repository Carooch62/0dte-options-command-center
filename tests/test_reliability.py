import copy
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
import scanner
import core_0dte
import option_expander
import execution_engine
import pipeline
from quality import freshness, contract_checks, valid_quote, parse_time
from market_clock import session_info
from schema_normalizer import normalize
from outcomes import update

NOW=datetime(2026,9,30,10,0,tzinfo=scanner.ET)

def bars(count,start=None):
    start=start or NOW.replace(hour=9,minute=30)
    return {'timestamp':[(start+timedelta(minutes=i*5)).timestamp() for i in range(count)],
            'meta':{'previousClose':99},'indicators':{'quote':[{'open':[100+i*.1 for i in range(count)],
            'close':[100.05+i*.1 for i in range(count)],'high':[100.2+i*.1 for i in range(count)],
            'low':[99.9+i*.1 for i in range(count)],'volume':[100]*(count-1)+[400]}]}}

def option(**kw):
    d={'contract_id':'TEST260930C00100000','side':'call','expiry':'2026-09-30','dte':0,'strike':100,
       'bid':.23,'ask':.25,'mid':.24,'volume':100,'oi':100,'delta':.45,'gamma':.04,'greeks_verified':True,
       'option_timestamp':NOW.isoformat()}
    d.update(kw);return d

def row(**kw):
    d={'ticker':'TEST','price':100,'day_move':4,'direction':'UP','move_5m':.5,'recent_move':.6,
       'volume_ratio':2,'volume_acceleration':2,'bar_end':NOW.isoformat(),'bar_timestamp':(NOW-timedelta(minutes=5)).isoformat(),
       'news_items':[{'title':'TEST wins contract','url':'https://example.org/TEST','age_hours':1}],
       'options':[option()],'zero_dte':True,'chain_status':'SUCCESS','trigger_price':100.5,'invalidation_price':99}
    d.update(kw);return d

def snapshot(x):
    return {'scan_id':'test-scan','market_date':'2026-09-30','market_session':'OPEN','generated_at':NOW.isoformat(),'candidates':[x]}

class ReliabilityTests(unittest.TestCase):
    def test_opening_bars_available_without_hour_history(self):
        for n in (1,2,3,6):
            with self.subTest(n=n),patch.object(scanner,'chart',return_value=bars(n)):
                x=scanner.scan_one('TEST',NOW)
                self.assertIsNotNone(x);self.assertIsNone(x['move_60m'])
                self.assertEqual(x['session_bar_count'],n)
    def test_partial_bar_excluded(self):
        with patch.object(scanner,'chart',return_value=bars(7)):
            x=scanner.scan_one('TEST',NOW);self.assertEqual(x['session_bar_count'],6)
    def test_null_fields_drop_entire_record(self):
        b=bars(6);b['indicators']['quote'][0]['volume'][2]=None
        with patch.object(scanner,'chart',return_value=b):
            x=scanner.scan_one('TEST',NOW)
        self.assertEqual(x['session_bar_count'],5)
        q=b['indicators']['quote'][0]
        inds=[0,1,3,4,5];expected=sum((q['high'][i]+q['low'][i]+q['close'][i])/3*q['volume'][i] for i in inds)/sum(q['volume'][i] for i in inds)
        self.assertAlmostEqual(x['vwap'],expected,places=4)
    def test_old_session_not_reused(self):
        with patch.object(scanner,'chart',return_value=bars(6,NOW-timedelta(days=1,hours=1))):
            self.assertIsNone(scanner.scan_one('TEST',NOW))
    def test_actual_previous_close_day_change(self):
        with patch.object(scanner,'chart',return_value=bars(2)):
            x=scanner.scan_one('TEST',NOW)
        self.assertNotEqual(x['day_move'],x['open_move'])
    def test_calendar_holiday_and_early_close(self):
        self.assertEqual(session_info(datetime(2026,12,25,12,tzinfo=scanner.ET))['session'],'CLOSED')
        self.assertEqual(session_info(datetime(2026,11,27,14,tzinfo=scanner.ET))['session'],'AFTER HOURS')
    def test_invalid_quotes_and_missing_delta_rejected(self):
        for o in (option(bid=.3),option(bid=0),option(ask=float('nan')),option(bid=float('inf'))):
            self.assertFalse(valid_quote(o));self.assertFalse(contract_checks(o,100)['tight_spread'])
        o=option(delta=None,greeks_verified=False)
        self.assertFalse(contract_checks(o,100)['delta_ok'])
        self.assertEqual(execution_engine.classify_contract(o,100)['contract_role'],'UNVERIFIED')
    def test_expired_series_never_eligible(self):
        x=normalize(snapshot(row(options=[option(expiry='2026-09-29')])),NOW)['candidates'][0]
        self.assertEqual(x['eligible_contracts'],[])
    def test_nasdaq_group_date_is_preserved(self):
        rows=[{'expirygroup':'September 30, 2026'}, {'expiryDate':'Sep 30','strike':'100','c_Bid':'.23','c_Ask':'.25','c_Last':'.24','c_Volume':'100'}]
        contracts=scanner.parse_nasdaq_rows(rows,NOW.date())
        self.assertEqual(len(contracts),1);self.assertEqual(contracts[0]['expiry'],'2026-09-30')
    def test_fallback_contract_ids_include_ticker(self):
        rows=[{'expiryDate':datetime.now(scanner.ET).strftime('%m/%d/%Y'),'strike':'100','c_Bid':'.23','c_Ask':'.25','c_Last':'.24','c_Volume':'100'}]
        with patch.object(scanner,'request_json',return_value={'data':{'table':{'rows':rows}}}):
            a=scanner.nasdaq_options('AAA')['contracts'][0]
            b=scanner.nasdaq_options('BBB')['contracts'][0]
        self.assertNotEqual(a['contract_id'],b['contract_id'])
    def test_full_candidate_list_reaches_expansion(self):
        rows=[{'ticker':str(i),'score':i,'chain_attempted':False} for i in range(100)]
        with tempfile.TemporaryDirectory() as d:
            original=Path.cwd()
            try:
                __import__('os').chdir(d);Path('data').mkdir();Path('data/market.json').write_text(json.dumps({'universe_size':100,'candidates':rows}))
                attempted=[]
                def scan(xs):
                    attempted.extend(x['ticker'] for x in xs)
                    for x in xs:x.update(chain_attempted=True,chain_status='NO_EXPIRATION_TODAY')
                with patch.object(scanner,'scan_options',side_effect=scan):option_expander.main()
                result=json.loads(Path('data/market.json').read_text())
                self.assertEqual(len(result['candidates']),100);self.assertEqual(len(set(attempted)),70)
                self.assertEqual(result['coverage']['chains_attempted'],70)
            finally:__import__('os').chdir(original)
    def test_wide_relative_spread_rejected(self):
        self.assertFalse(contract_checks(option(bid=.05,ask=.10),100)['tight_spread'])
    def test_future_and_unknown_times_not_fresh(self):
        self.assertEqual(freshness('2099-01-01T00:00:00Z',NOW),'FUTURE')
        self.assertEqual(freshness(None,NOW),'UNKNOWN')
        self.assertEqual(freshness('2026-09-30 14:00:00',NOW),'UNKNOWN')
        self.assertEqual(freshness((NOW-timedelta(minutes=10)).isoformat(),NOW,delay=15,max_age=20),'STALE')
    def test_signed_confirmation_and_unknown_quote(self):
        x=normalize(snapshot(row(move_5m=-.5)),NOW)['candidates'][0]
        self.assertFalse(x['acceleration_confirmed']);self.assertFalse(x['momentum_confirmed'])
        x=normalize(snapshot(row(options=[option(option_timestamp=None)])),NOW)['candidates'][0]
        self.assertNotEqual(x['execution_readiness'],'VERIFIED_DELAYED')
    def test_invalid_preferred_contract_cannot_survive_normalization(self):
        x=normalize(snapshot(row(options=[option(bid=.30)])),NOW)['candidates'][0]
        self.assertEqual(x['preferred_contracts'],[])
    def test_full_chain_preserved_for_price_revisit(self):
        x=normalize(snapshot(row(options=[option(ask=.42,bid=.4),option(contract_id='cheap')])),NOW)['candidates'][0]
        self.assertEqual(len(x['eligible_contracts']),2);self.assertEqual(len(x['preferred_contracts']),1)
    def test_second_wave_requires_comparable_baseline(self):
        d=normalize(snapshot(row()),NOW);x=d['candidates'][0]
        out=execution_engine.enrich(copy.deepcopy(d),{})
        self.assertIsNone(out['candidates'][0]['second_wave_event'])
        old={'generated_at':(NOW-timedelta(minutes=5)).isoformat(),'candidates':[{'ticker':'TEST','direction':'UP','price':100,'trigger_price':101,'setup_qualified':False,'bar_timestamp':(NOW-timedelta(minutes=10)).isoformat()}]}
        self.assertEqual(execution_engine.enrich(copy.deepcopy(d),old)['candidates'][0]['second_wave_event'],'NEW_QUALIFICATION')
        old['generated_at']=(NOW-timedelta(days=1)).isoformat()
        self.assertIsNone(execution_engine.enrich(copy.deepcopy(d),old)['candidates'][0]['second_wave_event'])
    def test_coverage_counts_attempts_not_rows(self):
        d={'universe_size':3,'candidates':[{'chain_attempted':True,'chain_status':'SOURCE_FAILURE'},{'chain_attempted':True,'chain_status':'NO_EXPIRATION_TODAY'},{}]}
        scanner.coverage(d);self.assertEqual(d['option_chain_universe'],2);self.assertEqual(d['coverage']['chains_with_contracts'],0)
    def test_source_failure_is_not_no_expiry(self):
        with patch.object(scanner,'fetch_cboe',side_effect=ValueError()),patch.object(scanner,'nasdaq_options',side_effect=ValueError()):
            self.assertEqual(scanner.options('TEST')['status'],'SOURCE_FAILURE')
        with patch.object(scanner,'fetch_cboe',return_value={'contracts':[],'status':'NO_EXPIRATION_TODAY'}),patch.object(scanner,'nasdaq_options') as fallback:
            self.assertEqual(scanner.options('TEST')['status'],'NO_EXPIRATION_TODAY');fallback.assert_not_called()
    def test_retry_only_transient_errors(self):
        import requests
        r=requests.Response();r.status_code=429
        success=unittest.mock.Mock();success.raise_for_status.return_value=None;success.json.return_value={'ok':True}
        with patch.object(scanner.requests,'get',side_effect=[r,success]) as get,patch.object(scanner.time,'sleep'):
            self.assertTrue(scanner.request_json('https://example.org')['ok']);self.assertEqual(get.call_count,2)
    def test_pipeline_failure_preserves_last_good_files(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'data').mkdir();(root/'data/market.json').write_text('last-good')
            with patch.object(pipeline,'ROOT',root),patch.object(pipeline,'session_info',return_value={'session':'OPEN'}),patch.object(pipeline.subprocess,'run',side_effect=RuntimeError('failure')):
                self.assertEqual(pipeline.run(),1)
            self.assertEqual((root/'data/market.json').read_text(),'last-good')
            self.assertEqual(json.loads((root/'data/scan-health.json').read_text())['status'],'FAILED')
    def test_stale_primary_uses_only_newer_fallback_bars(self):
        primary=bars(2);backup=bars(6);backup['_source']='Alpaca iex bars'
        with patch.dict(scanner.os.environ,{'APCA_API_KEY_ID':'test'}),patch.object(scanner,'chart',return_value=primary),patch.object(scanner,'alpaca_chart',return_value=backup):
            result=scanner.scan_one('TEST',NOW)
            self.assertEqual(result['price_source'],'Alpaca iex bars')
            self.assertEqual(result['price_freshness'],'RECENT')
        with patch.dict(scanner.os.environ,{'APCA_API_KEY_ID':'test'}),patch.object(scanner,'chart',return_value=primary),patch.object(scanner,'alpaca_chart',side_effect=RuntimeError('unavailable')):
            result=scanner.scan_one('TEST',NOW)
            self.assertEqual(result['price_freshness'],'STALE')
            self.assertEqual(result['price_source'],'Yahoo 5m bars')

    def test_pipeline_receipt_is_written_only_after_validation(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'data').mkdir()
            receipt=root/'data/scan-receipts.json';receipt.write_text('[{"scan_id":"previous"}]')
            def build(*args,**kwargs):
                stage=Path(kwargs['cwd'])/'data'
                for name in pipeline.FILES:(stage/name).write_text('[]' if name in ('scan-history.json','option-observations.json') else '{}')
                (stage/'market-dashboard.json').write_text(json.dumps({'scan_id':'requested','generated_at':'now','coverage':{'stocks_received':206}}))
            with patch.object(pipeline,'ROOT',root),patch.object(pipeline,'session_info',return_value={'session':'OPEN'}),patch.object(pipeline.subprocess,'run',side_effect=build),patch.object(pipeline,'validate',return_value={'status':'SUCCESS'}):
                self.assertEqual(pipeline.run(),0)
                self.assertEqual([x['scan_id'] for x in json.loads(receipt.read_text())],['previous','requested'])
                saved=receipt.read_text()
                with patch.object(pipeline,'validate',side_effect=ValueError('bad snapshot')):
                    self.assertEqual(pipeline.run(),1)
                self.assertEqual(receipt.read_text(),saved)

    def test_observations_are_immutable_and_markouts_labeled(self):
        d=snapshot(row());x=d['candidates'][0];x['execution_state']='TRIGGERED';x['preferred_contracts']=[option(option_timestamp=None,payload_timestamp='first')]
        with tempfile.TemporaryDirectory() as t:
            p=str(Path(t)/'observations.json');update(d,p)
            later=copy.deepcopy(d);later['generated_at']=(NOW+timedelta(minutes=5)).isoformat();later['scan_id']='later'
            later['candidates'][0]['options']=[option(bid=.30,ask=.32,option_timestamp=None,payload_timestamp='second')]
            update(later,p);event=json.loads(Path(p).read_text())[0]
            self.assertEqual(event['entry_ask'],.25);self.assertEqual(event['markouts']['5']['gross_quote_change_per_contract'],5)
            self.assertFalse(event['markouts']['5']['timing_verified'])
