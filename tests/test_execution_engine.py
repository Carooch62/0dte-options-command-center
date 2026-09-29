import unittest
from execution_engine import classify_contract, crossing, market_regime, momentum_state, enrich


class ExecutionEngineTests(unittest.TestCase):
    def test_downside_trigger_cross(self):
        x = {"direction": "DOWN", "price": 19.60}
        old = {"price": 19.80, "trigger_price": 19.70}
        self.assertTrue(crossing(x, old))

    def test_momentum_decay(self):
        x = {"move_5m": -0.10, "day_move": -5.0, "volume_acceleration": 1.0}
        old = {"move_5m": -0.60, "day_move": -5.0, "volume_acceleration": 1.5}
        self.assertEqual(momentum_state(x, old), "DECAYING")

    def test_contract_roles(self):
        balanced = classify_contract({"side": "put", "strike": 99, "ask": .25, "spread_pct": 10, "delta": -.48, "greeks_verified": True}, 100)
        far = classify_contract({"side": "put", "strike": 90, "ask": .06, "spread_pct": 40, "delta": -.10, "greeks_verified": True}, 100)
        self.assertEqual(balanced["contract_role"], "BALANCED")
        self.assertEqual(far["contract_role"], "DEEP OTM")

    def test_market_regime(self):
        rows = [
            {"ticker": "QQQ", "day_move": 1.0, "move_5m": .4, "recent_move": .6},
            {"ticker": "SPY", "day_move": .8, "move_5m": .3, "recent_move": .5},
            {"ticker": "IWM", "day_move": .7, "move_5m": .2, "recent_move": .4},
        ]
        self.assertEqual(market_regime(rows)["label"], "BULLISH")

    def test_enrich_adds_execution_fields(self):
        data = {
            "generated_at": "2026-09-29T18:00:00+00:00",
            "candidates": [{
                "ticker": "DKNG", "price": 19.60, "direction": "DOWN", "day_move": -6.9,
                "move_5m": -.5, "recent_move": -1.0, "volume_acceleration": 1.8,
                "volume_ratio": 2.8, "vwap": 20.2, "vwap_distance_pct": -2.9,
                "recent_high_15m": 20.0, "recent_low_15m": 19.6,
                "trigger_price": 19.6, "invalidation_price": 20.2,
                "setup_bucket": "SECOND-WAVE", "momentum_confirmed": True,
                "acceleration_confirmed": True, "execution_readiness": "WATCH_ONLY",
                "preferred_contracts": [{"side":"put","strike":19,"ask":.24,"bid":.22,"spread":.02,"spread_pct":8.3,"delta":-.40,"greeks_verified":True,"contract_score":8,"volume":100}],
                "usable_contracts": [], "catalyst_level":"DIRECT",
            }, {"ticker":"QQQ","price":738,"direction":"UP","day_move":.2,"move_5m":.1,"recent_move":.2}],
        }
        out = enrich(data, {"generated_at":"2026-09-29T17:55:00+00:00","candidates":[{"ticker":"DKNG","price":19.8,"trigger_price":19.7}]})
        row = next(x for x in out["candidates"] if x["ticker"] == "DKNG")
        self.assertIn("execution_state", row)
        self.assertIn("key_levels", row)
        self.assertIn("contract_selection", row)
        self.assertIn("market_regime", out)
        self.assertIn("session_feedback", out)


if __name__ == "__main__":
    unittest.main()
