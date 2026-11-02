"""Provisional evidence-reviewed rubric; offline only, never a live trade gate."""
import argparse
import copy
import json
from news_research import clock

VERSION = 'component-rubric-v1'
RUBRIC = {
    'news': {'directional_support': .40, 'materiality': .30, 'surprise': .20, 'novelty': .10},
    'patterns': {'setup_structure': .40, 'trend_alignment': .35, 'trigger_confirmation': .25},
    'volume': {'relative_volume': .50, 'directional_participation': .30, 'follow_through': .20},
    'options': {'spread_quality': .50, 'depth_quality': .30, 'pricing_quality': .20},
    'risk_reward': {'payoff_quality': .50, 'invalidation_quality': .30, 'execution_feasibility': .20},
}
GATES = ('liquidity', 'risk')

def provenance(item, now):
    if not isinstance(item, dict):
        return False
    observed, available = clock(item.get('observed_at')), clock(item.get('available_at'))
    return (observed is not None and available is not None and observed <= available <= now
            and isinstance(item.get('source'), str) and bool(item['source'].strip())
            and isinstance(item.get('evidence'), str) and bool(item['evidence'].strip()))

def gate_reasons(row, now):
    gates = row.get('eligibility_evidence', {})
    if not isinstance(gates, dict):
        gates = {}
    return [name + ':GATE_NOT_VERIFIED' for name in GATES
            if not provenance(gates.get(name), now) or gates[name].get('passed') is not True
            or not isinstance(gates[name].get('policy_version'), str)
            or not gates[name]['policy_version'].strip()]

def score_candidate(row, as_of):
    now = clock(as_of)
    if now is None:
        raise ValueError('Timezone-aware as_of required')
    result = copy.deepcopy(row)
    result['research_components'] = {}
    reasons = gate_reasons(row, now)
    reviews = row.get('component_reviews', {})
    if not isinstance(reviews, dict):
        reviews = {}
    for component, weights in RUBRIC.items():
        review = reviews.get(component, {})
        if not isinstance(review, dict):
            review = {}
        dimensions = review.get('dimensions', {})
        if not isinstance(dimensions, dict):
            dimensions = {}
        invalid = []
        for name in weights:
            item = dimensions.get(name, {})
            if (not provenance(item, now) or type(item.get('rating')) is not int
                    or not 0 <= item['rating'] <= 4):
                invalid.append(component + ':' + name + ':INVALID_REVIEW')
        if review.get('candidate_id') != row.get('candidate_id') or not row.get('candidate_id'):
            invalid.append(component + ':IDENTITY_MISMATCH')
        if invalid:
            reasons.extend(invalid)
            continue
        result['research_components'][component] = {
            'score': round(sum(dimensions[k]['rating'] * 25 * w for k, w in weights.items()), 6),
            'available_at': max(clock(dimensions[k]['available_at']) for k in weights).isoformat(),
            'source': '; '.join(sorted({dimensions[k]['source'] for k in weights})),
            'method_version': VERSION,
            'dimensions': copy.deepcopy(dimensions),
            'validation_status': 'PROVISIONAL_RUBRIC',
        }
    result['eligibility_passed'] = not gate_reasons(row, now)
    result['component_scoring'] = {'status': 'COMPLETE' if not reasons else 'WITHHELD',
                                  'reasons': reasons, 'method_version': VERSION,
                                  'ranking_effect': 'NONE'}
    return result

def score_snapshot(snapshot):
    result = copy.deepcopy(snapshot)
    result['candidates'] = [score_candidate(row, snapshot.get('as_of'))
                            for row in snapshot.get('candidates', [])]
    result['mode'] = 'OFFLINE_SHADOW'
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('input')
    args = parser.parse_args()
    with open(args.input) as handle:
        print(json.dumps(score_snapshot(json.load(handle)), indent=2))
