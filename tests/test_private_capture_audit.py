import json
import unittest
from datetime import datetime, timedelta, timezone
from scripts.audit_private_capture import audit


class PrivateQuoteCoverageTests(unittest.TestCase):
    BASE = datetime(2026, 11, 2, 15, 31, tzinfo=timezone.utc)

    def ts(self, minutes=0, seconds=0):
        return (self.BASE + timedelta(minutes=minutes, seconds=seconds)).isoformat().replace('+00:00', 'Z')

    def observation(self, minute, *, provider_offset_seconds=0, bid=.10, ask=.11, state='unverified'):
        return {
            'instrument': {
                'id': '11111111-1111-4111-8111-111111111111',
                'trade_value_multiplier': '100',
                'chain_symbol': 'MOCK',
            },
            'quote': {
                'instrument_id': '11111111-1111-4111-8111-111111111111',
                'bid_price': str(bid),
                'ask_price': str(ask),
                'updated_at': self.ts(minute, provider_offset_seconds),
            },
            'received_at': self.ts(minute, provider_offset_seconds + 1),
            'session_status': state,
            'account_number': 'must-never-appear-in-report'
        }

    def pack(self, obs):
        return {'format': 'robinhood-research-v1',
                'retrieved_at': self.ts(20), 'accounts': [], 'bars': [], 'observations': obs}

    def test_valid_followups_are_counted_without_claiming_ml_ready(self):
        p = self.pack([self.observation(0), self.observation(5, provider_offset_seconds=2),
                       self.observation(10, provider_offset_seconds=2),
                       self.observation(15, provider_offset_seconds=2)])
        r = audit([p, p])
        self.assertEqual(r['source_files'], 2)
        self.assertEqual(r['deduplicated_quotes'], 4)
        self.assertEqual(r['session_dates_seen'], 1)
        self.assertEqual(r['prospective_entry_candidates'], 1)
        self.assertEqual(r['candidate_followup_windows'], {'5': 1, '10': 1, '15': 1})
        self.assertEqual(r['quotes_without_verified_open_session'], 4)
        self.assertFalse(r['independent_open_session_verification'])
        self.assertFalse(r['ml_ready'])
        self.assertNotIn('account_number', json.dumps(r))
        self.assertNotIn('MOCK', json.dumps(r))

    def test_future_provider_and_stale_quotes_fail_closed(self):
        future = self.observation(1, provider_offset_seconds=0)
        future['received_at'] = self.ts(0, 10)
        stale = self.observation(2)
        stale['quote']['updated_at'] = self.ts(0)
        r = audit([self.pack([future, stale])])
        self.assertEqual(r['invalid_provider_or_receipt_clocks'], 1)
        self.assertEqual(r['quotes_over_60_seconds_at_receipt'], 1)
        self.assertEqual(r['usable_research_quotes'], 0)
        self.assertEqual(r['prospective_entry_candidates'], 0)

    def test_spread_conflict_and_late_receipt_prevent_pairs(self):
        p = self.pack([self.observation(0), self.observation(5, bid=.01, ask=.03)])
        r = audit([p])
        self.assertEqual(r['unusable_spread_books'], 1)
        self.assertEqual(r['candidate_followup_windows']['5'], 0)
        duplicate = self.observation(0, bid=.09)
        r = audit([self.pack([self.observation(0), duplicate])])
        self.assertEqual(r['conflicting_quote_copies_withheld'], 1)
        self.assertEqual(r['prospective_entry_candidates'], 0)
        late = self.observation(5)
        late['received_at'] = self.ts(6, 2)
        r = audit([self.pack([self.observation(0), late])])
        self.assertEqual(r['candidate_followup_windows']['5'], 0)

    def test_shadow_pack_quality_flags_and_format_validation(self):
        raw = [{'contract_id': 'MOCK261102C00100000', 'observed_at': self.ts(0),
                'received_at': self.ts(0, 1), 'bid': .1, 'ask': .11,
                'quote_check': 'QUOTE_CHECK_PASSED', 'multiplier': 100,
                'metadata_multiplier': 100}]
        shadow = {'format': 'shadow-outcome-input-v1', 'as_of': self.ts(20), 'observations': raw}
        self.assertEqual(audit([shadow])['usable_research_quotes'], 1)
        raw[0]['quote_check'] = 'REQUIRES_RECHECK'
        self.assertEqual(audit([shadow])['unverified_contract_or_quote_checks'], 1)
        with self.assertRaisesRegex(ValueError, 'Unsupported'):
            audit([{'format': 'unknown'}])
        with self.assertRaisesRegex(ValueError, 'identity mismatch'):
            bad = self.observation(0)
            bad['quote']['instrument_id'] = 'incorrect'
            audit([self.pack([bad])])


if __name__ == '__main__':
    unittest.main()
