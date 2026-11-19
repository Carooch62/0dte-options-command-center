import json
import tempfile
import unittest
from pathlib import Path
from datetime import datetime, timezone
from shadow_evidence import capture
from scripts.staging_session_gate import collection_open
from session_research import session_context

class StagingCollectionTests(unittest.TestCase):
    def test_calendar_gate_rejects_holiday_opening_partial_and_early_close(self):
        for stamp,valid in [('2026-11-18T14:34:00+00:00',False),('2026-11-18T14:35:00+00:00',True),
                            ('2026-11-26T15:00:00+00:00',False),('2026-11-27T18:00:00+00:00',False)]:
            self.assertEqual(collection_open(datetime.fromisoformat(stamp)),valid)

    def test_collector_rejects_stale_closed_or_unisolated_data(self):
        with tempfile.TemporaryDirectory() as folder:
            data=Path(folder)
            (data/'staging-environment.json').write_text('{"environment":"production"}')
            with self.assertRaises(ValueError):capture(data,'2026-11-18T15:01:00Z')
            (data/'staging-environment.json').write_text('{"environment":"staging"}')
            base={'scan_id':'test','generated_at':'2026-11-18T15:00:00Z','market_session':'OPEN','candidates':[]}
            for changed,at in [({'market_session':'AFTER HOURS'},'2026-11-18T15:01:00Z'),({},'2026-11-18T15:09:00Z'),({},'2026-11-18T21:01:00Z')]:
                (data/'market-dashboard.json').write_text(json.dumps({**base,**changed}))
                with self.assertRaises(ValueError):capture(data,at)

    def test_control_cohort_clocks_and_selection_policy_survive_capture(self):
        with tempfile.TemporaryDirectory() as folder:
            data=Path(folder);(data/'staging-environment.json').write_text('{"environment":"staging"}')
            snapshot={'scan_id':'test','generated_at':'2026-11-18T15:00:00Z','market_session':'OPEN','news_selection':{'arm':'TOP50'},'candidates':[{'ticker':'TEST','execution_state':'PASS','research_context':{'first_hour':True},'pattern_research':{'status':'INSUFFICIENT_HISTORY'}}]}
            (data/'market-dashboard.json').write_text(json.dumps(snapshot))
            self.assertEqual(capture(data,'2026-11-18T15:01:00Z')['status'],'CAPTURED')
            result=json.loads((data/'shadow-evidence-latest.json').read_text())
            self.assertEqual(result['candidate_controls'][0]['ticker'],'TEST')
            self.assertEqual(result['news_selection']['arm'],'TOP50')
            self.assertEqual(capture(data,'2026-11-18T15:02:00Z')['status'],'ALREADY_CAPTURED')

    def test_time_window_labels_use_source_bar_in_both_dst_offsets(self):
        for start,op in [('2026-11-18T18:00:00Z','2026-11-18T14:30:00Z'),('2026-10-19T17:00:00Z','2026-10-19T13:30:00Z')]:
            context=session_context(start,op)
            self.assertTrue(context['window_1300_1400_et']);self.assertFalse(context['first_hour'])
            self.assertEqual(context['event_day'],'UNKNOWN')
