import copy
import unittest
from candidate_snapshot import compact_candidates
class CompactTests(unittest.TestCase):
    def test_preserves_identity_provenance_and_deduplicates_without_mutation(self):
        o=dict(contract_id='TEST',strike=100,side='call',expiry='2026-10-12',bid=1,history=['large'])
        s=dict(generated_at='2026-10-12T14:00:00Z',scan_id='original',candidates=[dict(ticker='TEST',score=99,options=[o],expiry_groups={'later':{'options':[o]}})])
        before=copy.deepcopy(s)
        r=compact_candidates(s)
        self.assertEqual(s,before)
        self.assertEqual(r['generated_at'],s['generated_at'])
        self.assertEqual(r['scan_id'],'original')
        self.assertEqual(r['candidates'],[{'ticker':'TEST','options':[dict(contract_id='TEST',strike=100,side='call',expiry='2026-10-12')]}])
    def test_bound_is_explicit(self):
        options=[dict(contract_id=str(i),strike=i+1,side='call',expiry='2026-10-12') for i in range(25)]
        r=compact_candidates({'candidates':[{'ticker':'TEST','options':options}]})
        self.assertEqual(r['included_contracts'],20)
        self.assertEqual(r['omitted_contracts'],5)
        self.assertEqual(r['total_contracts'],25)
