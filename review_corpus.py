"""Offline reviewed-rubric intake; completeness is not replay admission or performance."""
import argparse
import copy
import hashlib
import itertools
import json
from collections import Counter
from component_scoring import RUBRIC, VERSION, score_candidate
from news_research import clock


def label(value):
    return isinstance(value, str) and bool(value.strip()) and value == value.strip()


def review_identity(record):
    timestamp = clock(record.get('as_of'))
    return (record.get('session'), timestamp.isoformat() if timestamp else None,
            record.get('candidate_id'), record.get('reviewer_id'))


def audit_corpus(corpus):
    records = corpus.get('records') if isinstance(corpus, dict) else None
    if not isinstance(records, list):
        raise ValueError('Corpus must contain a records array')
    audited, groups, sessions = [], {}, {}
    identities = Counter()
    for record in records:
        if isinstance(record, dict):
            identity = review_identity(record)
            if all(label(x) for x in identity):
                identities[identity] += 1
    for index, record in enumerate(records):
        reasons = []
        if not isinstance(record, dict):
            audited.append({'index': index, 'status': 'WITHHELD', 'reasons': ['INVALID_RECORD']})
            counts = sessions.setdefault('UNLABELED', {'records': 0, 'rubric_complete': 0, 'withheld': 0})
            counts['records'] += 1
            counts['withheld'] += 1
            continue
        for field in ('session', 'candidate_id', 'reviewer_id', 'evidence_set_id'):
            if not label(record.get(field)):
                reasons.append(field + ':REQUIRED')
        now, reviewed = clock(record.get('as_of')), clock(record.get('reviewed_at'))
        if now is None or reviewed is None or reviewed > now:
            reasons.append('INVALID_REVIEW_TIME')
        identity = review_identity(record)
        if all(label(x) for x in identity) and identities[identity] > 1:
            reasons.append('DUPLICATE_REVIEW')
        scored = None
        if now is not None:
            scored = score_candidate(record, record['as_of'])
            reasons.extend(scored['component_scoring']['reasons'])
            if reviewed is not None:
                items = list(record.get('eligibility_evidence', {}).values()) if isinstance(record.get('eligibility_evidence'), dict) else []
                for review in record.get('component_reviews', {}).values() if isinstance(record.get('component_reviews'), dict) else []:
                    if isinstance(review, dict) and isinstance(review.get('dimensions'), dict):
                        items.extend(review['dimensions'].values())
                if any(isinstance(item, dict) and clock(item.get('available_at')) is not None
                       and clock(item['available_at']) > reviewed for item in items):
                    reasons.append('REVIEW_PRECEDES_EVIDENCE')
        status = 'WITHHELD' if reasons else 'RUBRIC_COMPLETE'
        audited.append({'index': index, 'candidate_id': record.get('candidate_id'),
                        'status': status, 'reasons': sorted(set(reasons))})
        session = record.get('session') if label(record.get('session')) else 'UNLABELED'
        counts = sessions.setdefault(session, {'records': 0, 'rubric_complete': 0, 'withheld': 0})
        counts['records'] += 1
        counts['rubric_complete' if not reasons else 'withheld'] += 1
        if reasons:
            continue
        evidence = copy.deepcopy({k: record[k] for k in ('component_reviews', 'eligibility_evidence')})
        ratings = {}
        for component, dimensions in RUBRIC.items():
            for dimension in dimensions:
                item = evidence['component_reviews'][component]['dimensions'][dimension]
                ratings[component + '.' + dimension] = item.pop('rating')
        fingerprint = hashlib.sha256(json.dumps(evidence, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        key = (session, now.isoformat(), record['candidate_id'], record['evidence_set_id'], fingerprint)
        groups.setdefault(key, []).append((record['reviewer_id'], ratings))
    comparisons = []
    for key, reviews in sorted(groups.items()):
        for left, right in itertools.combinations(sorted(reviews), 2):
            gaps = {dimension: abs(left[1][dimension] - right[1][dimension]) for dimension in left[1]}
            comparisons.append({'session': key[0], 'as_of': key[1], 'candidate_id': key[2],
                                'evidence_set_id': key[3], 'evidence_fingerprint': key[4],
                                'reviewers': [left[0], right[0]], 'dimensions': len(gaps),
                                'exact_agreement': sum(gap == 0 for gap in gaps.values()) / len(gaps),
                                'mean_absolute_rating_gap': sum(gaps.values()) / len(gaps),
                                'maximum_rating_gap': max(gaps.values())})
    return {'mode': 'OFFLINE_SHADOW', 'method_version': VERSION, 'ranking_effect': 'NONE',
            'records': len(records), 'rubric_complete': sum(row['status'] == 'RUBRIC_COMPLETE' for row in audited),
            'sessions': sessions, 'reviews': audited, 'reviewer_comparisons': comparisons,
            'limitations': ['Rubric completeness does not establish replay admission, factual accuracy, freshness, or performance.',
                            'Session labels and reviewer identities are supplied, not independently authenticated.',
                            'Comparisons require identical evidence and distinct declared reviewers; independence is not verified.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input')
    args = parser.parse_args()
    with open(args.input) as handle:
        print(json.dumps(audit_corpus(json.load(handle)), indent=2))
