import gzip
import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from scan_archive import archive_research, write_gzip

spec = importlib.util.spec_from_file_location('prepare_scan_checkout', Path(__file__).resolve().parents[1] / 'scripts/prepare_scan_checkout.py')
checkout = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checkout)
NOW = datetime(2026, 10, 20, 14, tzinfo=timezone.utc)

class CheckoutTests(unittest.TestCase):
    def git(self, root, *args):
        return subprocess.run(['git', *args], cwd=root, check=True, capture_output=True, text=True).stdout.strip()

    def test_sparse_hydration_preserves_rolled_off_evidence_and_unrelated_tree(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            data = root / 'data'
            data.mkdir()
            retained = {'scan_id':'retained', 'generated_at':'2026-10-19T14:00:00Z', 'candidate_state':[]}
            rolled = {'scan_id':'rolled', 'generated_at':'2026-10-19T13:00:00Z', 'candidate_state':[]}
            (data/'scan-history.json').write_text(json.dumps([retained]))
            obs = {'scan_id':'retained', 'contract_id':'T', 'observed_at':'2026-10-18T14:00:00Z', 'markouts':{}}
            old = {**obs, 'scan_id':'old'}
            (data/'option-observations.json').write_text(json.dumps([obs]))
            (root/'scanner.py').write_text('# fixture')
            for day in ('2026-10-17', '2026-10-20'):
                write_gzip(data/'archive'/day/'scans'/'old.json.gz', rolled)
            write_gzip(data/'archive/2026-10-19/scans/old.json.gz', rolled)
            write_gzip(data/'archive/2026-10-18/option-observations.json.gz', [old])
            self.git(root, 'init', '-q')
            self.git(root, 'add', '.')
            self.git(root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-qm', 'fixture')
            untouched = self.git(root, 'rev-parse', 'HEAD:data/archive/2026-10-17/scans/old.json.gz')
            subprocess.run(['git','sparse-checkout','set','--no-cone','--stdin'], input='\n'.join(checkout.BASE_PATTERNS)+'\n', text=True, cwd=root, check=True, capture_output=True)
            self.assertFalse((data/'archive/2026-10-19/scans/old.json.gz').exists())
            self.assertEqual(checkout.hydrate(root, NOW), ['2026-10-18','2026-10-19','2026-10-20'])
            self.assertFalse((data/'archive/2026-10-17/scans/old.json.gz').exists())
            self.assertTrue((root/'scanner.py').exists())
            self.assertTrue((data/'archive/2026-10-20/scans/old.json.gz').exists())
            archive_research(data, data/'archive')
            index = json.loads((data/'archive/2026-10-19/brokerage-scans.json').read_text())
            self.assertEqual({s['scan_id'] for s in index['snapshots']}, {'rolled','retained'})
            events = json.loads(gzip.decompress((data/'archive/2026-10-18/option-observations.json.gz').read_bytes()))
            self.assertEqual({e['scan_id'] for e in events}, {'old','retained'})
            self.git(root, 'add', 'data/')
            self.assertEqual(self.git(root, 'ls-files', '--deleted'), '')
            self.git(root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-qm', 'update')
            self.assertEqual(self.git(root, 'rev-parse', 'HEAD:data/archive/2026-10-17/scans/old.json.gz'), untouched)

    def test_bad_evidence_aborts_before_changing_checkout(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); (root/'data').mkdir()
            (root/'data/scan-history.json').write_text('[{"generated_at":"2026-10-19T12:00:00"}]')
            with patch.object(checkout.subprocess, 'run') as run:
                with self.assertRaises(ValueError):
                    checkout.hydrate(root, NOW)
                run.assert_not_called()

    def test_unchanged_archives_and_indexes_are_not_rewritten(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            scan = {'scan_id':'a','generated_at':'2026-10-19T14:00:00Z','candidate_state':[]}
            event = {'scan_id':'a','contract_id':'T','observed_at':'2026-10-19T14:00:00Z','markouts':{}}
            (root/'scan-history.json').write_text(json.dumps([scan]))
            (root/'option-observations.json').write_text(json.dumps([event]))
            archive_research(root, root/'archive')
            paths = list((root/'archive').rglob('*'))
            paths = [p for p in paths if p.is_file()]
            for path in paths:
                os.utime(path, ns=(123456789000,123456789000))
            archive_research(root, root/'archive')
            self.assertTrue(all(p.stat().st_mtime_ns == 123456789000 for p in paths))
            event['markouts'] = {'5':{'exit_bid':0.20}}
            (root/'option-observations.json').write_text(json.dumps([event]))
            archive_research(root, root/'archive')
            updated = json.loads(gzip.decompress((root/'archive/2026-10-19/option-observations.json.gz').read_bytes()))
            self.assertEqual(updated[0]['markouts'], event['markouts'])
