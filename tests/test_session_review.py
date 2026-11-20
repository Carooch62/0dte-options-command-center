import gzip
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from scripts.freeze_session_review import freeze

class SessionReviewTests(unittest.TestCase):
    def test_manifest_preserves_original_clocks_hashes_and_missing_execution_evidence(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder,'archive','2026-11-19','scans','original.json.gz');path.parent.mkdir(parents=True)
            raw=json.dumps({'scan_id':'original','generated_at':'2026-11-19T15:00:00Z','candidate_state':[{'ticker':'IWM','execution_state':'WATCH'},{'ticker':'OTHER'}]}).encode()
            compressed=gzip.compress(raw);path.write_bytes(compressed)
            result=freeze(folder,['2026-11-19'])
            self.assertEqual(len(result['rows']),1)
            self.assertEqual(result['rows'][0]['source_sha256'],hashlib.sha256(raw).hexdigest())
            self.assertEqual(result['rows'][0]['generated_at'],'2026-11-19T15:00:00Z')
            self.assertNotIn('bar_end',result['rows'][0]['stock'])
            self.assertEqual(result['rows'][0]['entry_link_status'],'UNLINKED_NO_VERIFIED_FILL_CLOCK')
            self.assertEqual(path.read_bytes(),compressed)
