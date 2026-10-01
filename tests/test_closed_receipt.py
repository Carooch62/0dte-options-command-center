import json, os, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
import pipeline

class ClosedReceiptTest(unittest.TestCase):
    def test_closed_scan_records_request_and_preserves_snapshot(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'data').mkdir()
            snapshot=root/'data/market-dashboard.json';snapshot.write_text('{"scan_id":"last-good"}')
            (root/'data/scan-health.json').write_text(json.dumps({'request_id':'earlier-closed','status':'CLOSED','updated_at':'2026-10-01T00:00:00Z'}))
            with patch.object(pipeline,'ROOT',root),patch.object(pipeline,'session_info',return_value={'session':'CLOSED'}),patch.object(pipeline.subprocess,'run') as scan,patch.dict(os.environ,{'SCAN_REQUEST_ID':'closed-request','GITHUB_RUN_ID':'123'}):
                self.assertEqual(pipeline.run(),0)
                scan.assert_not_called()
            self.assertEqual(json.loads(snapshot.read_text())['scan_id'],'last-good')
            receipts=json.loads((root/'data/scan-receipts.json').read_text())
            self.assertEqual(receipts[0]['scan_id'],'earlier-closed')
            receipt=receipts[-1]
            self.assertEqual(receipt['scan_id'],'closed-request')
            self.assertEqual(receipt['status'],'CLOSED')
            self.assertIn('completed_at',receipt)
            self.assertNotIn('generated_at',receipt)
