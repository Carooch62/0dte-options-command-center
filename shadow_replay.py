"""Offline paired scoring experiment. No imports from live scanner code paths."""
import argparse
import json
from news_research import REFERENCE, clock, evaluate


def replay(snapshot):
    now = clock(snapshot.get('as_of'))
    if now is None:
        raise ValueError('Timezone-aware as_of required')
    scored, withheld, seen = [], [], set()
    for row in snapshot.get('candidates', []):
        ident = row.get('candidate_id')
        if not isinstance(ident, str) or not ident or ident in seen:
            raise ValueError('Unique candidate_id required (include side/contract as appropriate)')
        seen.add(ident)
        reasons = []
        if row.get('eligibility_passed') is not True:
            reasons.append('ELIGIBILITY_NOT_VERIFIED')
        components = row.get('research_components', {})
        if not isinstance(components, dict):
            components = {}
        values = {}
        for key in REFERENCE:
            c = components.get(key, {})
            if not isinstance(c, dict):
                c = {}
            value, stamp = c.get('score'), clock(c.get('available_at'))
            if type(value) not in (int, float) or not 0 <= value <= 100:
                reasons.append(key + ':MISSING_OR_INVALID_SCORE')
            elif stamp is None or stamp > now or not c.get('source') or not c.get('method_version'):
                reasons.append(key + ':UNVERIFIED_POINT_IN_TIME_PROVENANCE')
            else:
                values[key] = value
        assessment = evaluate(row, now)
        if assessment['status'] != 'ASSESSED':
            reasons.append('NEWS:' + assessment['status'])
        if reasons:
            withheld.append({'candidate_id': ident, 'reasons': reasons})
            continue
        def score(weights):
            return round(sum(values[k]*weights[k]/100 for k in REFERENCE), 6)
        scored.append({'candidate_id': ident, 'reference_score': score(REFERENCE),
                       'adaptive_score': score(assessment['proposed_weights']),
                       'allocation_policy': assessment['allocation_policy']})
    ranks = {}
    for kind in ('reference', 'adaptive'):
        # Competition ranks preserve ties; identifier ordering is display-only.
        ordered = sorted(scored, key=lambda r: (-r[kind+'_score'], r['candidate_id']))
        prev, rank = None, 0
        for index, item in enumerate(ordered, 1):
            if item[kind+'_score'] != prev:
                rank = index
            prev = item[kind+'_score']
            ranks[(kind, item['candidate_id'])] = rank
    for item in scored:
        for kind in ('reference', 'adaptive'):
            item[kind+'_rank'] = ranks[(kind, item['candidate_id'])]
        item['rank_change'] = item['reference_rank'] - item['adaptive_rank']
    return {'mode':'OFFLINE_SHADOW', 'as_of':now.isoformat(), 'scored':scored,
            'withheld':withheld, 'candidate_count':len(seen),
            'ranking_effect':'NONE', 'eligibility_effect':'NONE',
            'limitation':'Paired complete cases only; no outcomes or profitability measured. Component definitions require separate validation.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('input')
    args = parser.parse_args()
    with open(args.input) as handle:
        print(json.dumps(replay(json.load(handle)), indent=2))
