import unittest

from execution_engine import contract_evidence


class ContractEvidenceTests(unittest.TestCase):
    def option(self, contract_id, dte, ask, score=1, near=True, valid=True):
        return {
            'contract_id': contract_id,
            'expiry': '2026-11-13',
            'dte': dte,
            'side': 'put',
            'strike': 38,
            'bid': ask - .01,
            'ask': ask,
            'volume': 100,
            'near_atm': near,
            'quote_valid': valid,
            'contract_score': score,
            'source': 'delayed research',
        }

    def test_retains_bounded_later_expiry_contracts_without_account_data(self):
        later = self.option('NKE261113P00038000', 1, .36, 9)
        row = {
            'preferred_contracts': [],
            'usable_contracts': [],
            'options': [],
            'expiry_groups': {'week': {'options': [later]}},
            'account_number': 'must-not-export',
        }
        evidence = contract_evidence(row)
        self.assertEqual([later['contract_id']], [x['contract_id'] for x in evidence['contracts']])
        self.assertNotIn('account_number', evidence['contracts'][0])

    def test_excludes_unusable_or_out_of_window_contracts_and_caps_output(self):
        options = [self.option(f'TEST{i}', 1, .20, i) for i in range(20)]
        options += [self.option('WIDE', 1, .80), self.option('FAR', 1, .20, near=False),
                    self.option('LONG', 15, .20), self.option('INVALID', 1, .20, valid=False)]
        evidence = contract_evidence({'preferred_contracts': [], 'usable_contracts': [],
                                      'options': [], 'expiry_groups': {'week': {'options': options}}})
        self.assertEqual(12, len(evidence['contracts']))
        self.assertEqual('TEST19', evidence['contracts'][0]['contract_id'])
        self.assertFalse({'WIDE', 'FAR', 'LONG', 'INVALID'} &
                         {x['contract_id'] for x in evidence['contracts']})


if __name__ == '__main__':
    unittest.main()
