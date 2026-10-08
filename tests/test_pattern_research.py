import copy
import unittest
from pattern_research import pattern_snapshot, attach_early_watch
from schema_normalizer import normalize
from datetime import datetime, timezone


def bars():
    old=[{'high':10.2,'low':9.8,'close':10.,'volume':1000} for _ in range(6)]
    quiet=[{'high':10.08,'low':9.98+i*.005,'close':10.04+i*.005,'volume':500} for i in range(6)]
    return old+quiet


class PatternTests(unittest.TestCase):
    def test_up_compression(self):
        p=pattern_snapshot(bars(),'UP')
        self.assertEqual(p['status'],'READY')
        self.assertTrue(all(p[k] for k in ('range_compression','volume_dry_up','directional_structure','near_trigger')))

    def test_down_is_symmetric(self):
        reversed_bars=[{'high':20-b['low'],'low':20-b['high'],'close':20-b['close'],'volume':b['volume']} for b in bars()]
        p=pattern_snapshot(reversed_bars,'DOWN')
        self.assertTrue(p['directional_structure'])
        self.assertTrue(p['near_trigger'])

    def test_missing_or_invalid_history_unknown(self):
        self.assertIsNone(pattern_snapshot(bars()[:11],'UP')['range_compression'])
        for value in (None,float('nan'),0):
            sample=bars();sample[-1]['volume']=value
            self.assertEqual(pattern_snapshot(sample,'UP')['status'],'INVALID_HISTORY')
        sample=bars();sample[-1]['interpolated']=True
        self.assertEqual(pattern_snapshot(sample,'UP')['status'],'INVALID_HISTORY')

    def test_break_already_happened_not_early(self):
        sample=bars();sample[-1].update(high=10.2,close=10.1)
        self.assertFalse(pattern_snapshot(sample,'UP')['near_trigger'])

    def test_needs_fresh_catalyst_and_unconfirmed_setup(self):
        row={'pattern_research':pattern_snapshot(bars(),'UP'),'catalyst':True,'setup_qualified':False}
        attach_early_watch(row,True);self.assertTrue(row['early_watch'])
        for fresh,catalyst,qualified in [(False,True,False),(True,False,False),(True,True,True)]:
            row.update(catalyst=catalyst,setup_qualified=qualified)
            attach_early_watch(row,fresh);self.assertFalse(row['early_watch'])

    def test_shadow_does_not_change_normalized_scores_or_entry_gates(self):
        row={'ticker':'TEST','price':10.,'direction':'UP','score':42,'bar_end':'2026-10-08T15:00:00Z',
             'move_5m':.1,'recent_move':.1,'volume_ratio':.5,'volume_acceleration':.5,
             'news_items':[{'title':'TEST announces agreement','url':'https://example.com/TEST','age_hours':1}]}
        now=datetime(2026,10,8,15,1,tzinfo=timezone.utc)
        plain=normalize({'market_session':'OPEN','candidates':[copy.deepcopy(row)]},now)['candidates'][0]
        row['pattern_research']=pattern_snapshot(bars(),'UP')
        shadow=normalize({'market_session':'OPEN','candidates':[row]},now)['candidates'][0]
        self.assertTrue(shadow['early_watch'])
        for k in ('score','setup_qualified','setup_bucket','eligible_contracts','execution_readiness'):
            self.assertEqual(plain[k],shadow[k])
