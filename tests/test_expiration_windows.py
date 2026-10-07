import copy
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch
import scanner
from schema_normalizer import normalize

class ExpirationWindowsTests(unittest.TestCase):
    def test_chain_retains_boundaries_but_preserves_same_day_state(self):
        now=datetime.now(scanner.ET)
        rows=[]
        for days in [-1,0,1,7,8,14,15,31,32]:
            exp=(now+timedelta(days=days)).strftime('%y%m%d')
            rows.append({'option':f'TEST{exp}C00100000','bid':.19,'ask':.21,'delta':.45 if days<=14 else .75,'gamma':.1,'volume':100})
        with patch.object(scanner,'request_json',return_value={'data':{'options':rows}}):
            result=scanner.fetch_cboe('TEST')
        self.assertEqual([o['dte'] for o in result['contracts']],[0,1,7,8,14,15,31])
        x={'ticker':'TEST','price':100,'direction':'UP'}
        scanner.enrich_options(x,result)
        same=copy.deepcopy(x)
        same.pop('expiry_groups')
        baseline={'ticker':'TEST','price':100,'direction':'UP'}
        scanner.enrich_options(baseline,{**result,'contracts':[o for o in result['contracts'] if o['dte']==0]})
        baseline.pop('expiry_groups')
        self.assertEqual(same,baseline)
        normalize({'candidates':[x],'market_session':'OPEN'},now)
        for key,days in [('week',[1,7]),('two_weeks',[8,14]),('month',[15,31])]:
            self.assertEqual([o['dte'] for o in x['expiry_groups'][key]['eligible_contracts']],days)
        self.assertEqual(len(x['eligible_contracts']),1)

    def test_future_only_is_not_a_zero_dte_chain_and_missing_delta_fails(self):
        now=datetime.now(scanner.ET)
        row={'option':f"TEST{(now+timedelta(days=7)).strftime('%y%m%d')}C00100000",'bid':.19,'ask':.21,'volume':100}
        with patch.object(scanner,'request_json',return_value={'data':{'options':[row]}}):result=scanner.fetch_cboe('TEST')
        self.assertEqual(result['status'],'NO_EXPIRATION_TODAY')
        x={'ticker':'TEST','price':100,'direction':'UP'}
        scanner.enrich_options(x,result)
        normalize({'candidates':[x]},now)
        self.assertFalse(x['zero_dte'])
        self.assertEqual(x['expiry_groups']['week']['chain_status'],'SUCCESS')
        self.assertEqual(x['expiry_groups']['week']['eligible_contracts'],[])
        self.assertEqual(x['expiry_groups']['month']['chain_status'],'NO_EXPIRATION_IN_WINDOW')

    def test_future_contract_must_match_calendar_date_and_direction(self):
        now=datetime.now(scanner.ET)
        option={'expiry':(now+timedelta(days=8)).date().isoformat(),'dte':7,'side':'call','strike':100,'bid':.19,'ask':.21,'delta':.4,'delta_verified':True,'volume':100}
        x={'ticker':'TEST','price':100,'direction':'DOWN','expiry_groups':{'week':{'options':[option]}}}
        normalize({'candidates':[x]},now)
        self.assertEqual(x['expiry_groups']['week']['eligible_contracts'],[])
        self.assertFalse(option['expiry_verified'])
        self.assertFalse(option['direction_aligned'])
