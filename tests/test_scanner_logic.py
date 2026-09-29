import unittest
from datetime import datetime

import scanner


class ScannerLogicTests(unittest.TestCase):
    def test_osi_parser(self):
        parsed = scanner.parse_osi("AAPL260929C00200000")
        self.assertIsNotNone(parsed)
        expiry, side, strike = parsed
        self.assertEqual(expiry.isoformat(), "2026-09-29")
        self.assertEqual(side, "call")
        self.assertEqual(strike, 200.0)

    def test_osi_parser_put(self):
        parsed = scanner.parse_osi("TSLA260929P00350000")
        self.assertEqual(parsed[1], "put")
        self.assertEqual(parsed[2], 350.0)

    def test_osi_parser_rejects_bad_symbol(self):
        self.assertIsNone(scanner.parse_osi("not-an-option"))

    def test_market_session_boundaries(self):
        base = datetime(2026, 9, 29, tzinfo=scanner.ET)
        self.assertEqual(scanner.market_session(base.replace(hour=8, minute=59)), "PREMARKET")
        self.assertEqual(scanner.market_session(base.replace(hour=9, minute=30)), "OPEN")
        self.assertEqual(scanner.market_session(base.replace(hour=15, minute=59)), "OPEN")
        self.assertEqual(scanner.market_session(base.replace(hour=16, minute=0)), "AFTER HOURS")
        self.assertEqual(scanner.market_session(base.replace(hour=20, minute=0)), "CLOSED")

    def test_contract_score_prefers_matching_direction(self):
        stock = {"price": 100.0, "direction": "UP"}
        call = {
            "side": "call", "strike": 100.0, "bid": 0.18, "ask": 0.22,
            "volume": 400, "oi": 1000, "delta": 0.48, "gamma": 0.08,
        }
        put = {**call, "side": "put"}
        self.assertGreater(scanner.contract_score(call, stock), scanner.contract_score(put, stock))

    def test_nasdaq_parser_only_keeps_today(self):
        today = datetime(2026, 9, 29, tzinfo=scanner.ET).date()
        rows = [
            {
                "expiryDate": "09/29/2026", "strike": "100",
                "c_Bid": "0.10", "c_Ask": "0.20", "c_Last": "0.15",
                "c_Volume": "100", "c_OpenInterest": "500",
                "p_Bid": "0.10", "p_Ask": "0.20", "p_Last": "0.15",
                "p_Volume": "80", "p_OpenInterest": "400",
            },
            {
                "expiryDate": "10/02/2026", "strike": "100",
                "c_Bid": "0.10", "c_Ask": "0.20", "c_Last": "0.15",
                "c_Volume": "100", "c_OpenInterest": "500",
            },
        ]
        parsed = scanner.parse_nasdaq_rows(rows, today)
        self.assertEqual(len(parsed), 2)
        self.assertTrue(all(x["expiry"] == "2026-09-29" for x in parsed))


if __name__ == "__main__":
    unittest.main()
