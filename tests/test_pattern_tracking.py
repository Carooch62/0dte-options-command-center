"""Capture-time evidence tests; synthetic packets are not performance evidence."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from pattern_tracking import prospective_report, snapshot_observations
from pattern_lifecycle import VERSION
from shadow_evidence import capture, make_packet

FORMED = '2026-10-19T14:30:00+00:00'
ASOF = '2026-10-19T15:00:00+00:00'


def event(state='FORMING'):
    return {'episode_id': 'UP:'+FORMED, 'direction': 'UP', 'state': state,
            'formed_at': FORMED, 'trigger': 10.08, 'invalidation': 9.98,
            'formation_volume': 500, 'confirmed_at': None if state=='FORMING' else '2026-10-19T14:35:00+00:00',
            'retested_at': None, 'ended_at': '2026-10-19T14:40:00+00:00' if state in ('INVALIDATED','EXPIRED') else None}


def stock(state='FORMING'):
    return {'ticker': 'TEST', 'direction': 'UP', 'early_watch': True,
            'account_id': 'must-not-copy', 'pattern_research': {
                'status': 'READY', 'range_compression': True, 'volume_dry_up': True,
                'directional_structure': True, 'near_trigger': True,
                'lifecycle': {'method_version': VERSION, 'status': 'READY', 'episodes': [event(state)]}}}


def packet(ident='a', state='FORMING', generated='2026-10-19T14:30:00+00:00', captured='2026-10-19T14:30:10+00:00'):
    return {'packet_id': ident, 'generated_at': generated, 'captured_at': captured,
            'pattern_observations': snapshot_observations({'candidates': [stock(state)]})}


class TrackingTests(unittest.TestCase):
    def test_actual_capture_times_and_changed_states_only(self):
        first=packet()
        repeat=packet('b',generated='2026-10-19T14:31:00+00:00',captured='2026-10-19T14:31:10+00:00')
        confirmed=packet('c','CONFIRMED','2026-10-19T14:35:00+00:00','2026-10-19T14:35:10+00:00')
        before=copy.deepcopy([first,repeat,confirmed])
        r=prospective_report([confirmed,first,repeat,first],ASOF)
        e=r['episodes'][0]
        self.assertEqual(e['first_observed_at'],'2026-10-19T14:30:10+00:00')
        self.assertEqual(e['observed_confirmation_at'],'2026-10-19T14:35:10+00:00')
        self.assertEqual(len(e['observations']),2)
        self.assertEqual(r['summary']['forming_then_confirmation_observed'],1)
        self.assertEqual(r['packets'],3)
        self.assertEqual([first,repeat,confirmed],before)

    def test_first_seen_terminal_never_invents_prior_observation(self):
        p=packet('a','INVALIDATED','2026-10-19T14:40:00+00:00','2026-10-19T14:45:00+00:00')
        r=prospective_report([p],ASOF);e=r['episodes'][0]
        self.assertEqual(e['first_observed_state'],'INVALIDATED')
        self.assertIsNone(e['observed_forming_at'])
        self.assertIsNone(e['observed_confirmation_at'])
        self.assertEqual(r['summary']['forming_then_confirmation_observed'],0)

    def test_retest_observation_is_retained_without_a_state_change(self):
        a=packet('a','CONFIRMED','2026-10-19T14:35:00+00:00','2026-10-19T14:35:10+00:00')
        b=packet('b','CONFIRMED','2026-10-19T14:40:00+00:00','2026-10-19T14:40:10+00:00')
        b['pattern_observations'][0]['episodes'][0]['retested_at']='2026-10-19T14:40:00+00:00'
        r=prospective_report([a,b],ASOF)
        self.assertEqual(len(r['episodes'][0]['observations']),2)
        self.assertEqual(r['episodes'][0]['observations'][1]['observed_at'],b['captured_at'])
        self.assertEqual(r['summary']['recorded'],1)

    def test_future_and_invalid_packet_clocks_are_excluded(self):
        for value in ('2026-10-19T15:00:01+00:00','2026-10-19T14:00:00+00:00','2026-10-19T14:30:10'):
            p=packet();p['captured_at']=value
            r=prospective_report([p],ASOF)
            self.assertEqual(r['episodes'],[])
            self.assertEqual(len(r['excluded_packets']),1)
        with self.assertRaises(ValueError):prospective_report([], '2026-10-19T15:00:00')

    def test_conflicting_packet_identity_excludes_both_versions(self):
        a=packet();b=copy.deepcopy(a);b['pattern_observations'][0]['episodes'][0]['trigger']=11
        r=prospective_report([a,b],ASOF)
        self.assertEqual(r['episodes'],[])
        self.assertEqual(r['excluded_packets'][0]['reason'],'CONFLICTING_PACKET_ID')

    def test_legacy_packets_are_not_backfilled(self):
        p=packet();p.pop('pattern_observations');p['candidates']=[{'stock': stock()}]
        r=prospective_report([p],ASOF)
        self.assertEqual(r['packets_without_tracking'],1)
        self.assertEqual(r['episodes'],[])

    def test_frozen_levels_and_state_regression_are_withheld(self):
        a=packet('a','CONFIRMED','2026-10-19T14:35:00+00:00','2026-10-19T14:35:10+00:00')
        for kind in ('level','regression','clock'):
            b=packet('b','CONFIRMED','2026-10-19T14:40:00+00:00','2026-10-19T14:40:10+00:00')
            e=b['pattern_observations'][0]['episodes'][0]
            if kind=='level':e['trigger']=10.09
            if kind=='regression':e.update(state='FORMING',confirmed_at=None)
            if kind=='clock':e['confirmed_at']='2026-10-19T14:40:00+00:00'
            r=prospective_report([a,b],ASOF)
            self.assertEqual(r['summary']['withheld'],1)
            self.assertEqual(r['summary']['recorded'],0)

    def test_same_capture_conflict_and_duplicate_ticker_are_explicit(self):
        a=packet('a',generated='2026-10-19T14:40:00+00:00',captured='2026-10-19T14:40:10+00:00')
        b=packet('b','CONFIRMED',a['generated_at'],a['captured_at'])
        r=prospective_report([a,b],ASOF)
        self.assertIn('SAME_CAPTURE_CONFLICT',r['episodes'][0]['reasons'])
        b['pattern_observations']*=2
        r=prospective_report([b],ASOF)
        self.assertEqual(r['episodes'],[])
        self.assertEqual(len(r['evidence_gaps']),2)

    def test_bad_episode_clocks_values_and_duplicates_do_not_count(self):
        for kind in ('future','nan','duplicate'):
            p=packet();e=p['pattern_observations'][0]['episodes'][0]
            if kind=='future':e.update(state='CONFIRMED',confirmed_at='2026-10-19T14:35:00+00:00')
            if kind=='nan':e['trigger']=float('nan')
            if kind=='duplicate':p['pattern_observations'][0]['episodes']*=2
            r=prospective_report([p],ASOF)
            self.assertEqual(r['summary']['recorded'],0)

    def test_missing_ticker_does_not_imply_terminal_state(self):
        a=packet();b=packet('b',generated='2026-10-19T14:40:00+00:00',captured='2026-10-19T14:40:10+00:00')
        b['pattern_observations']=[]
        r=prospective_report([a,b],ASOF)
        self.assertEqual(r['episodes'][0]['observations'][-1]['state'],'FORMING')
        self.assertEqual(r['episodes'][0]['last_observed_at'],a['captured_at'])

    def test_capture_includes_stocks_without_qualifying_options(self):
        source={'scan_id':'test','generated_at':FORMED,'market_date':'2026-10-19',
                'market_session':'OPEN','candidates':[stock(),{'ticker':'OTHER'}]}
        p=make_packet(source,'2026-10-19T14:30:10+00:00')
        self.assertEqual(p['candidates'],[])
        self.assertEqual(len(p['pattern_observations']),2)
        self.assertNotIn('account_id',json.dumps(p))
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder);(path/'market-dashboard.json').write_text(json.dumps(source))
            capture(path,'2026-10-19T14:30:10+00:00')
            report=json.loads((path/'pattern-prospective.json').read_text())
            self.assertEqual(report['summary']['recorded'],1)
            self.assertEqual(report['coverage_observations'],{'READY':1,'NOT_RECORDED':1})
            saved=(path/'pattern-prospective.json').read_bytes()
            self.assertEqual(capture(path,ASOF)['status'],'ALREADY_CAPTURED')
            self.assertEqual((path/'pattern-prospective.json').read_bytes(),saved)


if __name__=='__main__':unittest.main()
