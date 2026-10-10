import copy
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
from news_research import evaluate
from schema_normalizer import normalize
from test_confirmation_qualification import fixtures, NOW


def event(**changes):
    """Synthetic fixture only; not evidence about a real company."""
    value={'event_id':'contract-1','ticker':'TEST','title':'TEST announces contract',
           'source_url':'https://example.com/release','event_at':NOW.isoformat(),
           'published_at':NOW.isoformat(),'reviewed_at':NOW.isoformat(),
           'horizon':'INTRADAY','relevance':'DIRECT','direction':'BULLISH',
           'scores':{'materiality':3,'surprise':3,'credibility':4,'novelty':4},
           'evidence':{'materiality':'Synthetic: 20% of prior-year revenue with documented timing.',
                       'surprise':'Synthetic: prior expectation was no award this quarter.',
                       'credibility':'Synthetic: issuer filing identifies the signed agreement.',
                       'novelty':'Synthetic: first award disclosure.',
                       'relevance':'Synthetic: issuer is the direct contract recipient.',
                       'horizon':'Synthetic: assess first-session repricing.',
                       'direction':'Synthetic: favorable incremental economics.'}}
    value.update(changes);return value


def row(events=None,**changes):
    value={'ticker':'TEST','direction':'UP','score':9,'news_status':'SUCCESS',
           'news_items':[{'title':'TEST announces contract'}],
           'news_event_evidence':[event()] if events is None else events}
    value.update(changes);return value


class NewsResearchTests(unittest.TestCase):
    def test_unresolved_provenance_blocks_otherwise_complete_review(self):
        for blockers in (['Publication timing unresolved'], ['Prior benchmark provenance incomplete'], 'invalid'):
            r=evaluate(row([event(review_blockers=blockers)]),NOW)
            self.assertEqual(r['status'],'NEEDS_REVIEW')
            self.assertIsNone(r['proposed_weights'])
            self.assertIn('unresolved_review_blockers',r['events'][0]['missing'])
        self.assertEqual(evaluate(row([event(review_blockers=[])]),NOW)['status'],'ASSESSED')

    def test_company_materiality_changes_weight_and_input_is_immutable(self):
        small=event();small['scores']['materiality']=1
        large=event();large['scores']['materiality']=4
        a=row([small]);before=copy.deepcopy(a)
        low=evaluate(a,NOW);high=evaluate(row([large]),NOW)
        self.assertLess(low['importance'],high['importance'])
        self.assertLessEqual(low['importance'],.25)
        self.assertLess(low['proposed_weights']['news'],high['proposed_weights']['news'])
        self.assertEqual(a,before)

    def test_positive_and_negative_have_equal_importance_not_equal_direction(self):
        bull=evaluate(row(),NOW);bear=evaluate(row([event(direction='BEARISH')]),NOW)
        self.assertEqual(bull['importance'],bear['importance'])
        self.assertEqual(bull['directional_support'],'ALIGNED')
        self.assertEqual(bear['directional_support'],'OPPOSED')
        self.assertEqual(evaluate(row([event(direction='UNKNOWN')]),NOW)['directional_support'],None)

    def test_missing_review_and_missing_consensus_withhold(self):
        self.assertEqual(evaluate(row([]),NOW)['status'],'NEEDS_REVIEW')
        e=event();del e['scores']['surprise']
        r=evaluate(row([e]),NOW)
        self.assertIsNone(r['proposed_weights']);self.assertIn('surprise',r['events'][0]['missing'])
        e=event();e['evidence']['surprise']=''
        self.assertIsNone(evaluate(row([e]),NOW)['proposed_weights'])

    def test_coverage_does_not_redistribute_or_use_saved_reviews(self):
        for status in (None,'SOURCE_FAILURE','NOT_SCANNED'):
            r=evaluate(row(news_status=status),NOW)
            self.assertEqual(r['status'],'COVERAGE_UNKNOWN');self.assertIsNone(r['proposed_weights'])
        r=evaluate(row([],news_items=[]),NOW)
        self.assertEqual(r['status'],'NO_REPORTED_NEWS');self.assertIsNone(r['proposed_weights'])

    def test_rumors_background_and_recycled_news_do_not_propose(self):
        for key,value in [('credibility',2),('materiality',0),('novelty',0)]:
            e=event();e['scores'][key]=value
            self.assertIsNone(evaluate(row([e]),NOW)['proposed_weights'])
        self.assertIsNone(evaluate(row([event(relevance='UNRELATED')]),NOW)['proposed_weights'])

    def test_duplicates_do_not_inflate_and_republication_does_not_refresh(self):
        original=event(event_at=(NOW-timedelta(hours=6)).isoformat())
        duplicate=copy.deepcopy(original);duplicate.update(source_url='https://example.org/syndication',title='Syndicated headline')
        a=evaluate(row([original]),NOW);b=evaluate(row([original,duplicate]),NOW)
        self.assertEqual(a['importance'],b['importance']);self.assertEqual(b['duplicates_removed'],1)
        self.assertAlmostEqual(a['importance'],evaluate(row(),NOW)['importance']/2)

    def test_conflicting_reviews_withhold_and_independent_directions_are_mixed(self):
        e=event(direction='BEARISH')
        self.assertEqual(evaluate(row([event(),e]),NOW)['status'],'CONFLICTING_REVIEWS')
        e.update(event_id='separate',title='Different event',source_url='https://example.com/second')
        r=evaluate(row([event(),e]),NOW)
        self.assertEqual(r['direction'],'MIXED');self.assertIsNone(r['directional_support'])
        self.assertEqual(r['importance'],evaluate(row(),NOW)['importance'])

    def test_stale_future_and_wrong_horizon_withhold(self):
        for field in ('event_at','published_at','reviewed_at'):
            e=event(**{field:(NOW+timedelta(seconds=1)).isoformat()})
            self.assertIsNone(evaluate(row([e]),NOW)['proposed_weights'])
        self.assertIsNone(evaluate(row([event(event_at=(NOW-timedelta(hours=24)).isoformat())]),NOW)['proposed_weights'])
        self.assertIsNone(evaluate(row([event(horizon='MULTIDAY')]),NOW)['proposed_weights'])
        self.assertIsNone(evaluate(row([event(event_at='2026-10-08T15:00:00')]),NOW)['proposed_weights'])

    def test_weights_sum_to_100_and_preserve_priority(self):
        for materiality in range(1,5):
            for surprise in range(5):
                e=event();e['scores'].update(materiality=materiality,surprise=surprise)
                w=evaluate(row([e]),NOW)['proposed_weights']
                self.assertAlmostEqual(sum(w.values()),100)
                self.assertTrue(40<=w['news']<=42.5)
                self.assertGreater(w['news'],w['patterns']);self.assertGreater(w['patterns'],w['volume'])
        e=event();e['scores']={k:4 for k in e['scores']}
        self.assertEqual(evaluate(row([e]),NOW)['proposed_weights']['news'],42.5)
        self.assertEqual(evaluate(row([e]),NOW)['allocation_policy'],'GRADUAL_2_5')
        self.assertGreater(evaluate(row([e]),NOW)['proposed_weights']['patterns'],35)

    def test_no_change_to_existing_ranking_or_eligibility(self):
        original,_=fixtures('call')
        enriched=copy.deepcopy(original);enriched['candidates'][0].update(news_status='SUCCESS',news_event_evidence=[event()])
        # Match coverage metadata in both inputs so only reviews differ.
        original['candidates'][0]['news_status']='SUCCESS';baseline=normalize(original,NOW)
        actual=normalize(enriched,NOW)
        for k in ('score','setup_qualified','execution_readiness','setup_bucket','preferred_contracts','qualification_checks'):
            self.assertEqual(actual['candidates'][0].get(k),baseline['candidates'][0].get(k),k)
        self.assertEqual(actual['candidates'][0]['news_research']['status'],'ASSESSED')
        from execution_engine import enrich
        _,previous=fixtures('call')
        a=enrich(actual,copy.deepcopy(previous))['candidates'][0]
        b=enrich(baseline,copy.deepcopy(previous))['candidates'][0]
        for key in ('execution_state','execution_score','setup_qualified','second_wave_event'):
            self.assertEqual(a.get(key),b.get(key),key)
