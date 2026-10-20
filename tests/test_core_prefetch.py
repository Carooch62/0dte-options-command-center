import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import scanner
import option_expander
import core_0dte

class CorePrefetchTests(unittest.TestCase):
    def test_core_requests_share_existing_pool_and_are_not_repeated(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'data').mkdir()
            rows=[{'ticker':'X'+str(n),'score':n,'chain_attempted':False} for n in range(80)]
            rows += [{'ticker':ticker,'score':-1,'chain_attempted':False} for ticker in scanner.CORE_TICKERS]
            (root/'data/market.json').write_text(json.dumps({'candidates':rows,'universe_size':len(rows)}))
            calls=[]
            def fetch(selected):
                calls.append([x['ticker'] for x in selected])
                for x in selected:
                    x.update(chain_attempted=True,chain_status='NO_EXPIRATION_TODAY')
            original=Path.cwd()
            try:
                os.chdir(root)
                with patch.object(scanner,'scan_options',side_effect=fetch):
                    option_expander.main()
                    first=json.loads((root/'data/market.json').read_text())
                    core_0dte.main()
            finally:
                os.chdir(original)
            self.assertEqual(first['option_expansion']['additional_attempted'],70)
            self.assertEqual(len(calls[0]),70+first['option_expansion']['core_prefetch_attempted'])
            self.assertEqual(len(set(calls[0])),len(calls[0]))
            self.assertTrue(set(scanner.CORE_TICKERS).issubset(calls[0]))
            self.assertEqual(calls[1],[])
            output=json.loads((root/'data/market.json').read_text())
            self.assertEqual(output['core_missing'],[])
            self.assertEqual(output['coverage']['chains_attempted'],len(calls[0]))

    def test_existing_attempts_including_failures_are_not_retried_or_reclassified(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'data').mkdir()
            rows=[{'ticker':ticker,'score':0,'chain_attempted':True,'chain_status':'SOURCE_FAILURE'} for ticker in scanner.CORE_TICKERS]
            (root/'data/market.json').write_text(json.dumps({'candidates':rows,'universe_size':len(rows)}))
            original=Path.cwd()
            try:
                os.chdir(root)
                with patch.object(scanner,'scan_options') as fetch:
                    option_expander.main()
                    core_0dte.main()
            finally:
                os.chdir(original)
            self.assertTrue(all(call.args[0]==[] for call in fetch.call_args_list))
            output=json.loads((root/'data/market.json').read_text())
            self.assertTrue(all(x['chain_status']=='SOURCE_FAILURE' for x in output['candidates']))
            self.assertEqual(output['option_expansion']['core_prefetch_attempted'],0)
