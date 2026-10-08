import copy
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from market_clock import ET
from relative_volume import same_time_rvol
from scanner import scan_one
from schema_normalizer import normalize


def stamp(day, slot='11:00'):
    return datetime.fromisoformat(f'{day}T{slot}').replace(tzinfo=ET)


def history(day='2026-10-08', prior=('2026-10-07','2026-10-06','2026-10-05','2026-10-02'), slot='11:00'):
    return [{'time':stamp(d,slot), 'volume':100, 'open':10, 'high':11, 'low':9, 'close':10}
            for d in prior]+[{'time':stamp(day,slot), 'volume':250, 'open':10, 'high':11, 'low':9, 'close':10}]


class RelativeVolumeTests(unittest.TestCase):
    def setUp(self):
        self.now=stamp('2026-10-08','11:06')

    def test_same_slot_mean_and_provenance(self):
        bars=history()+[{'time':stamp('2026-10-07','10:55'),'volume':90000}]
        result=same_time_rvol(bars,self.now,'test source')
        self.assertEqual(result['status'],'READY')
        self.assertEqual(result['ratio'],2.5)
        self.assertEqual(result['baseline_count'],4)
        self.assertEqual(result['source'],'test source')
        self.assertEqual(result['slot_et'],'11:00')
        self.assertEqual(result['bar_end'],stamp('2026-10-08','11:05').astimezone(timezone.utc).isoformat())

    def test_missing_slot_does_not_become_zero(self):
        result=same_time_rvol(history()[1:],self.now)
        self.assertEqual(result['ratio'],2.5)
        self.assertEqual(result['baseline_count'],3)
        self.assertEqual(result['missing_sessions'],['2026-10-07'])
        result=same_time_rvol(history()[2:],self.now)
        self.assertEqual(result['status'],'INSUFFICIENT_HISTORY')
        self.assertIsNone(result['ratio'])

    def test_duplicates_excluded_not_double_counted(self):
        bars=history();bars.extend(copy.deepcopy(bars[:2]))
        result=same_time_rvol(bars,self.now)
        self.assertEqual(result['baseline_count'],2)
        self.assertEqual(len(result['excluded_sessions']),2)
        self.assertIsNone(result['ratio'])
        bars=history();bars.append(copy.deepcopy(bars[-1]))
        self.assertEqual(same_time_rvol(bars,self.now)['status'],'INVALID_CURRENT_BAR')

    def test_bad_volume_and_interpolation_excluded(self):
        for value in (None,float('nan'),float('inf'),-1,True):
            bars=history();bars[0]['volume']=value
            result=same_time_rvol(bars,self.now)
            self.assertEqual(result['baseline_count'],3)
            bars[-1]['volume']=value
            self.assertEqual(same_time_rvol(bars,self.now)['status'],'INVALID_CURRENT_BAR')
        bars=history();bars[0]['interpolated']=True
        self.assertEqual(same_time_rvol(bars,self.now)['baseline_count'],3)

    def test_zero_baseline_unknown_but_zero_current_is_measured(self):
        bars=history()
        for b in bars[:-1]: b['volume']=0
        self.assertEqual(same_time_rvol(bars,self.now)['status'],'ZERO_BASELINE')
        bars=history();bars[-1]['volume']=0
        self.assertEqual(same_time_rvol(bars,self.now)['ratio'],0)

    def test_stale_and_incomplete_bars(self):
        self.assertEqual(same_time_rvol(history(),self.now+timedelta(minutes=9))['status'],'STALE')
        self.assertEqual(same_time_rvol(history(),stamp('2026-10-08','11:04'))['status'],'NO_COMPLETED_BAR')
        bars=history()+[{'time':stamp('2026-10-08','11:05'),'volume':999999}]
        self.assertEqual(same_time_rvol(bars,self.now)['ratio'],2.5)

    def test_premarket_after_hours_and_weekend_unknown(self):
        for day,slot in [('2026-10-08','09:00'),('2026-10-08','16:01'),('2026-10-10','11:00')]:
            self.assertEqual(same_time_rvol(history(),stamp(day,slot))['status'],'NOT_REGULAR_SESSION')

    def test_dst_compares_eastern_clock_not_utc(self):
        bars=history('2026-11-02',('2026-10-30','2026-10-29','2026-10-28','2026-10-27'))
        self.assertEqual(same_time_rvol(bars,stamp('2026-11-02','11:06'))['ratio'],2.5)

    def test_holiday_and_early_close_excluded(self):
        bars=history('2026-11-30',('2026-11-27','2026-11-25','2026-11-24','2026-11-23'),slot='14:00')
        bars.append({'time':stamp('2026-11-26','14:00'),'volume':99999})
        result=same_time_rvol(bars,stamp('2026-11-30','14:06'))
        self.assertEqual(result['ratio'],2.5)
        self.assertEqual(result['baseline_count'],3)
        self.assertEqual(result['excluded_sessions'],['2026-11-27'])

    def test_non_grid_bar_rejected_and_old_future_history_ignored(self):
        bars=history();bars[-1]['time']+=timedelta(seconds=1)
        self.assertEqual(same_time_rvol(bars,self.now)['status'],'INVALID_CURRENT_BAR')
        bars=history()+[{'time':stamp(d),'volume':99999} for d in ('2026-10-09','2025-10-08')]
        self.assertEqual(same_time_rvol(bars,self.now)['ratio'],2.5)

    def test_scanner_shadow_leaves_score_and_local_volume_unchanged(self):
        bars=history()+[{'time':stamp('2026-10-08','10:55'),'volume':80,'open':9,'high':10,'low':8,'close':9}]
        bars.sort(key=lambda b:b['time'])
        payload={'timestamp':[b['time'].timestamp() for b in bars],
                 'indicators':{'quote':[{k:[b[k] for b in bars] for k in ('open','high','low','close','volume')}]}}
        result=scan_one('TEST',self.now,payload)
        self.assertEqual(result['relative_volume_research']['ratio'],2.5)
        with patch('scanner.same_time_rvol',return_value={'status':'INSUFFICIENT_HISTORY'}):
            control=scan_one('TEST',self.now,payload)
        for key in ('score','volume_ratio','volume_acceleration','direction','trigger_price','baseline_ready'):
            self.assertEqual(result[key],control[key])

    def test_normalized_eligibility_and_scores_do_not_use_rvol(self):
        row={'ticker':'TEST','price':10,'direction':'UP','score':42,
             'bar_end':stamp('2026-10-08','11:05').isoformat(),
             'move_5m':.1,'recent_move':.1,'volume_ratio':.5,'volume_acceleration':.5}
        plain=normalize({'market_session':'OPEN','candidates':[copy.deepcopy(row)]},self.now)['candidates'][0]
        row['relative_volume_research']=same_time_rvol(history(),self.now)
        shadow=normalize({'market_session':'OPEN','candidates':[row]},self.now)['candidates'][0]
        self.assertEqual(shadow['relative_volume_research']['ratio'],2.5)
        for key in ('score','setup_qualified','setup_bucket','eligible_contracts','execution_readiness','early_watch'):
            self.assertEqual(plain.get(key),shadow.get(key))
