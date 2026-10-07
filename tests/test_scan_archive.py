import gzip
import json
import tempfile
import unittest
from pathlib import Path
from scan_archive import archive_research, day_of

class ArchiveTests(unittest.TestCase):
    def test_rollover_retains_scans_and_updates_markouts(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); dest=root/'archive'
            scan={'scan_id':'a','generated_at':'2026-10-06T00:05:00Z','candidate_state':[{'ticker':'ABC','rank':1,'future_return':999}]}
            event={'scan_id':'a','contract_id':'x','observed_at':'2026-10-05T19:00:00Z','markouts':{}}
            (root/'scan-history.json').write_text(json.dumps([scan]))
            (root/'option-observations.json').write_text(json.dumps([event]))
            archive_research(root,dest); archive_research(root,dest)
            self.assertEqual(len(list(dest.glob('2026-10-05/scans/*'))),1)
            event['markouts']={'5':{'exit_bid':.2}}
            (root/'scan-history.json').write_text('[]')
            (root/'option-observations.json').write_text(json.dumps([event]))
            archive_research(root,dest)
            (root/'option-observations.json').write_text('[]')
            archive_research(root,dest)
            archived=json.loads(gzip.decompress((dest/'2026-10-05/option-observations.json.gz').read_bytes()))
            self.assertEqual(archived[0]['markouts']['5']['exit_bid'],.2)
            self.assertEqual(len(list(dest.glob('*/scans/*'))),1)
            index=json.loads((dest/'2026-10-05/brokerage-scans.json').read_text())['snapshots']
            self.assertEqual(index[0]['candidate_state'],[{'ticker':'ABC','rank':1}])
            self.assertEqual(len(index),1)

    def test_naive_timestamp_is_not_silently_interpreted(self):
        with self.assertRaises(ValueError):day_of('2026-10-05T16:00:00')
