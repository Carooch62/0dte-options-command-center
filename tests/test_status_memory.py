import unittest
from status_memory import attach_last_status


class StatusMemoryTests(unittest.TestCase):
    def snapshot(self, stamp='2026-09-30T19:57:00+00:00', state='TRIGGERED', session='OPEN', end='2026-09-30T19:55:00+00:00'):
        return {'generated_at':stamp,'market_session':session,'candidates':[{'ticker':'IWM','execution_state':state,'bar_end':end,'price_freshness':'RECENT'}]}

    def history(self, data):
        return {**data,'candidate_state':data['candidates']}

    def test_after_close_and_repeated_scans_keep_original_time(self):
        initial=self.snapshot()
        for stamp in ['2026-09-30T20:44:00+00:00','2026-10-01T12:00:00+00:00']:
            current=self.snapshot(stamp,'DATA UNAVAILABLE','AFTER HOURS')
            attach_last_status(current,[self.history(initial)])
            record=current['candidates'][0]['last_status']
            self.assertEqual(record['state'],'TRIGGERED')
            self.assertEqual(record['observed_at'],'2026-09-30T19:57:00+00:00')
            initial=current  # survives through the persisted metadata, not legacy recovery

    def test_new_regular_scan_updates_state_without_reusing_historical_signal(self):
        old=self.snapshot()
        current=self.snapshot('2026-10-01T13:37:00+00:00','WATCH','OPEN','2026-10-01T13:35:00+00:00')
        attach_last_status(current,[self.history(old)])
        self.assertEqual(current['candidates'][0]['last_status']['state'],'WATCH')
        self.assertEqual(current['candidates'][0]['last_status']['observed_at'],current['generated_at'])

    def test_stale_unknown_and_future_records_cannot_be_recovered(self):
        old=self.snapshot(end='2026-09-30T19:00:00+00:00')
        missing=self.snapshot();missing['candidates'][0].pop('bar_end')
        future=self.snapshot('2026-10-01T19:57:00+00:00',end='2026-10-01T19:55:00+00:00')
        current=self.snapshot('2026-09-30T20:44:00+00:00','DATA UNAVAILABLE','AFTER HOURS')
        attach_last_status(current,[self.history(d) for d in [old,missing,future]])
        self.assertIsNone(current['candidates'][0]['last_status'])

    def test_freshness_failure_keeps_last_status_but_not_execution_state(self):
        current=self.snapshot('2026-09-30T19:59:00+00:00','DATA UNAVAILABLE')
        attach_last_status(current,[self.history(self.snapshot())])
        self.assertEqual(current['candidates'][0]['last_status']['state'],'TRIGGERED')
        self.assertEqual(current['candidates'][0]['execution_state'],'DATA UNAVAILABLE')
