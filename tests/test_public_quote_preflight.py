import copy
from datetime import datetime, timezone
import unittest
from scripts.public_quote_preflight import preflight


class PublicQuotePreflightTests(unittest.TestCase):
    NOW = datetime(2026, 11, 3, 14, 45, tzinfo=timezone.utc)  # 9:45 AM ET, XNYS session
    def valid(self):
        batch = {
            "format": "candidate-identities-v1", "selection_policy": "published-research-screens-v1",
            "environment": "production", "generated_at": "2026-11-03T14:40:00Z",
            "scan_id": "synthetic-1", "market_session": "OPEN", "max_per_ticker": 2,
            "included_contracts": 1, "total_contracts": 1, "qualifying_contracts": 1,
            "omitted_contracts": 0,
            "candidates": [{"ticker": "MOCK", "options": [
                {"contract_id": "SYNTHETIC", "expiry": "2026-11-03", "side": "call",
                 "strike": 12.5, "scanner_ask": .20}]}]
        }
        health = {"updated_at": "2026-11-03T14:42:00Z", "scan_id": "synthetic-1",
                  "status": "SUCCESS", "stage": "VALIDATED", "core_missing": []}
        return batch, health

    def check(self, modify=None, now=None):
        b,h = self.valid()
        if modify: modify(b,h)
        return preflight(b,h,now or self.NOW)

    def test_clean_open_public_check_does_not_certify_private_feed_or_trade(self):
        r = self.check()
        self.assertEqual(r["result"], "READY_FOR_MANUAL_PRIVATE_CHECK")
        self.assertEqual(r["blockers"], [])
        self.assertEqual(r["selected_contract_count"], 1)
        self.assertFalse(r["private_robinhood_authorization_verified"])
        self.assertFalse(r["provider_bid_ask_freshness_verified"])
        self.assertFalse(r["live_trading_ready"])
        self.assertNotIn("MOCK", str(r))
        self.assertNotIn("SYNTHETIC", str(r))

    def test_current_after_hours_snapshot_is_rejected(self):
        r = self.check(lambda b,h: b.update(market_session="AFTER HOURS"))
        self.assertIn("BATCH_NOT_OPEN_SESSION", r["blockers"])

    def test_expired_contract_is_never_eligible_for_next_day(self):
        def invalid(b,h):
            b["candidates"][0]["options"][0]["expiry"] = "2026-11-02"
        self.assertIn("BATCH_CONTRACT_IDENTITY_OR_COVERAGE_INVALID", self.check(invalid)["blockers"])

    def test_outdated_and_future_public_clocks_are_rejected(self):
        self.assertIn("BATCH_STALE_OR_INVALID_CLOCK", self.check(lambda b,h: b.update(generated_at="2026-11-03T14:20:00Z"))["blockers"])
        self.assertIn("BATCH_STALE_OR_INVALID_CLOCK", self.check(lambda b,h: b.update(generated_at="2026-11-03T14:46:00Z"))["blockers"])
        self.assertIn("HEALTH_STALE_OR_INVALID_CLOCK", self.check(lambda b,h: h.update(updated_at="2026-11-03T14:00:00Z"))["blockers"])

    def test_mismatched_run_failed_health_and_empty_cohort_fail_closed(self):
        self.assertIn("HEALTH_BATCH_SCAN_ID_MISMATCH", self.check(lambda b,h: h.update(scan_id="different"))["blockers"])
        self.assertIn("SCANNER_PIPELINE_NOT_VALIDATED", self.check(lambda b,h: h.update(status="FAILED"))["blockers"])
        def empty(b,h):
            b.update(candidates=[],total_contracts=0,qualifying_contracts=0,included_contracts=0,omitted_contracts=0)
        self.assertIn("NO_ELIGIBLE_CONTRACTS_FOR_PILOT", self.check(empty)["blockers"])

    def test_pre_window_closed_holiday_and_session_clock_fail_closed(self):
        # Eastern daylight saving ends Nov 1; Nov 3 14:35Z is 9:35 ET.
        self.assertIn("BEFORE_MANUAL_PILOT_WINDOW", self.check(now=datetime(2026,11,3,14,35,tzinfo=timezone.utc))["blockers"])
        # Thanksgiving is an XNYS holiday. Even misleading OPEN metadata cannot pass.
        self.assertIn("XNYS_NOT_OPEN", self.check(now=datetime(2026,11,26,15,0,tzinfo=timezone.utc))["blockers"])
        self.assertIn("XNYS_NOT_OPEN", self.check(now=datetime(2026,11,3,23,0,tzinfo=timezone.utc))["blockers"])

    def test_duplicate_identity_budget_and_count_inconsistency_fail(self):
        def dup(b,h):
            b["candidates"][0]["options"].append(copy.deepcopy(b["candidates"][0]["options"][0]))
            b.update(included_contracts=2,total_contracts=2,qualifying_contracts=2,omitted_contracts=0)
        self.assertIn("BATCH_CONTRACT_IDENTITY_OR_COVERAGE_INVALID", self.check(dup)["blockers"])
        self.assertIn("BATCH_CONTRACT_IDENTITY_OR_COVERAGE_INVALID", self.check(lambda b,h: b["candidates"][0]["options"][0].update(scanner_ask=.31))["blockers"])
        self.assertIn("BATCH_CONTRACT_IDENTITY_OR_COVERAGE_INVALID", self.check(lambda b,h: b.update(included_contracts=2))["blockers"])


if __name__ == "__main__":
    unittest.main()
