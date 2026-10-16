"""Summarize private exported request durations locally; never exchange latency."""
import argparse
from collections import defaultdict
from datetime import datetime
import json
import math
from zoneinfo import ZoneInfo

FIELDS = ('setup_ms', 'quote_ms', 'worker_ms', 'browser_ms')


def clock(value):
    if not isinstance(value, str):
        return None
    try:
        result = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return result if result.utcoffset() is not None else None
    except ValueError:
        return None


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def timing(value):
    if not isinstance(value, dict):
        return None
    if any(not number(value.get(k)) or not 0 <= value[k] <= 600000 for k in FIELDS):
        return None
    return {k: value[k] for k in FIELDS}


def percentile(values, fraction):
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * fraction) - 1)] if ordered else None


def valid_observation(q, cutoff):
    if not isinstance(q, dict):
        return False
    observed, received = clock(q.get('observed_at')), clock(q.get('received_at'))
    return (isinstance(q.get('contract_id'), str) and bool(q['contract_id'].strip())
            and observed is not None and received is not None and observed <= received <= cutoff)


def summarize(data):
    cutoff = clock(data.get('as_of')) if isinstance(data, dict) else None
    if (cutoff is None or data.get('format') != 'shadow-outcome-input-v1'
            or not isinstance(data.get('observations'), list) or len(data['observations']) > 2000):
        raise ValueError('Expected a bounded private quote export with a timezone-aware cutoff')
    groups, excluded = defaultdict(list), 0
    for q in data['observations']:
        if not valid_observation(q, cutoff):
            excluded += 1
            continue
        groups[clock(q['received_at'])].append(q)
    batches, samples, sessions = [], [], set()
    for received, rows in sorted(groups.items()):
        row = {'received_at': received.isoformat(), 'observed_contracts': len(rows)}
        metrics = [timing(q.get('request_timing')) for q in rows]
        if len({q['contract_id'] for q in rows}) != len(rows):
            row['status'] = 'WITHHELD_DUPLICATE_CONTRACT'
        elif any(m is None for m in metrics):
            row['status'] = 'WITHHELD_MISSING_OR_INVALID_TIMING'
        elif any(m != metrics[0] for m in metrics):
            row['status'] = 'WITHHELD_CONFLICTING_TIMING'
        else:
            row.update(status='MEASURED_REQUEST', request_timing=metrics[0])
            samples.append(metrics[0])
            sessions.add(received.astimezone(ZoneInfo('America/New_York')).date().isoformat())
        batches.append(row)
    return {
        'format': 'private-quote-latency-report-v1', 'as_of': data['as_of'],
        'request_count': len(batches), 'timed_request_count': len(samples),
        'excluded_observations': excluded, 'timed_session_dates_et': sorted(sessions),
        'collection_minimum_met': len(samples) >= 20 and len(sessions) >= 2,
        'percentile_method': 'NEAREST_RANK_ONE_SAMPLE_PER_RECEIPT_BATCH',
        'durations_ms': {k: {'samples': len(samples),
                             'p50': percentile([s[k] for s in samples], .50),
                             'p95': percentile([s[k] for s in samples], .95)} for k in FIELDS},
        'batches': batches, 'latency_verified': False,
        'limitations': [
            'Local supplied diagnostics, not independently authenticated measurements.',
            'Request durations overlap and do not measure exchange-to-screen latency.',
            'Dates count supplied observations, not verified open-market sessions.',
            'No request-attempt log: failure rate and requested/missing counts are unknown.',
            'The collection minimum alone does not establish pilot acceptance or improvement.',
            'Contract observations sharing receipt time count as one request, not independent samples.'
        ]
    }


def summarize_exports(exports):
    if not exports or len(exports) > 100:
        raise ValueError('Supply 1–100 private exports')
    merged, seen, excluded, repeated, cutoffs = [], set(), 0, 0, []
    for data in exports:
        # Validate each source at its own original cutoff before combining dates.
        report = summarize(data)
        excluded += report['excluded_observations']
        cutoff = clock(data['as_of'])
        cutoffs.append(cutoff)
        source_signatures = set()
        for q in data['observations']:
            if not valid_observation(q, cutoff):
                continue
            signature = (q['contract_id'], clock(q['observed_at']), clock(q['received_at']),
                         json.dumps(timing(q.get('request_timing')), sort_keys=True))
            if signature in seen:
                repeated += 1
                continue
            source_signatures.add(signature)
            merged.append(q)
        seen.update(source_signatures)
    # Input caps still apply per export; analyze larger collections in bounded batches.
    if len(merged) > 2000:
        raise ValueError('Combined collection exceeds 2000 unique observations')
    result = summarize({'format': 'shadow-outcome-input-v1',
                        'as_of': max(cutoffs).isoformat(), 'observations': merged})
    result.update(source_export_count=len(exports), excluded_observations=excluded,
                  repeated_observations_skipped=repeated)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inputs', nargs='+', help='Private exported JSON files; processed locally only')
    args = parser.parse_args()
    exports = []
    for path in args.inputs:
        with open(path) as handle:
            exports.append(json.load(handle))
    print(json.dumps(summarize_exports(exports), indent=2))
