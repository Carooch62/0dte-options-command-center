"""Synthetic chronology and frozen-level regressions, not market backtests."""
import copy
import unittest
from datetime import datetime, timedelta, timezone
from pattern_lifecycle import lifecycle
from test_pattern_research import bars

START = datetime(2026, 10, 19, 13, 30, tzinfo=timezone.utc)


def fixture():
    return [{**b, 'time': (START+timedelta(minutes=5*i)).isoformat()} for i, b in enumerate(bars())]


def append(source, high=10.15, low=10.06, close=10.12, volume=1000):
    stamp = datetime.fromisoformat(source[-1]['time'])+timedelta(minutes=5)
    source.append({'time': stamp.isoformat(), 'high': high, 'low': low, 'close': close, 'volume': volume})


def end(source):
    return (datetime.fromisoformat(source[-1]['time'])+timedelta(minutes=5)).isoformat()


class LifecycleTests(unittest.TestCase):
    def test_formation_freezes_levels_and_confirmation_requires_later_bar(self):
        source = fixture()
        before = copy.deepcopy(source)
        result = lifecycle(source, end(source))
        up = result['directions']['UP']
        self.assertEqual(up['state'], 'FORMING')
        self.assertEqual(up['trigger'], 10.08)
        self.assertEqual(up['formed_at'], end(source))
        self.assertIsNone(up['confirmed_at'])
        self.assertEqual(source, before)
        append(source)
        confirmed = lifecycle(source, end(source))['directions']['UP']
        self.assertEqual(confirmed['state'], 'CONFIRMED')
        self.assertEqual(confirmed['trigger'], up['trigger'])
        self.assertEqual(confirmed['invalidation'], up['invalidation'])
        self.assertGreater(confirmed['confirmed_at'], confirmed['formed_at'])

    def test_breakout_needs_close_and_volume_not_only_a_wick(self):
        for close, volume in ((10.07, 1000), (10.12, 599)):
            source = fixture(); append(source, close=close, volume=volume)
            self.assertEqual(lifecycle(source, end(source))['directions']['UP']['state'], 'FORMING')
        source=fixture();append(source, volume=600)
        self.assertEqual(lifecycle(source, end(source))['directions']['UP']['state'], 'CONFIRMED')

    def test_invalidation_and_ambiguous_bar_are_conservative(self):
        source=fixture();append(source, low=9.97)
        up=lifecycle(source,end(source))['directions']['UP']
        self.assertEqual(up['state'],'INVALIDATED')
        self.assertEqual(up['reason'],'BOTH_LEVELS_TOUCHED')
        self.assertIsNone(up['confirmed_at'])

    def test_retest_and_failed_breakout_keep_original_episode(self):
        source=fixture();append(source)
        append(source, high=10.13, low=10.075, close=10.10)
        up=lifecycle(source,end(source))['directions']['UP']
        self.assertEqual(up['state'],'CONFIRMED')
        self.assertEqual(up['retested_at'],end(source))
        append(source, high=10.12, low=10.02, close=10.05)
        up=lifecycle(source,end(source))['directions']['UP']
        self.assertEqual(up['state'],'INVALIDATED')
        self.assertEqual(up['reason'],'BREAKOUT_CLOSED_BACK_INSIDE')

    def test_setup_expires_after_six_subsequent_bars(self):
        source=fixture()
        for _ in range(7): append(source, high=10.08, low=10.02, close=10.06, volume=500)
        up=lifecycle(source,end(source))['directions']['UP']
        self.assertEqual(up['state'],'EXPIRED')

    def test_future_bar_cannot_rewrite_earlier_detection(self):
        source=fixture();cutoff=end(source)
        expected=lifecycle(source,cutoff,True)
        append(source, low=1, high=20, close=2)
        self.assertEqual(lifecycle(source,cutoff,True),expected)
        self.assertEqual(lifecycle(source,cutoff,True)['timeline'][0]['states']['UP'],'FORMING')

    def test_bad_timestamps_gaps_duplicates_and_values_withhold(self):
        for mode in ('gap','duplicate','naive','interpolated','bad_price','bool','zero_volume'):
            source=fixture()
            if mode=='gap':source.pop(4)
            if mode=='duplicate':source[4]['time']=source[3]['time']
            if mode=='naive':source[4]['time']='2026-10-19T13:50:00'
            if mode=='interpolated':source[4]['interpolated']=True
            if mode=='bad_price':source[4]['close']=float('nan')
            if mode=='bool':source[4]['volume']=True
            if mode=='zero_volume':source[4]['volume']=0
            self.assertEqual(lifecycle(source,end(source))['status'],'INVALID_HISTORY',mode)

    def test_downside_symmetry(self):
        source=fixture();append(source)
        mirror=[{**b,'high':20-b['low'],'low':20-b['high'],'close':20-b['close']} for b in source]
        down=lifecycle(mirror,end(mirror))['directions']['DOWN']
        up=lifecycle(source,end(source))['directions']['UP']
        self.assertEqual(down['state'],up['state'])
        self.assertEqual(down['confirmed_at'],up['confirmed_at'])
        self.assertAlmostEqual(down['trigger'],20-up['trigger'])

    def test_stale_history_and_unknown_cutoff(self):
        source=fixture()
        late=(datetime.fromisoformat(end(source))+timedelta(minutes=9)).isoformat()
        self.assertEqual(lifecycle(source,late)['status'],'STALE_HISTORY')
        self.assertEqual(lifecycle(source[:11],end(source[:11]))['status'],'INSUFFICIENT_HISTORY')
        with self.assertRaises(ValueError):lifecycle(source,'2026-10-19T14:30:00')

    def test_prefix_comparison_and_no_ranking_or_eligibility_effect(self):
        source=fixture();append(source)
        result=lifecycle(source,end(source),True)
        self.assertEqual(result['comparison']['evaluated_prefixes'],2)
        self.assertEqual(result['comparison']['confirmed_episodes'],1)
        self.assertEqual(result['comparison']['baseline_forming_observations']['UP'],1)
        self.assertEqual(result['ranking_effect'],result['eligibility_effect'],'NONE')
        self.assertEqual(result['directions']['UP']['trend_alignment'],'ALIGNED')

    def test_scanner_preserves_original_scores_triggers_and_pattern_fields(self):
        from unittest.mock import patch
        import scanner
        source=fixture();append(source)
        payload={'timestamp':[datetime.fromisoformat(b['time']).timestamp() for b in source],
                 'indicators':{'quote':[{k:[b['close'] if k=='open' else b[k] for b in source]
                                          for k in ('open','high','low','close','volume')}]}}
        now=datetime.fromisoformat(end(source))
        with patch.object(scanner,'pattern_lifecycle',return_value={}):
            baseline=scanner.scan_one('TEST',now,payload)
        actual=scanner.scan_one('TEST',now,payload)
        self.assertIsNotNone(actual)
        self.assertEqual(actual['pattern_research'].pop('lifecycle')['directions']['UP']['state'],'CONFIRMED')
        baseline['pattern_research'].pop('lifecycle')
        self.assertEqual(actual,baseline)


if __name__=='__main__':unittest.main()
