"""Fixed-weight shadow baseline. No production scanner imports or ranking writes."""
import argparse
import copy
import json
from news_research import REFERENCE, clock
from component_scoring import gate_reasons
from shadow_replay import replay


def fixed_composite(snapshot):
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get('candidates'), list):
        raise ValueError('Reviewed snapshot requires a candidates array; a corpus records array must be admitted first')
    if any(not isinstance(row, dict) for row in snapshot['candidates']):
        raise ValueError('Each candidate must be an object')
    data = copy.deepcopy(snapshot)
    now = clock(data.get('as_of'))
    if now is None:
        raise ValueError('Timezone-aware as_of required')
    extra = {}
    for row in data.get('candidates', []):
        reasons = gate_reasons(row, now)
        if not isinstance(row.get('component_reviews'), dict):
            reasons.append('UNDERLYING_COMPONENT_REVIEWS_REQUIRED')
        if reasons:
            extra[row.get('candidate_id')] = reasons
            row['eligibility_passed'] = False
            # Reviewed input recomputes this flag; ensure failed evidence remains failed.
            if isinstance(row.get('component_reviews'), dict):
                row['component_reviews'] = {}
    paired = replay(data)
    scored = [{k: value for k, value in row.items()
               if k in ('candidate_id', 'reference_score', 'reference_components',
                        'reference_rank', 'news_event_ids', 'news_directional_support')}
              for row in paired['scored']]
    withheld = copy.deepcopy(paired['withheld'])
    for row in withheld:
        row['reasons'] = list(dict.fromkeys(row['reasons'] + extra.get(row['candidate_id'], [])))
    return {'format': 'fixed-composite-shadow-v1', 'mode': 'OFFLINE_SHADOW',
            'method_version': 'fixed-composite-v1', 'as_of': paired['as_of'],
            'packet_id': paired['packet_id'], 'weights': dict(REFERENCE),
            'score_range': [0, 100], 'scored': scored, 'withheld': withheld,
            'candidate_count': paired['candidate_count'], 'ranking_effect': 'NONE',
            'eligibility_effect': 'NONE', 'performance_evaluated': False,
            'limitation': 'Provisional reviewed scores, not probabilities or measured returns. '
                          'Missing dimensions and unverified risk/liquidity gates withhold the whole score; '
                          'weights are never redistributed. Production rankings are unchanged.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input')
    args = parser.parse_args()
    with open(args.input) as handle:
        print(json.dumps(fixed_composite(json.load(handle)), indent=2, allow_nan=False))
