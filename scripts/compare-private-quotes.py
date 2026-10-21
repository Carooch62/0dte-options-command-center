"""Prepare a private before/after quote report; never publish its output to git."""
import argparse
from collections import Counter
from pathlib import Path
import json
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from quote_latency import clock, percentile, summarize_exports, valid_observation


def cohort(exports):
    report = summarize_exports(exports)
    unique = {}
    for data in exports:
        cutoff = clock(data['as_of'])
        for q in data['observations']:
            if valid_observation(q, cutoff):
                key = (q['contract_id'], clock(q['observed_at']), clock(q['received_at']))
                # Conflicting copies cannot silently count as good evidence.
                if key in unique and unique[key] != q:
                    raise ValueError('Conflicting observation copies; reconcile exports before comparison')
                unique[key] = q
    rows = list(unique.values())
    ages = [(clock(q['received_at']) - clock(q['observed_at'])).total_seconds() for q in rows]
    contracts = sorted({q['contract_id'] for q in rows})
    sizes = Counter(b['observed_contracts'] for b in report['batches'])
    checks = Counter(q.get('quote_check', 'UNKNOWN') for q in rows)
    report.pop('batches')
    report.update(observation_count=len(rows), contract_ids=contracts,
                  returned_batch_sizes=dict(sorted(sizes.items())), quote_check_counts=dict(checks),
                  provider_quote_age_at_receipt_seconds={
                      'samples': len(ages), 'p50': percentile(ages, .5), 'p95': percentile(ages, .95),
                      'max': max(ages) if ages else None},
                  scanner_contexts=[data.get('scanner_context') for data in exports])
    return report


def compare(before, after):
    baseline = cohort(before)
    current = cohort(after) if after else None
    shared = sorted(set(baseline['contract_ids']) & set(current['contract_ids'])) if current else []
    # Keep cohorts separate: combining dates would obscure before/after performance.
    return {'format': 'private-quote-comparison-v1',
            'status': 'REQUIRES_REVIEW' if current else 'AWAITING_POST_RELEASE_EXPORT',
            'baseline': baseline, 'post_release': current, 'shared_contract_ids': shared,
            'improvement_verified': False,
            'review_requirements': [
                'Compare initialized, reused and unknown groups separately; never infer legacy reuse labels.',
                'Match batch sizes and comparable market conditions; inspect overlapping contract cohorts.',
                'Report retained failures and missing requested contracts separately; absent logs mean unknown.',
                'Lower request duration must not accompany worse provider age, quote checks or identity coverage.',
                'At least 20 successful foreground requests across two verified open sessions is a collection minimum, not proof.',
                'Provider quote age at receipt is per contract, not exchange-to-screen latency.',
                'p95 is descriptive and unstable for small samples; no automatic pass is assigned.'
            ]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--before', nargs='+', required=True)
    parser.add_argument('--after', nargs='*', default=[])
    args = parser.parse_args()
    def load(paths):
        return [json.loads(Path(path).read_text()) for path in paths]
    print(json.dumps(compare(load(args.before), load(args.after)), indent=2))
