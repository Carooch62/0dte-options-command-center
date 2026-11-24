import copy
import unittest
from datetime import datetime,timedelta,timezone
from iwm_control_outcomes import compare

def packet(bar,price=100,**changes):
    return {'packet_id':bar,'scan_id':bar,'market_session':'OPEN','generated_at':bar,'captured_at':(datetime.fromisoformat(bar)+timedelta(seconds=30)).isoformat(),'iwm_control':{'spec_version':'iwm-control-v1','rows':[{'ticker':'IWM','price':price,'price_source':'PUBLIC','bar_end':bar,'setup_qualified':False,**changes}]}}

class IwmControlOutcomeTests(unittest.TestCase):
    def test_exact_horizons_preserve_clocks_and_first_observation_without_mutation(self):
        times=['2026-11-19T15:00:00+00:00','2026-11-19T15:15:00+00:00','2026-11-19T15:30:00+00:00','2026-11-19T16:00:00+00:00']
        packets=[packet(t,100+i) for i,t in enumerate(times)]
        revision=copy.deepcopy(packets[1]);revision['captured_at']='2026-11-19T15:18:00+00:00';revision['packet_id']='revision';revision['iwm_control']['rows'][0]['price']=900;packets.append(revision)
        original=copy.deepcopy(packets)
        report=compare(packets,datetime(2026,11,19,22,tzinfo=timezone.utc))
        outcomes=report['results'][0]['outcomes']
        self.assertEqual([o['stock_change_pct'] for o in outcomes],[1,2,3])
        self.assertEqual(outcomes[0]['later_captured_at'],packets[1]['captured_at'])
        self.assertEqual(report['coverage_eligible_sessions'],0)
        self.assertEqual(packets,original)

    def test_missing_wrong_source_other_session_and_late_bar_do_not_fill_horizons(self):
        packets=[packet('2026-11-19T15:00:00+00:00'),packet('2026-11-19T15:15:00+00:00',120,price_source='OTHER'),packet('2026-11-20T15:30:00+00:00',130)]
        bad=packet('2026-11-19T15:30:00+00:00');bad['generated_at']='2026-11-19T16:30:00+00:00';packets.append(bad)
        report=compare(packets,datetime(2026,11,20,22,tzinfo=timezone.utc))
        self.assertTrue(all(o['status']=='MISSING_EXACT_BAR' for o in report['results'][0]['outcomes']))
        self.assertEqual(report['invalid_or_missing_packets'],1)

    def test_pending_and_outside_early_close_and_legacy_packets(self):
        p=packet('2026-11-27T17:30:00+00:00')
        report=compare([p,{'scan_id':'legacy'}],datetime(2026,11,27,17,31,tzinfo=timezone.utc))
        self.assertEqual([o['status'] for o in report['results'][0]['outcomes']],['PENDING','PENDING','OUTSIDE_SESSION'])
        self.assertEqual(report['status'],'WAITING_FOR_FIVE_COVERED_SESSIONS')

    def test_five_closed_covered_sessions_allow_review_not_automatic_promotion(self):
        packets=[]
        for day in range(16,21):
            for hour,minute in [(15,0),(15,15),(15,30),(16,0),(20,40)]:
                packets.append(packet(datetime(2026,11,day,hour,minute,tzinfo=timezone.utc).isoformat(),100+minute/100,setup_qualified=minute==15))
        report=compare(packets,datetime(2026,11,20,22,tzinfo=timezone.utc))
        self.assertEqual(report['coverage_eligible_sessions'],5)
        self.assertEqual(report['status'],'READY_FOR_EXPLORATORY_REVIEW')
        self.assertEqual(report['ranking_effect'],'NONE')
        self.assertFalse(report['execution'])
        self.assertEqual(compare(packets,datetime(2026,11,20,20,50,tzinfo=timezone.utc))['coverage_eligible_sessions'],4)

    def test_diagnostics_explain_legacy_missing_source_and_partial_session(self):
        legacy={'packet_id':'old','market_session':'OPEN'}
        missing=packet('2026-11-19T15:00:00+00:00');missing['iwm_control']['rows']=[]
        valid=packet('2026-11-19T15:15:00+00:00')
        r=compare([legacy,missing,valid],datetime(2026,11,19,22,tzinfo=timezone.utc))
        d=r['collection_diagnostics']
        self.assertEqual(d['input_packets'],3);self.assertEqual(d['accepted_observations'],1)
        self.assertEqual(d['excluded_by_reason']['UNSUPPORTED_OR_LEGACY_SPEC'],1)
        self.assertEqual(d['excluded_by_reason']['MISSING_OR_AMBIGUOUS_IWM_ROW'],1)
        self.assertEqual(r['sessions'][0]['coverage_blockers'],['FEWER_THAN_FIVE_BASELINES','NO_COMPLETE_EXACT_HORIZONS','MISSING_LATE_COVERAGE'])
        self.assertEqual(r['coverage_eligible_sessions'],0)
        self.assertIsNone(compare([],datetime(2026,11,19,22,tzinfo=timezone.utc))['collection_diagnostics']['latest_accepted_capture'])


    def test_malformed_packets_are_excluded_without_losing_valid_observations(self):
        valid=packet('2026-11-19T15:00:00+00:00')
        malformed=[None,[],{'iwm_control':[]}, {**valid,'iwm_control':{'spec_version':'iwm-control-v1','rows':None}},packet('2026-11-19T15:15:00+00:00',price_source={'source':'PUBLIC'}),{**valid,'packet_id':[]},{**valid,'scan_id':''}]
        report=compare([*malformed,valid],datetime(2026,11,19,22,tzinfo=timezone.utc))
        self.assertEqual(len(report['results']),1)
        self.assertEqual(report['invalid_or_missing_packets'],len(malformed))
        self.assertEqual(report['coverage_eligible_sessions'],0)

    def test_conflicting_first_observations_do_not_depend_on_input_order_or_use_revisions(self):
        base=packet('2026-11-19T15:00:00+00:00')
        target=packet('2026-11-19T15:15:00+00:00',101)
        conflict=copy.deepcopy(target);conflict['packet_id']='conflict';conflict['iwm_control']['rows'][0]['price']=999
        revision=copy.deepcopy(target);revision['packet_id']='revision';revision['captured_at']='2026-11-19T15:16:00+00:00'
        for packets in [[base,target,conflict,revision],[revision,conflict,target,base]]:
            report=compare(packets,datetime(2026,11,19,22,tzinfo=timezone.utc))
            self.assertEqual(report['results'][0]['outcomes'][0]['status'],'MISSING_EXACT_BAR')
            self.assertEqual(report['collection_diagnostics']['excluded_by_reason']['AMBIGUOUS_FIRST_BAR'],1)

    def test_corrupt_file_does_not_block_atomic_report_or_fabricate_coverage(self):
        import json
        import tempfile
        from pathlib import Path
        from iwm_control_outcomes import collect
        with tempfile.TemporaryDirectory() as root:
            data=Path(root);(data/'shadow-evidence').mkdir()
            (data/'staging-environment.json').write_text(json.dumps({'environment':'staging'}))
            (data/'shadow-evidence'/'broken').write_text('{')
            (data/'shadow-evidence'/'valid').write_text(json.dumps(packet('2026-11-19T15:00:00+00:00')))
            collect(root,datetime(2026,11,19,22,tzinfo=timezone.utc))
            result=json.loads((data/'iwm-control-outcomes.json').read_text())
            self.assertEqual(result['collection_diagnostics']['accepted_observations'],1)
            self.assertEqual(result['invalid_or_missing_packets'],1)
            self.assertEqual(result['coverage_eligible_sessions'],0)


    def test_duplicate_identity_conflicts_withhold_both_versions(self):
        valid=packet('2026-11-19T15:00:00+00:00')
        conflict=copy.deepcopy(valid);conflict['iwm_control']['rows'][0]['price']=999
        for packets in [[valid,conflict],[conflict,valid]]:
            report=compare(packets,datetime(2026,11,19,22,tzinfo=timezone.utc))
            self.assertEqual(report['results'],[])
            self.assertEqual(report['collection_diagnostics']['excluded_by_reason']['CONFLICTING_PACKET_IDENTITY'],1)
        self.assertEqual(len(compare([valid,valid],datetime(2026,11,19,22,tzinfo=timezone.utc))['results']),1)
