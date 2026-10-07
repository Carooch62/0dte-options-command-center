import unittest
from quality import contract_checks
class DeltaRanges(unittest.TestCase):
    def test_signed_boundaries_and_missing(self):
        for dte,lo,hi in [(0,.30,.50),(7,.70,.80),(14,.70,.80),(31,.70,.80)]:
            for side,sign in [('call',1),('put',-1)]:
                for value,expected in [(lo,True),(hi,True),(lo-.001,False),(hi+.001,False)]:
                    o={'dte':dte,'side':side,'delta':sign*value,'delta_verified':True}
                    self.assertEqual(contract_checks(o,100)['delta_ok'],expected)
                self.assertFalse(contract_checks({'dte':dte,'side':side,'delta':None,'delta_verified':True},100)['delta_ok'])
                self.assertFalse(contract_checks({'dte':dte,'side':side,'delta':-sign*lo,'delta_verified':True},100)['delta_ok'])
