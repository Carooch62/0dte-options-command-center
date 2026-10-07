import unittest
from timestamped_quotes import eastern_stamp, normalize

class QuoteImportTests(unittest.TestCase):
    def row(self, **changes):
        return {'underlying_symbol':'SPY','quote_datetime':'2026-10-07 15:00:00','root':'SPY','expiration':'2026-10-16','strike':'781','option_type':'C','bid':'.20','ask':'.23',**changes}
    def test_documented_clock_converts_eastern_and_missing_greeks_remain_unknown(self):
        q=normalize(self.row())
        self.assertEqual(q['quote_timestamp'],'2026-10-07T19:00:00+00:00')
        self.assertEqual(q['contract_id'],'SPY261016C00781000')
        self.assertIsNone(q['theta'])
        self.assertFalse(q['theta_available'])
        self.assertIsNone(q['contract_size'])
    def test_sample_format_preserves_minute_precision_and_zero_theta(self):
        q=normalize(self.row(quote_datetime='9/21/2023 10:30',expiration='9/22/2023',theta='0'))
        self.assertEqual(q['timestamp_precision'],'minute')
        self.assertTrue(q['theta_available'])
        self.assertEqual(q['theta'],0)
    def test_crossed_quotes_and_ambiguous_eastern_times_are_rejected(self):
        with self.assertRaises(ValueError):normalize(self.row(bid='.30'))
        with self.assertRaises(ValueError):eastern_stamp('2026-11-01 01:30:00')
        with self.assertRaises(ValueError):eastern_stamp('2026-03-08 02:30:00')
