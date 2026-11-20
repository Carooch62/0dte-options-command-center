import json
import tempfile
import unittest
from pathlib import Path
from datetime import datetime, timezone, timedelta
from closing_capture import closing_window,collect

class ClosingCaptureTests(unittest.TestCase):
    def test_calendar_windows_cover_early_close_dst_and_holiday(self):
        for stamp,valid in [('2026-11-18T21:19:00+00:00',False),('2026-11-18T21:20:00+00:00',True),
                            ('2026-11-18T22:06:00+00:00',False),('2026-11-27T18:20:00+00:00',True),
                            ('2026-11-26T21:20:00+00:00',False),('2026-10-19T20:20:00+00:00',True)]:
            self.assertEqual(closing_window(datetime.fromisoformat(stamp)) is not None,valid)

    def test_capture_is_separate_idempotent_and_does_not_invent_final_bars(self):
        now=datetime(2026,11,18,21,20,tzinfo=timezone.utc)
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder,'market-dashboard.json')
            original=json.dumps({'scan_id':'before-close','generated_at':'2026-11-18T20:55:00Z','candidates':[{'ticker':'A'},{'ticker':'B'}]})
            source.write_text(original)
            def scan(t,n):return {'ticker':t,'price':10,'bar_end':'2026-11-18T21:00:00Z' if t=='A' else '2026-11-18T20:55:00Z'}
            result=collect(folder,now,scan)
            self.assertEqual(result['status'],'INCOMPLETE');self.assertEqual(result['final_bars'],1)
            self.assertEqual(source.read_text(),original)
            self.assertEqual(collect(folder,now,lambda *a:self.fail('duplicate fetch'))['status'],'ALREADY_CAPTURED')
            later=collect(folder,now+timedelta(minutes=15),lambda t,n:{'ticker':t,'bar_end':'2026-11-18T21:00:00Z'})
            self.assertEqual(later['status'],'FINAL_BARS_CAPTURED')
            self.assertEqual(len(list(Path(folder,'closing-evidence').glob('*.json'))),2)

    def test_stale_source_or_closed_day_does_not_fetch(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder,'market-dashboard.json').write_text(json.dumps({'generated_at':'2026-11-17T20:55:00Z'}))
            result=collect(folder,datetime(2026,11,18,21,20,tzinfo=timezone.utc),lambda *a:self.fail('stale source'))
            self.assertEqual(result['status'],'NO_SAME_SESSION_SOURCE')

    def test_after_hours_dashboard_uses_recorded_pre_close_cohort(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder,'market-dashboard.json').write_text(json.dumps({'generated_at':'2026-11-18T21:10:00Z','candidates':[{'ticker':'AFTER'}]}))
            Path(folder,'scan-history.json').write_text(json.dumps([{'scan_id':'intraday','generated_at':'2026-11-18T20:55:00Z','candidate_state':[{'ticker':'BEFORE'}]}]))
            fetched=[]
            def scan(t,n):
                fetched.append(t)
                return {'ticker':t,'bar_end':'2026-11-18T21:00:00Z'}
            result=collect(folder,datetime(2026,11,18,21,20,tzinfo=timezone.utc),scan)
            self.assertEqual(result['status'],'FINAL_BARS_CAPTURED')
            self.assertEqual(fetched,['BEFORE'])

    def test_late_recovery_uses_archive_original_clocks_and_actual_collection(self):
        import gzip
        from closing_capture import capture_session
        now=datetime.fromisoformat('2026-11-20T01:00:00+00:00')
        self.assertEqual(capture_session(now)['market_date'],'2026-11-19')
        with tempfile.TemporaryDirectory() as folder:
            archive=Path(folder,'archive','2026-11-19','scans');archive.mkdir(parents=True)
            with gzip.open(archive/'original.json.gz','wt') as f:
                json.dump({'scan_id':'original','generated_at':'2026-11-19T20:55:00Z','candidate_state':[{'ticker':'A'},{'ticker':'B'}]},f)
            calls=[]
            def scan(t,n):
                calls.append(n)
                if t=='B':raise RuntimeError('provider unavailable')
                return {'ticker':t,'bar_end':'2026-11-19T21:00:00Z'}
            self.assertEqual(collect(folder,now,scan)['status'],'INCOMPLETE')
            result=json.loads(Path(folder,'closing-evidence','2026-11-19.json').read_text())
            self.assertEqual(result['collection_mode'],'LATE_RECOVERY')
            self.assertEqual(result['collected_at'],now.isoformat())
            self.assertEqual(result['source_generated_at'],'2026-11-19T20:55:00Z')
            self.assertTrue(all(n==datetime.fromisoformat('2026-11-19T21:20:00+00:00') for n in calls))
            self.assertEqual(result['final_bars'],1)

    def test_recovery_bounds_and_non_sessions(self):
        from closing_capture import capture_session
        now=datetime.fromisoformat('2026-11-20T01:00:00+00:00')
        self.assertIsNone(capture_session(now,'2026-11-21'))
        self.assertIsNone(capture_session(now,'2026-11-01'))
        self.assertIsNone(capture_session(now,'2026-11-07'))
        self.assertIsNone(capture_session(datetime.fromisoformat('2026-11-20T16:00:00+00:00')))
        self.assertEqual(capture_session(datetime.fromisoformat('2026-11-28T01:00:00+00:00'))['market_date'],'2026-11-27')
