import copy
import unittest
from component_scoring import RUBRIC, score_candidate, gate_reasons
from news_research import clock

NOW='2026-10-12T15:00:00+00:00'
def fixture():
    evidence={'observed_at':NOW,'available_at':NOW,'source':'synthetic fixture','evidence':'Synthetic test only'}
    return {'candidate_id':'test-contract',
            'eligibility_evidence':{k:{**evidence,'passed':True,'policy_version':'synthetic'} for k in ('liquidity','risk')},
            'component_reviews':{k:{'candidate_id':'test-contract','dimensions':{d:{**evidence,'rating':2} for d in dims}} for k,dims in RUBRIC.items()}}

class ComponentTests(unittest.TestCase):
    def test_neutral_math_and_no_mutation(self):
        row=fixture(); before=copy.deepcopy(row); result=score_candidate(row,NOW)
        self.assertEqual(result['component_scoring']['status'],'COMPLETE')
        self.assertEqual([c['score'] for c in result['research_components'].values()],[50]*5)
        self.assertEqual(row,before)
    def test_missing_future_identity_bool_and_nan_withheld(self):
        for mode in ('missing','future','identity','bool','nan'):
            row=fixture(); dim=row['component_reviews']['news']['dimensions']['directional_support']
            if mode=='missing':dim.pop('evidence')
            if mode=='future':dim['available_at']='2026-10-12T15:00:01+00:00'
            if mode=='identity':row['component_reviews']['news']['candidate_id']='another-contract'
            if mode=='bool':dim['rating']=True
            if mode=='nan':dim['rating']=float('nan')
            result=score_candidate(row,NOW)
            self.assertNotIn('news',result['research_components'])
            self.assertEqual(result['component_scoring']['status'],'WITHHELD')
    def test_gates_cannot_be_overridden_by_scores_or_boolean(self):
        row=fixture();row['eligibility_passed']=True
        row['eligibility_evidence']['liquidity']['passed']=False
        result=score_candidate(row,NOW)
        self.assertFalse(result['eligibility_passed'])
        self.assertTrue(gate_reasons(result,clock(NOW)))
    def test_asof_and_temporal_order(self):
        with self.assertRaises(ValueError):score_candidate(fixture(),'2026-10-12T15:00:00')
        row=fixture();row['component_reviews']['patterns']['dimensions']['setup_structure']['observed_at']='2026-10-12T15:01:00+00:00'
        self.assertNotIn('patterns',score_candidate(row,NOW)['research_components'])
    def test_reviewed_input_replays_and_failed_gate_excludes_both_arms(self):
        from shadow_replay import replay
        from fixed_release_fixtures import row as news_row, NOW as news_now
        candidate=fixture(); candidate.update(news_row());candidate['candidate_id']='test-contract'
        candidate['component_reviews']['news']['event_ids']=['contract-1']
        for review in candidate['component_reviews'].values():
            for dim in review['dimensions'].values():
                dim['observed_at']=dim['available_at']=news_now.isoformat()
        for gate in candidate['eligibility_evidence'].values():
            gate['observed_at']=gate['available_at']=news_now.isoformat()
        result=replay({'as_of':news_now.isoformat(),'candidates':[candidate]})
        self.assertEqual(len(result['scored']),1)
        self.assertEqual(result['scored'][0]['reference_score'],50)
        candidate['eligibility_evidence']['risk']['passed']=False
        self.assertEqual(replay({'as_of':news_now.isoformat(),'candidates':[candidate]})['scored'],[])
