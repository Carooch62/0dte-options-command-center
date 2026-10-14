import unittest
from shadow_outcomes import evaluate_outcomes


def q(stamp, bid=.29, ask=.30):
    return {'contract_id': 'TEST', 'observed_at': stamp, 'received_at': stamp, 'bid': bid, 'ask': ask,
            'source': 'synthetic quote', 'multiplier': 100}


class OutcomeTests(unittest.TestCase):
    def run_case(self, observations, now='2026-10-14T15:31:00Z', quote=None):
        return evaluate_outcomes([{'candidate_id': 'TEST', 'decision_at': '2026-10-14T15:00:00Z',
                                   'quote': quote or q('2026-10-14T15:00:00Z')}], observations, now)['results'][0]

    def test_uses_first_window_bid_not_best_future_price(self):
        result = self.run_case([q('2026-10-14T15:05:10Z', .31, .32), q('2026-10-14T15:05:20Z', .50, .51)])
        self.assertEqual(result['windows'][0]['exit_bid'], .31)
        self.assertEqual(result['windows'][0]['gross_dollars_per_contract'], 1)
        self.assertEqual(result['sampled_excursion']['best_bid_change_dollars'], 20)
        self.assertEqual(result['windows'][1]['status'], 'WITHHELD_MISSING_WINDOW_QUOTE')

    def test_unknown_clocks_and_unknown_multiplier_withhold_entry(self):
        for field in ('observed_at', 'multiplier'):
            entry = q('2026-10-14T15:00:00Z'); entry[field] = None
            self.assertEqual(self.run_case([], quote=entry)['entry_status'], 'WITHHELD_ENTRY_QUOTE')

    def test_stale_future_crossed_and_wide_quotes_never_count(self):
        invalid = [q('2026-10-14T15:05:00Z', .40, .30), q('2026-10-14T15:05:00Z', .10, .30)]
        stale = q('2026-10-14T15:05:00Z'); stale['received_at'] = '2026-10-14T15:06:01Z'
        future = q('2026-10-14T15:05:00Z'); future['received_at'] = '2026-10-14T16:00:00Z'
        self.assertEqual(self.run_case(invalid+[stale, future])['windows'][0]['status'], 'WITHHELD_MISSING_WINDOW_QUOTE')

    def test_conflicting_same_time_quotes_withheld(self):
        result = self.run_case([q('2026-10-14T15:05:00Z'), q('2026-10-14T15:05:00Z', .31, .32)])
        self.assertEqual(result['windows'][0]['status'], 'WITHHELD_CONFLICTING_QUOTES')

    def test_before_window_pending_after_window_missing(self):
        self.assertEqual(self.run_case([], now='2026-10-14T15:04:59Z')['windows'][0]['status'], 'PENDING')
        self.assertEqual(self.run_case([], now='2026-10-14T15:06:01Z')['windows'][0]['status'], 'WITHHELD_MISSING_WINDOW_QUOTE')

    def test_underlying_move_independent_of_unverified_option_book(self):
        stock = {'ticker': 'TEST', 'price': 100, 'observed_at': '2026-10-14T15:00:00Z',
                 'received_at': '2026-10-14T15:00:00Z', 'source': 'synthetic stock'}
        result = evaluate_outcomes([{'candidate_id': 'TEST', 'decision_at': stock['observed_at'],
                                    'quote': {}, 'stock': stock}], [], '2026-10-14T15:06:01Z',
                                   [{**stock, 'price': 101, 'observed_at': '2026-10-14T15:05:00Z',
                                     'received_at': '2026-10-14T15:05:10Z'}])['results'][0]
        self.assertEqual(result['entry_status'], 'WITHHELD_ENTRY_QUOTE')
        self.assertEqual(result['underlying_windows'][0]['change_pct'], 1)
