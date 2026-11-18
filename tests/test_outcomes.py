import json
import tempfile
import unittest
from pathlib import Path

from outcomes import observation_reason, update


class ProspectiveOutcomeTests(unittest.TestCase):
    def contract(self, contract_id):
        return {
            'contract_id': contract_id, 'expiry': '2026-11-20', 'side': 'call',
            'strike': 19, 'bid': .49, 'ask': .51, 'volume': 100,
            'delta': .4, 'theta': -.1, 'payload_timestamp': '2026-11-18T19:00:00Z',
        }

    def candidate(self, ticker, state, qualified, contract_id):
        option = self.contract(contract_id)
        return {
            'ticker': ticker, 'price': 18.7, 'execution_state': state,
            'setup_qualified': qualified, 'second_wave_event': None,
            'preferred_contracts': [option], 'options': [option],
        }

    def test_reporting_includes_qualified_watch_without_promoting_unqualified_watch(self):
        self.assertEqual(observation_reason({'execution_state': 'WATCH', 'setup_qualified': True}),
                         'QUALIFIED_WATCH')
        self.assertIsNone(observation_reason({'execution_state': 'WATCH', 'setup_qualified': False}))
        self.assertEqual(observation_reason({'execution_state': 'TRIGGERED', 'setup_qualified': False}),
                         'PRICE_TRIGGER')

        data = {
            'generated_at': '2026-11-18T19:02:00Z', 'scan_id': 'test-scan',
            'candidates': [
                self.candidate('RIOT', 'WATCH', True, 'RIOT-CALL'),
                self.candidate('NOPE', 'WATCH', False, 'NOPE-CALL'),
                self.candidate('CROSS', 'TRIGGERED', False, 'CROSS-CALL'),
            ],
        }
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'observations.json'
            result = update(data, path)
            events = json.loads(path.read_text())

        self.assertEqual({event['ticker'] for event in events}, {'RIOT', 'CROSS'})
        reasons = {event['ticker']: event['signal_inputs']['observation_reason'] for event in events}
        self.assertEqual(reasons, {'RIOT': 'QUALIFIED_WATCH', 'CROSS': 'PRICE_TRIGGER'})
        self.assertEqual(result['option_feedback']['today_count'], 2)


if __name__ == '__main__':
    unittest.main()
