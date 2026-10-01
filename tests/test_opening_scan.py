import json, os, tempfile, unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
import pipeline

class OpeningScanTest(unittest.TestCase):
    def run_at(self, minute):
        now=datetime(2026,10,1,13,minute,tzinfo=timezone.utc)
        class Clock(datetime):
            @classmethod
            def now(cls, tz=None): return now
        return patch.object(pipeline,'datetime',Clock)

    def test_opening_wait_preserves_snapshot_and_records_request(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'data').mkdir()
            snapshot=root/'data/market-dashboard.json';snapshot.write_text('last-good')
            with patch.object(pipeline,'ROOT',root),self.run_at(33),patch.object(pipeline.subprocess,'run') as scan,patch.dict(os.environ,{'SCAN_REQUEST_ID':'opening','GITHUB_RUN_ID':'123'}):
                self.assertEqual(pipeline.run(),0)
                scan.assert_not_called()
            self.assertEqual(snapshot.read_text(),'last-good')
            health=json.loads((root/'data/scan-health.json').read_text())
            self.assertEqual(health['status'],'WAITING_FOR_BAR')
            self.assertEqual(health['retry_after'],'2026-10-01T13:35:00+00:00')
            receipt=json.loads((root/'data/scan-receipts.json').read_text())[-1]
            self.assertEqual(receipt['scan_id'],'opening')
            self.assertEqual(receipt['status'],'WAITING_FOR_BAR')
            self.assertNotIn('generated_at',receipt)

    def test_scan_runs_at_first_completed_bar_and_real_failures_still_fail(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(pipeline,'ROOT',Path(folder)),self.run_at(35),patch.object(pipeline.subprocess,'run',side_effect=RuntimeError('source failed')) as scan:
                self.assertEqual(pipeline.run(),1)
                scan.assert_called_once()
            self.assertEqual(json.loads((Path(folder)/'data/scan-health.json').read_text())['status'],'FAILED')
