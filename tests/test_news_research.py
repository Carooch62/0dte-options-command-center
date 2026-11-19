import copy
import json
import tempfile
import unittest
from pathlib import Path
from datetime import datetime, timezone, timedelta
from news_research import select_news

class NewsResearchTests(unittest.TestCase):
    rows = [{'ticker': f'T{i:03}', 'score': 200-i} for i in range(100)]

    def test_production_cannot_activate_experiment_without_staging_marker(self):
        with tempfile.TemporaryDirectory() as folder:
            original = copy.deepcopy(self.rows)
            selected, policy = select_news(self.rows, data_dir=folder)
            self.assertEqual(selected, self.rows[:50])
            self.assertEqual(policy['policy'], 'production-top50')
            self.assertEqual(self.rows, original)

    def test_equal_budgets_and_fixed_session_assignment_with_rotating_remainder(self):
        arms=set()
        with tempfile.TemporaryDirectory() as folder:
            Path(folder,'staging-environment.json').write_text(json.dumps({'environment':'staging'}))
            for day in range(2,20):
                now=datetime(2026,11,day,15,tzinfo=timezone.utc)
                selected,policy=select_news(self.rows,now,folder)
                later,p2=select_news(self.rows,now+timedelta(minutes=15),folder)
                arms.add(policy['arm'])
                self.assertEqual(len(selected),50)
                self.assertEqual(len({r['ticker'] for r in selected}),50)
                self.assertEqual(policy['arm'],p2['arm'])
                if policy['arm']=='TOP40_ROTATE10':
                    self.assertEqual(selected[:40],self.rows[:40])
                    self.assertNotEqual(selected[40:],later[40:])
            self.assertEqual(arms,{'TOP50','TOP40_ROTATE10'})

    def test_small_universe_has_no_duplicates_and_does_not_claim_extra_searches(self):
        with tempfile.TemporaryDirectory() as folder:
            for count in (0,1,40,50):
                selected,_=select_news(self.rows[:count],data_dir=folder)
                self.assertEqual(selected,self.rows[:count])
