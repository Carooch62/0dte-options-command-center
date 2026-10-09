import unittest
from unittest.mock import patch
import scanner
from schema_normalizer import normalize
from test_confirmation_qualification import fixtures, NOW


class NewsCoverageTests(unittest.TestCase):
    def test_rotation_reaches_quiet_names_within_budget(self):
        rows=[{'ticker':f'T{i:03}', 'score':200-i} for i in range(200)]
        seen=set()
        for slot in range(16):
            selected=scanner.select_news_candidates(rows,offset=slot)
            self.assertEqual(len(selected),50)
            self.assertEqual(len({r['ticker'] for r in selected}),50)
            self.assertEqual(selected[:40],rows[:40])
            seen.update(r['ticker'] for r in selected)
        self.assertEqual(seen,{r['ticker'] for r in rows})

    def test_small_universe_and_zero_budget(self):
        rows=[{'ticker':'TEST','score':1}]
        self.assertEqual(scanner.select_news_candidates(rows),rows)
        self.assertEqual(scanner.select_news_candidates(rows,budget=0),[])
        self.assertEqual(scanner.select_news_candidates([],budget=0),[])

    def test_empty_success_failure_and_malformed_responses_are_distinct(self):
        with patch.object(scanner,'request_json',return_value={'news':[]}):
            self.assertEqual(scanner.news('TEST')['status'],'SUCCESS')
        for payload in ({}, {'news':None}, {'news':[None]}):
            with self.subTest(payload=payload),patch.object(scanner,'request_json',return_value=payload):
                self.assertEqual(scanner.news('TEST')['status'],'SOURCE_FAILURE')
        with patch.object(scanner,'request_json',side_effect=RuntimeError('offline')):
            self.assertEqual(scanner.news('TEST')['status'],'SOURCE_FAILURE')

    def test_collection_preserves_status_and_check_time(self):
        rows=[{'ticker':'EMPTY'},{'ticker':'FAIL'},{'ticker':'EVENT'}]
        event={'title':'EVENT wins contract','providerPublishTime':scanner.time.time()-60}
        results={'EMPTY':{'status':'SUCCESS','items':[]},
                 'FAIL':{'status':'SOURCE_FAILURE','items':[]},
                 'EVENT':{'status':'SUCCESS','items':[event]}}
        with patch.object(scanner,'news',side_effect=lambda t:results[t]):
            scanner.add_news(rows)
        self.assertEqual([r['news_status'] for r in rows],['SUCCESS','SOURCE_FAILURE','SUCCESS'])
        self.assertTrue(all(r['news_checked_at'] for r in rows))
        self.assertTrue(rows[2]['catalyst'])

    def test_unknown_coverage_never_passes_or_claims_absence(self):
        for status in ('NOT_SCANNED','SOURCE_FAILURE',None):
            with self.subTest(status=status):
                data,_=fixtures('call')
                row=data['candidates'][0]
                row.update(news_status=status,news_items=[])
                row=normalize(data,NOW)['candidates'][0]
                self.assertIsNone(row['qualification_checks']['catalyst_confirmed'])
                self.assertEqual(row['catalyst_level'],'UNKNOWN')
                self.assertFalse(row['setup_qualified'])

    def test_failed_status_cannot_reuse_old_headlines(self):
        data,_=fixtures('call')
        data['candidates'][0]['news_status']='SOURCE_FAILURE'
        row=normalize(data,NOW)['candidates'][0]
        self.assertFalse(row['catalyst'])
        self.assertFalse(row['setup_qualified'])

    def test_success_distinguishes_no_catalyst_from_recognized_event(self):
        for has_event in (False,True):
            with self.subTest(has_event=has_event):
                data,_=fixtures('call')
                row=data['candidates'][0]
                row['news_status']='SUCCESS'
                if not has_event:row['news_items']=[]
                row=normalize(data,NOW)['candidates'][0]
                self.assertIs(row['qualification_checks']['catalyst_confirmed'],has_event)
                self.assertIs(row['setup_qualified'],has_event)


if __name__=='__main__':unittest.main()
