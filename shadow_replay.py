"""Offline paired scoring experiment. No imports from live scanner code paths."""
import argparse
import json
from news_research import REFERENCE, clock, evaluate
from component_scoring import score_candidate, gate_reasons, VERSION


def replay(snapshot):
    now = clock(snapshot.get('as_of'))
    if now is None:
        raise ValueError('Timezone-aware as_of required')
    scored, withheld, seen = [], [], set()
    for row in snapshot.get('candidates', []):
        reviewed_input = 'component_reviews' in row
        if reviewed_input:
            row = score_candidate(row, now.isoformat())
        ident = row.get('candidate_id')
        if not isinstance(ident, str) or not ident or ident in seen:
            raise ValueError('Unique candidate_id required (include side/contract as appropriate)')
        seen.add(ident)
        reasons = []
        if snapshot.get('packet_id') and row.get('evidence_set_id') != snapshot['packet_id']:
            reasons.append('EVIDENCE_PACKET_MISMATCH')
        if reviewed_input and 'reviewed_at' in row:
            reviewed_at = clock(row.get('reviewed_at'))
            if reviewed_at is None or reviewed_at > now:
                reasons.append('REVIEW_AFTER_CUTOFF_OR_UNKNOWN')
            elif any(clock(c.get('available_at')) is not None and clock(c['available_at']) > reviewed_at
                     for c in list(row.get('research_components', {}).values())
                     + [g for g in (row.get('eligibility_evidence', {}).values()
                                    if isinstance(row.get('eligibility_evidence'), dict) else []) if isinstance(g, dict)]):
                reasons.append('REVIEW_PRECEDES_COMPONENT_EVIDENCE')
        if row.get('eligibility_passed') is not True:
            reasons.append('ELIGIBILITY_NOT_VERIFIED')
        components = row.get('research_components', {})
        if not isinstance(components, dict):
            components = {}
        if any(isinstance(c, dict) and c.get('method_version') == VERSION for c in components.values()):
            reasons.extend(gate_reasons(row, now))
            if not reviewed_input:
                reasons.append('RUBRIC_REVIEWS_REQUIRED')
        values = {}
        for key in REFERENCE:
            c = components.get(key, {})
            if not isinstance(c, dict):
                c = {}
            value, stamp = c.get('score'), clock(c.get('available_at'))
            if type(value) not in (int, float) or not 0 <= value <= 100:
                reasons.append(key + ':MISSING_OR_INVALID_SCORE')
            elif (stamp is None or stamp > now or not isinstance(c.get('source'),str) or not c['source'].strip()
                    or not isinstance(c.get('method_version'),str) or not c['method_version'].strip()):
                reasons.append(key + ':UNVERIFIED_POINT_IN_TIME_PROVENANCE')
            else:
                values[key] = value
        assessment = evaluate(row, now)
        if assessment['status'] != 'ASSESSED':
            reasons.append('NEWS:' + assessment['status'])
        if reviewed_input:
            reviews = row.get('component_reviews')
            news_review = reviews.get('news', {}) if isinstance(reviews, dict) else {}
            linked = news_review.get('event_ids') if isinstance(news_review, dict) else None
            active = {e['event_id']: e for e in assessment.get('events', []) if e['status'] == 'ASSESSED'}
            if (not isinstance(linked, list) or not linked
                    or any(not isinstance(ident, str) or not ident.strip() for ident in linked)
                    or len(set(linked)) != len(linked)):
                reasons.append('NEWS:EVENT_LINKS_REQUIRED')
            elif any(ident not in active for ident in linked):
                reasons.append('NEWS:LINKED_EVENT_NOT_ASSESSED')
            else:
                dims = news_review.get('dimensions', {})
                for dim in dims.values() if isinstance(dims, dict) else []:
                    available = clock(dim.get('available_at')) if isinstance(dim, dict) else None
                    if available is not None and any(clock(active[ident]['reviewed_at']) > available for ident in linked):
                        reasons.append('NEWS:SCORE_PRECEDES_EVENT_REVIEW')
                        break
        if reasons:
            withheld.append({'candidate_id': ident, 'reasons': reasons})
            continue
        def score(weights):
            return round(sum(values[k]*weights[k]/100 for k in REFERENCE), 6)
        scored.append({'candidate_id': ident, 'reference_score': score(REFERENCE),
                       'reference_components': {k: {'score': values[k], 'weight_pct': REFERENCE[k],
                                                  'contribution': round(values[k]*REFERENCE[k]/100, 6)}
                                                for k in REFERENCE},
                       'adaptive_score': score(assessment['proposed_weights']),
                       'allocation_policy': assessment['allocation_policy'],
                       'news_event_ids': list(linked) if reviewed_input else [],
                       'news_directional_support': assessment.get('directional_support')})
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
    return {'mode':'OFFLINE_SHADOW', 'as_of':now.isoformat(), 'packet_id':snapshot.get('packet_id'), 'scored':scored,
            'withheld':withheld, 'candidate_count':len(seen),
            'ranking_effect':'NONE', 'eligibility_effect':'NONE',
            'limitation':'Paired complete cases only; no outcomes or profitability measured. Component definitions require separate validation.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('input')
    args = parser.parse_args()
    with open(args.input) as handle:
        print(json.dumps(replay(json.load(handle)), indent=2))



