import gzip
import json
import tempfile
import unittest
from pathlib import Path
from ml_readiness import audit

class ReadinessTests(unittest.TestCase):
    def test_deduplicates_history_and_keeps_missing_quote_time_unknown(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); archive = root/'archive/2026-10-06'; archive.mkdir(parents=True)
            row = {'scan_id':'one','contract_id':'ABC','market_date':'2026-10-06','quote_timestamp':None,'source_timestamp':'2026-10-06T15:00:00Z','markouts':{}}
            (archive/'option-observations.json.gz').write_bytes(gzip.compress(json.dumps([row]).encode()))
            (root/'option-observations.json').write_text(json.dumps([row]))
            result = audit(root)
            self.assertEqual(result['observations'],1)
            self.assertEqual(result['sessions']['2026-10-06']['quote_timed'],0)
            self.assertFalse(result['ml_ready'])
            self.assertEqual(result['sessions_with_timed_entry_and_followup'],[])
    def test_bad_sources_are_reported_not_silently_counted_as_complete(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder,'option-observations.json').write_text('broken')
            result = audit(folder)
            self.assertEqual(len(result['source_failures']),1)
            self.assertFalse(result['ml_ready'])
