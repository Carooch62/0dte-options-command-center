import contextlib
import io
import json
import os
from pathlib import Path
import runpy
import unittest
from unittest.mock import patch

SCRIPT=Path(__file__).resolve().parents[1]/'scripts/capture_staging.py'

class StagingCaptureRequestTests(unittest.TestCase):
    def run_capture(self, expected, health_id, snapshot_id):
        records={
            'scan-health.json':{'stage':'VALIDATED','status':'SUCCESS','request_id':health_id},
            'market-dashboard.json':{'market_session':'OPEN','scan_id':snapshot_id},
        }
        env={} if expected is None else {'SCAN_REQUEST_ID':expected}
        with patch.dict(os.environ,env,clear=True),patch.object(Path,'read_text',lambda p:json.dumps(records[p.name])),patch('shadow_evidence.capture',return_value={}) as capture,patch('subprocess.check_output',return_value='test-commit'),contextlib.redirect_stdout(io.StringIO()):
            runpy.run_path(str(SCRIPT),run_name='__main__')
        return capture

    def test_missing_empty_and_mismatched_request_ids_never_capture(self):
        for ids in [(None,None,None),('','',''),('new','old','old'),('new','new','old')]:
            with self.subTest(ids=ids):self.run_capture(*ids).assert_not_called()

    def test_matching_nonempty_request_captures_once(self):
        self.run_capture('new','new','new').assert_called_once_with('data',source_commit='test-commit')
