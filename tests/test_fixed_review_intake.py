"""Synthetic collection and admission regressions; no live market calls."""
import copy
import json
from pathlib import Path
import subprocess
from datetime import timedelta
import unittest
from unittest.mock import patch

from component_scoring import RUBRIC
from fixed_release_fixtures import event
from fixed_review_intake import POLICY, admit, clock, digest, freeze, prepare, scanner_import, method_fingerprint
from test_candidate_batch_audit import fixtures as source_fixtures

CUTOFF = '2026-10-23T14:00:00Z'
IDENT = 'TEST261023C00100000'


def inputs():
    payload = {'format': 'shadow-evidence-v1', 'scan_id': 'synthetic-scan',
               'generated_at': '2026-10-23T13:57:00Z', 'captured_at': '2026-10-23T13:58:00Z',
               'market_session': 'OPEN', 'candidates': [{'candidate_id': IDENT, 'ticker': 'TEST',
               'contract': {'contract_id': IDENT, 'strike': 100, 'side': 'call', 'expiry': '2026-10-23'},
               'stock': {'direction': 'UP', 'bar_end': '2026-10-23T13:55:00Z', 'bar_complete': True}}]}
    packet = {**payload, 'packet_id': digest(payload)}
    corpus = prepare(packet, '2026-10-23T13:58:01Z')
    corpus.update(as_of=CUTOFF, selected_reviewer_id='synthetic-reviewer')
    row = corpus['records'][0]
    row.update(as_of=CUTOFF, session='2026-10-23', reviewer_id='synthetic-reviewer',
               reviewed_at='2026-10-23T13:59:50Z', news_status='SUCCESS', news_checked_at='2026-10-23T13:59:30Z')
    row['news_event_evidence'] = [event(event_at='2026-10-23T13:57:00Z', published_at='2026-10-23T13:58:00Z',
                                      reviewed_at='2026-10-23T13:59:00Z')]
    row['component_reviews']['news']['event_ids'] = ['contract-1']
    evidence = {'observed_at': '2026-10-23T13:59:45Z', 'available_at': '2026-10-23T13:59:49Z',
                'source': 'synthetic source', 'evidence': 'Synthetic evidence only'}
    for component in row['component_reviews'].values():
        for dim in component['dimensions'].values():
            dim.update(evidence, rating=2)
    for gate in row['eligibility_evidence'].values():
        gate.update(evidence, passed=True, policy_version=POLICY['version'])
    for item in row['supporting_evidence'].values():
        item.update(evidence)
    row['supporting_evidence']['depth'].update(bid_size_contracts=3, ask_size_contracts=3)
    row['supporting_evidence']['pricing_benchmark'].update(value=.195, method_version='synthetic-benchmark-v1')
    row['supporting_evidence']['risk_plan'].update(intended_contracts=1, maximum_premium_dollars=30,
                                                maximum_loss_dollars=30, estimated_round_trip_cost_dollars=.1,
                                                cost_basis='Synthetic explicit cost estimate', underlying_target=102,
                                                underlying_invalidation=99, exit_plan='Synthetic exit plan',
                                                broker_deadline_at='2026-10-23T19:45:00Z')
    quote = {'contract_id': IDENT, 'observed_at': '2026-10-23T13:59:55Z',
             'received_at': '2026-10-23T13:59:58Z', 'bid': .19, 'ask': .20,
             'metadata_multiplier': 100, 'multiplier': 100, 'quote_check': 'QUOTE_CHECK_PASSED', 'quote_check_reasons': []}
    export = {'format': 'shadow-outcome-input-v1', 'as_of': '2026-10-23T14:00:05Z',
              'scanner_context': {'packet_id': packet['packet_id'], 'scan_id': packet['scan_id'],
                                  'generated_at': packet['generated_at'], 'captured_at': packet['captured_at']},
              'entries': [{'candidate_id': IDENT, 'decision_at': '2026-10-23T13:50:00Z'}], 'observations': [quote],
              'requests': [{'operation': 'quotes', 'code': 'SUCCESS', 'started_at': '2026-10-23T13:59:56Z',
                            'finished_at': CUTOFF, 'browser_ms': 4000}]}
    return packet, corpus, export


class FixedReviewIntakeTests(unittest.TestCase):
    def test_prepare_prefills_facts_but_never_reviews(self):
        p, _, _ = inputs()
        before = copy.deepcopy(p)
        c = prepare(p, '2026-10-23T13:58:01Z')
        row = c['records'][0]
        self.assertEqual(row['candidate_id'], IDENT)
        self.assertIsNone(c['selected_reviewer_id'])
        self.assertIsNone(c['as_of'])
        self.assertIsNone(row['reviewed_at'])
        self.assertTrue(all(dim['rating'] is None for component in row['component_reviews'].values() for dim in component['dimensions'].values()))
        self.assertEqual(row['supporting_evidence']['depth']['contract_id'], IDENT)
        self.assertEqual(p, before)

    def test_complete_admission_is_immutable_and_keeps_actual_decision_clock(self):
        args = inputs()
        before = copy.deepcopy(args)
        r = admit(*args)
        self.assertEqual(r['status'], 'ADMITTED_OFFLINE')
        self.assertEqual(r['admitted_count'], 1)
        self.assertEqual(r['fixed_report']['scored'][0]['reference_score'], 50)
        self.assertNotIn('adaptive_score', r['fixed_report']['scored'][0])
        self.assertEqual(r['capture_targets'][0]['target_at'], '2026-10-23T14:05:00+00:00')
        self.assertEqual(r['capture_targets'][0]['closes_at'], '2026-10-23T14:06:00+00:00')
        self.assertEqual(clock(r['outcome_input']['entries'][0]['decision_at']), clock(CUTOFF))
        self.assertNotEqual(r['outcome_input']['entries'][0]['decision_at'], args[2]['entries'][0]['decision_at'])
        self.assertEqual(args, before)

    def test_packet_tampering_and_policy_drift_are_rejected(self):
        p, c, e = inputs()
        p['candidates'][0]['contract']['strike'] = 101
        with self.assertRaises(ValueError): admit(p, c, e)
        for key in ('policy_sha256', 'method_sha256', 'policy_version', 'packet_id', 'selected_reviewer_id'):
            p, c, e = inputs()
            c[key] = 'different'
            if key == 'selected_reviewer_id':
                self.assertEqual(admit(p, c, e)['admitted_count'], 0)
            else:
                with self.assertRaises(ValueError): admit(p, c, e)

    def test_completion_must_follow_preparation_and_precede_cutoff(self):
        for stamp in ('2026-10-23T13:57:59Z', '2026-10-23T14:00:01Z', None):
            p, c, e = inputs()
            c['records'][0]['reviewed_at'] = stamp
            self.assertEqual(admit(p, c, e)['admitted_count'], 0)
        p, _, _ = inputs()
        with self.assertRaises(ValueError): prepare(p, '2026-10-22T23:00:00Z')

    def test_failed_latest_response_never_falls_back_to_older_pass(self):
        p, c, e = inputs()
        e['observations'].append(dict(e['observations'][0], received_at=CUTOFF, quote_check='REQUIRES_RECHECK',
                                      multiplier=None, quote_check_reasons=['WIDE_SPREAD'], bid=.01))
        r = admit(p, c, e)
        self.assertEqual(r['admitted_count'], 0)
        self.assertIn('PASSING_QUOTE_AT_DECISION_REQUIRED', r['withheld'][0]['reasons'])

    def test_failed_or_incomplete_latest_request_blocks_a_decision(self):
        for code, finished in [('NETWORK', CUTOFF), ('SUCCESS', '2026-10-23T14:00:01Z')]:
            p, c, e = inputs()
            e['requests'].append({'operation': 'quotes', 'code': code, 'started_at': '2026-10-23T13:59:59Z',
                                  'finished_at': finished, 'browser_ms': 1000})
            with self.assertRaises(ValueError):
                admit(p, c, e)

    def test_malformed_request_diagnostics_cannot_hide_a_newer_failure(self):
        p, c, e = inputs()
        e['requests'].append({'operation': 'quotes', 'code': 'NETWORK', 'started_at': 'bad',
                              'finished_at': CUTOFF, 'browser_ms': 0})
        with self.assertRaisesRegex(ValueError, 'Malformed retained'): admit(p, c, e)

    def test_empty_new_response_cannot_reuse_a_prior_book(self):
        p, c, e = inputs()
        e['requests'][-1]['started_at'] = '2026-10-23T13:59:59Z'
        self.assertEqual(admit(p, c, e)['admitted_count'], 0)

    def test_request_diagnostics_are_required_for_the_new_protocol(self):
        p, c, e = inputs()
        e.pop('requests')
        with self.assertRaises(ValueError): admit(p, c, e)

    def test_quote_age_boundary_and_future_receipts(self):
        for observed, received, count in [('2026-10-23T13:59:00Z', '2026-10-23T13:59:58Z', 1),
                                          ('2026-10-23T13:58:59Z', '2026-10-23T13:59:58Z', 0),
                                          ('2026-10-23T14:00:01Z', '2026-10-23T14:00:02Z', 0)]:
            p, c, e = inputs()
            e['observations'][0].update(observed_at=observed, received_at=received)
            self.assertEqual(admit(p, c, e)['admitted_count'], count)

    def test_wrong_quote_packet_and_conflicting_observations_rejected(self):
        p, c, e = inputs()
        e['scanner_context']['packet_id'] = 'other'
        with self.assertRaises(ValueError): admit(p, c, e)
        p, c, e = inputs()
        e['observations'].append(dict(e['observations'][0], ask=.21))
        with self.assertRaises(ValueError): admit(p, c, e)

    def test_missing_depth_benchmark_or_risk_cannot_be_neutral(self):
        for key in ('depth', 'pricing_benchmark', 'risk_plan'):
            p, c, e = inputs()
            c['records'][0]['supporting_evidence'].pop(key)
            self.assertEqual(admit(p, c, e)['admitted_count'], 0)
        for kind in ('depth', 'budget', 'cost', 'deadline', 'policy', 'benchmark_method'):
            p, c, e = inputs()
            row = c['records'][0]
            if kind == 'depth': row['supporting_evidence']['depth']['ask_size_contracts'] = 0
            elif kind == 'budget': row['supporting_evidence']['risk_plan']['maximum_loss_dollars'] = 19
            elif kind == 'cost': row['supporting_evidence']['risk_plan']['estimated_round_trip_cost_dollars'] = None
            elif kind == 'deadline': row['supporting_evidence']['risk_plan']['broker_deadline_at'] = CUTOFF
            elif kind == 'policy': row['eligibility_evidence']['risk']['policy_version'] = 'another'
            else: row['supporting_evidence']['pricing_benchmark']['method_version'] = ''
            self.assertEqual(admit(p, c, e)['admitted_count'], 0)

    def test_supporting_sources_must_precede_review_and_match_contract(self):
        for change in ({'available_at': '2026-10-23T13:59:51Z'}, {'contract_id': 'OTHER'}):
            p, c, e = inputs()
            c['records'][0]['supporting_evidence']['depth'].update(change)
            self.assertEqual(admit(p, c, e)['admitted_count'], 0)

    def test_news_coverage_must_exist_before_actual_review_completion(self):
        p, c, e = inputs()
        c['records'][0]['news_checked_at'] = '2026-10-23T13:59:51Z'
        result = admit(p, c, e)
        self.assertEqual(result['admitted_count'], 0)
        self.assertIn('NEWS_COVERAGE_MUST_PRECEDE_REVIEW', result['withheld'][0]['reasons'])

    def test_latest_provider_depth_cannot_be_overridden_by_reviewed_depth(self):
        for fields in ({'bid_size': 0, 'ask_size': 3}, {'bid_size': 3, 'ask_size': 0},
                       {'bid_size': -1}, {'ask_size': '3'}, {'ask_size': True}):
            with self.subTest(fields=fields):
                p, c, e = inputs()
                e['observations'][0].update(fields)
                result = admit(p, c, e)
                self.assertEqual(result['admitted_count'], 0)
                self.assertIn('LATEST_PROVIDER_DEPTH_INSUFFICIENT_OR_INVALID', result['withheld'][0]['reasons'])

    def test_ambiguous_same_start_requests_are_rejected_in_either_order(self):
        for reverse in (False, True):
            p, c, e = inputs()
            e['requests'] = [{'operation': 'quotes', 'code': code, 'started_at': CUTOFF,
                              'finished_at': CUTOFF, 'browser_ms': 0} for code in ('SUCCESS', 'NETWORK')]
            if reverse:
                e['requests'].reverse()
            e['observations'][0]['received_at'] = CUTOFF
            with self.assertRaisesRegex(ValueError, 'Ambiguous quote request start'):
                admit(p, c, e)

    def test_provider_depth_is_checked_against_actual_intended_quantity(self):
        for size, count in ((1, 0), (2, 1), (3, 1)):
            p, c, e = inputs()
            risk = c['records'][0]['supporting_evidence']['risk_plan']
            risk.update(intended_contracts=2, maximum_premium_dollars=60, maximum_loss_dollars=60)
            e['observations'][0].update(bid_size=size, ask_size=size)
            self.assertEqual(admit(p, c, e)['admitted_count'], count)

    def test_intake_and_source_audit_changes_invalidate_old_worksheets(self):
        original = Path.read_bytes
        for path in ('fixed_review_intake.py', 'review_corpus.py', 'quote_latency.py',
                     'market_clock.py', 'audit-candidate-batch.py'):
            p, c, e = inputs()
            def changed_bytes(file):
                return original(file) + (b'\n# Changed rules\n' if file.name == path else b'')
            with patch.object(Path, 'read_bytes', changed_bytes):
                self.assertNotEqual(method_fingerprint(), c['method_sha256'])
                with self.assertRaisesRegex(ValueError, 'fingerprint'):
                    admit(p, c, e)

    def test_source_bar_clock_cannot_be_replaced_with_later_time(self):
        p, c, e = inputs()
        c['records'][0]['intraday_bar_end'] = '2026-10-23T13:59:00Z'
        r = admit(p, c, e)
        self.assertEqual(r['admitted_count'], 0)
        self.assertIn('BAR_CLOCK_MUST_MATCH_FROZEN_PACKET', r['withheld'][0]['reasons'])

    def test_source_bar_cannot_finish_after_the_snapshot_was_generated(self):
        p, c, e = inputs()
        p['generated_at'] = '2026-10-23T13:54:00Z'
        p['packet_id'] = digest({k: v for k, v in p.items() if k != 'packet_id'})
        c['packet_id'] = p['packet_id']
        c['records'][0]['evidence_set_id'] = p['packet_id']
        e['scanner_context'].update(packet_id=p['packet_id'], generated_at=p['generated_at'])
        result = admit(p, c, e)
        self.assertEqual(result['admitted_count'], 0)
        self.assertIn('SOURCE_BAR_AFTER_PACKET_GENERATION', result['withheld'][0]['reasons'])

    def test_missing_selected_review_is_withheld_and_duplicate_selection_rejected(self):
        p, c, e = inputs()
        c['records'] = []
        result = admit(p, c, e)
        self.assertEqual(result['withheld'][0]['reasons'], ['SELECTED_REVIEWER_RECORD_MISSING'])
        self.assertEqual(result['capture_targets'], [])
        self.assertEqual(result['outcome_input']['entries'], [])
        p, c, e = inputs()
        c['records'] *= 2
        with self.assertRaises(ValueError): admit(p, c, e)

    def test_outside_session_rejected(self):
        p, c, e = inputs()
        c['as_of'] = '2026-10-24T14:00:00Z'
        with self.assertRaisesRegex(ValueError, 'regular exchange session'): admit(p, c, e)

    def test_freeze_audits_source_and_import_preserves_identity(self):
        s, b = source_fixtures()
        s['candidates'][0]['direction'] = 'UP'
        s['candidates'][0]['bar_end'] = s['generated_at']
        p = freeze(s, b, '2026-10-22T23:13:00Z')
        imported = scanner_import(p)
        self.assertEqual(imported['packet_id'], p['packet_id'])
        self.assertEqual(imported['candidates'][0]['options'][0]['contract_id'], b['candidates'][0]['options'][0]['contract_id'])
        self.assertEqual(imported['generated_at'], s['generated_at'])
        b['candidates'][0]['options'][0]['scanner_ask'] = .29
        with self.assertRaises(ValueError): freeze(s, b, '2026-10-22T23:13:00Z')

    def test_scanner_import_survives_existing_tab_recovery_and_export(self):
        p, _, _ = inputs()
        p['coverage'] = {'qualifying': 5, 'included': 1, 'omitted': 4}
        p['packet_id'] = digest({k: v for k, v in p.items() if k != 'packet_id'})
        imported = scanner_import(p)
        self.assertEqual(imported['total_contracts'], 5)
        self.assertEqual(imported['omitted_contracts'], 4)
        script = """
import {sessionPayload,restoreSession} from './quote-session.js';
import {quoteEvidenceInput} from './quote-evidence.js';
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const scanner=JSON.parse(raw),saved=sessionPayload(scanner,[],[],'Synthetic collection import',Date.now());
const restored=restoreSession(JSON.stringify(saved));
process.stdout.write(JSON.stringify(quoteEvidenceInput(restored.scanner,[]).scanner_context));
"""
        context = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script],
                             input=json.dumps(imported), text=True, cwd=Path(__file__).resolve().parents[1]))
        self.assertEqual(context['packet_id'], p['packet_id'])
        self.assertEqual(context['scan_id'], p['scan_id'])
        self.assertEqual(context['generated_at'], p['generated_at'])
        self.assertEqual(context['captured_at'], p['captured_at'])


if __name__ == '__main__':
    unittest.main()
