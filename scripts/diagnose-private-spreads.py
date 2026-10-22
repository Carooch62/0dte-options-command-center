"""Reconcile a private quote export with its exact full research snapshot and batch.

Local-only diagnostics. Output contains private observations: never commit it.
Does not fetch quotes, infer missing clocks, or change scanner eligibility.
"""
import argparse
from collections import Counter, defaultdict
import importlib.util
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from quote_latency import clock, valid_observation

spec = importlib.util.spec_from_file_location('batch_audit', Path(__file__).with_name('audit-candidate-batch.py'))
batch_audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch_audit)


def book(bid, ask):
    bid, ask = batch_audit.numeric(bid), batch_audit.numeric(ask)
    if bid is None or ask is None or not 0 < bid <= ask:
        return {'status': 'INVALID_BOOK'}
    spread, relative = ask - bid, (ask - bid) / ((ask + bid) / 2) * 100
    return dict(bid=bid, ask=ask, spread=spread, spread_pct_midpoint=relative,
                status='WIDE_SPREAD' if spread > .10 + 1e-9 or relative > 30 + 1e-9 else 'SPREAD_PASSED')


def diagnose(snapshot, batch, export):
    audit = batch_audit.audit(snapshot, batch)
    if audit['status'] != 'PASS':
        raise ValueError('Source-to-batch audit failed; reconcile source evidence first')
    context = export.get('scanner_context') or {}
    if (not snapshot.get('scan_id') or context.get('scan_id') != snapshot['scan_id']
            or clock(context.get('generated_at')) != clock(snapshot['generated_at'])
            or context.get('packet_id') is not None):
        raise ValueError('Export must refer to this exact production scan and original generation clock')
    cutoff = clock(export.get('as_of'))
    observations = export.get('observations')
    if (export.get('format') != 'shadow-outcome-input-v1' or cutoff is None
            or cutoff < clock(snapshot['generated_at']) or not isinstance(observations, list)
            or len(observations) > 2000):
        raise ValueError('Expected a bounded quote export with a valid cutoff')
    selected = {c['options'][0]['contract_id']: c for c in batch['candidates']}
    if len(selected) != len(batch['candidates']) or any(not isinstance(k, str) or not k for k in selected):
        raise ValueError('Batch contract labels must be unique and nonempty')
    # Join through audited exact identities, not a guessed ticker/strike or OCC parser.
    research = {}
    for c in snapshot['candidates']:
        for o in c.get('options', []) + [o for g in c.get('expiry_groups', {}).values() for o in g.get('options', [])]:
            key = batch_audit.identity(c['ticker'], o)
            for label, candidate in selected.items():
                if key == batch_audit.identity(candidate['ticker'], candidate['options'][0]):
                    research.setdefault(label, o)
    unique, duplicates = {}, 0
    for q in observations:
        if not valid_observation(q, cutoff) or q['contract_id'] not in selected:
            raise ValueError('Invalid observation clocks or contract outside the audited batch')
        if ('quote_check' in q and q['quote_check'] not in ('QUOTE_CHECK_PASSED', 'REQUIRES_RECHECK', 'UNVERIFIED')
                or 'quote_check_reasons' in q and (not isinstance(q['quote_check_reasons'], list)
                    or any(not isinstance(reason, str) for reason in q['quote_check_reasons']))):
            raise ValueError('Malformed quote-check diagnostics')
        if clock(q['received_at']) < clock(snapshot['generated_at']):
            raise ValueError('Observation receipt predates the selected scan')
        key = q['contract_id'], clock(q['received_at'])
        if key in unique:
            if unique[key] != q:
                raise ValueError('Conflicting observations for one contract and receipt')
            duplicates += 1
        unique[key] = q
    groups = defaultdict(set)
    for q in unique.values():
        groups[clock(q['received_at'])].add(q['contract_id'])
    contracts = []
    for label, candidate in selected.items():
        source = research[label]
        rows = sorted((q for q in unique.values() if q['contract_id'] == label), key=lambda q: clock(q['received_at']))
        computed = [book(q.get('bid'), q.get('ask')) for q in rows]
        checks = Counter(q.get('quote_check', 'UNKNOWN') for q in rows)
        contradictions = [q['received_at'] for q, b in zip(rows, computed)
                          if (q.get('quote_check') == 'QUOTE_CHECK_PASSED' and b['status'] != 'SPREAD_PASSED')
                          or ('WIDE_SPREAD' in (q.get('quote_check_reasons') or []) and b['status'] != 'WIDE_SPREAD')
                          or (q.get('quote_check') in ('QUOTE_CHECK_PASSED', 'REQUIRES_RECHECK')
                              and b['status'] == 'WIDE_SPREAD' and 'WIDE_SPREAD' not in (q.get('quote_check_reasons') or []))]
        contracts.append({
            'contract_id': label, 'identity': batch_audit.identity(candidate['ticker'], candidate['options'][0]),
            'research': {**book(source.get('bid'), source.get('ask')),
                         'source': source.get('source'), 'option_timestamp': source.get('option_timestamp'),
                         'quote_time_status': 'AVAILABLE' if clock(source.get('option_timestamp')) is not None else 'UNKNOWN',
                         'timestamp_basis': source.get('timestamp_basis'),
                         'minimum_delay_minutes': source.get('minimum_delay_minutes')},
            'observation_count': len(rows), 'quote_checks': dict(checks),
            'computed_book_checks': dict(Counter(b['status'] for b in computed)),
            'live_asks_above_030': sum(b.get('ask', 0) > .30 for b in computed),
            'diagnostic_contradictions_at': contradictions,
            'first_live_book': ({**computed[0], 'observed_at': rows[0]['observed_at'],
                                 'received_at': rows[0]['received_at']} if rows else None),
            'missing_from_observed_receipt_batches': sum(label not in labels for labels in groups.values()),
        })
    return {'format': 'private-spread-diagnostic-v1', 'status': 'REVIEW_REQUIRED',
            'scan_id': snapshot['scan_id'], 'generated_at': snapshot['generated_at'], 'as_of': export['as_of'],
            'source_batch_audit': 'PASS', 'observation_count': len(unique),
            'identical_duplicates_skipped': duplicates, 'observed_receipt_batches': len(groups), 'contracts': contracts,
            'limitations': [
                'Different sources and times: a book difference does not identify its cause.',
                'Missing or timezone-naive option timestamps stay unverified. Payload, trade and scan clocks are not quote clocks.',
                'Spread checks alone do not establish identity, freshness, full eligibility or execution quality.',
                'Supplied labels and metadata are not independently authenticated provider evidence.',
                'Missing counts cover observed receipt batches only; whole failed or empty requests are not inferred.',
                'Live ask above $0.30 is separate from spread and full quote-check status.',
            ]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('snapshot', 'batch', 'export'):
        parser.add_argument(name)
    args = parser.parse_args()
    names = ('snapshot', 'batch', 'export')
    raw = [Path(getattr(args, name)).read_bytes() for name in names]
    report = diagnose(*(json.loads(data) for data in raw))
    report['input_sha256'] = dict(zip(names, (hashlib.sha256(data).hexdigest() for data in raw)))
    print(json.dumps(report, indent=2))
