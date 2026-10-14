"""Admission rules tested independently of calendar or market-data packages."""
import copy
import unittest
from unittest.mock import patch
from component_scoring import RUBRIC, VERSION, score_candidate
from news_research import REFERENCE
from shadow_replay import replay
NOW='2026-10-14T15:00:00+00:00'
def reviewed():
    evidence={'observed_at':NOW,'available_at':NOW,'source':'synthetic fixture','evidence':'Synthetic admission check only'}
    return {'candidate_id':'TEST:2026-10-16:call:100','eligibility_evidence':{k:{**evidence,'passed':True,'policy_version':'synthetic'} for k in ('liquidity','risk')},'component_reviews':{k:{'candidate_id':'TEST:2026-10-16:call:100','dimensions':{d:{**evidence,'rating':2} for d in dims}} for k,dims in RUBRIC.items()}}
def run(row):
    with patch('shadow_replay.evaluate',return_value={'status':'ASSESSED','proposed_weights':REFERENCE,'allocation_policy':'synthetic'}):
        return replay({'as_of':NOW,'candidates':[row]})
class ShadowAdmissionTests(unittest.TestCase):
    def test_actual_review_time_cannot_be_backdated_by_dimension_clocks(self):
        row=reviewed();row['reviewed_at']='2026-10-14T15:00:01+00:00'
        self.assertIn('REVIEW_AFTER_CUTOFF_OR_UNKNOWN',run(row)['withheld'][0]['reasons'])
        row['reviewed_at']='2026-10-14T14:59:59+00:00'
        self.assertIn('REVIEW_PRECEDES_COMPONENT_EVIDENCE',run(row)['withheld'][0]['reasons'])
    def test_precomputed_rubric_label_cannot_replace_missing_reviews(self):
        row=score_candidate(reviewed(),NOW);row.pop('component_reviews');before=copy.deepcopy(row);r=run(row)
        self.assertEqual(r['scored'],[]);self.assertIn('RUBRIC_REVIEWS_REQUIRED',r['withheld'][0]['reasons']);self.assertEqual(row,before)
    def test_exported_reviewed_row_is_recomputed_instead_of_trusting_scores(self):
        row=score_candidate(reviewed(),NOW)
        for component in row['research_components'].values():component['score']=100
        self.assertEqual(run(row)['scored'][0]['reference_score'],50)
    def test_incomplete_or_future_reviews_cannot_be_rescued_by_saved_scores(self):
        for future in (False,True):
            row=score_candidate(reviewed(),NOW);dim=row['component_reviews']['news']['dimensions']['novelty']
            if future:dim['available_at']='2026-10-14T15:00:01+00:00'
            else:dim.pop('evidence')
            self.assertEqual(run(row)['scored'],[])
    def test_legacy_fixtures_remain_separate_but_labels_must_be_real_strings(self):
        row={'candidate_id':'test','eligibility_passed':True,'research_components':{k:{'score':50,'available_at':NOW,'source':'synthetic fixture','method_version':'synthetic-v1'} for k in REFERENCE}}
        self.assertEqual(len(run(row)['scored']),1)
        for field in ('source','method_version'):
            for value in (True,17,'   '):
                invalid=copy.deepcopy(row);invalid['research_components']['news'][field]=value;self.assertEqual(run(invalid)['scored'],[])
