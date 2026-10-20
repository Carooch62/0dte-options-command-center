import copy
import unittest
from datetime import timedelta
from news_research import REFERENCE
from shadow_replay import replay
from test_news_research import row, NOW


def candidate(ident, news, patterns):
    r = row()
    r.update(candidate_id=ident, eligibility_passed=True,
             research_components={k:{'score':50,'available_at':NOW.isoformat(),
                'source':'synthetic fixture', 'method_version':'synthetic-v1'} for k in REFERENCE})
    r['research_components']['news']['score']=news
    r['research_components']['patterns']['score']=patterns
    return r


class ReplayTests(unittest.TestCase):
    def test_same_inputs_can_reverse_order_without_mutation(self):
        data={'as_of':NOW.isoformat(),'candidates':[candidate('a',80,20),candidate('b',20,85)]}
        before=copy.deepcopy(data)
        result=replay(data)
        a,b=result['scored']
        self.assertEqual((a['reference_rank'],b['reference_rank']),(2,1))
        self.assertEqual((a['adaptive_rank'],b['adaptive_rank']),(1,2))
        self.assertEqual(data,before)

    def test_missing_future_or_unqualified_excluded_from_both_arms(self):
        for mode in ('missing','future','gate','late_review'):
            r=candidate('a',80,20)
            if mode=='missing':del r['research_components']['patterns']
            if mode=='future':r['research_components']['news']['available_at']=(NOW+timedelta(seconds=1)).isoformat()
            if mode=='gate':r['eligibility_passed']=False
            if mode=='late_review':r['news_event_evidence'][0]['reviewed_at']=(NOW+timedelta(seconds=1)).isoformat()
            result=replay({'as_of':NOW.isoformat(),'candidates':[r]})
            self.assertEqual(result['scored'],[])
            self.assertEqual(len(result['withheld']),1)

    def test_duplicate_identity_rejected_and_ties_preserved(self):
        rows=[candidate('a',50,50),candidate('b',50,50)]
        result=replay({'as_of':NOW.isoformat(),'candidates':rows})
        self.assertEqual([r['adaptive_rank'] for r in result['scored']],[1,1])
        rows[1]['candidate_id']='a'
        with self.assertRaises(ValueError):replay({'as_of':NOW.isoformat(),'candidates':rows})
