"""Independently reconcile a public private-loader batch against its full snapshot.

No production projection/quality code is imported. No network or broker data is read.
Exit 1 means reconciliation failed; source freshness is reported separately.
"""
import argparse
from collections import Counter
from datetime import date, datetime
import hashlib
import json
import math
import re


def numeric(value):
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except ValueError:
        return None


def identity(ticker, option):
    expiry, strike = option.get('expiry'), numeric(option.get('strike'))
    if not isinstance(ticker, str) or not re.fullmatch(r'[A-Z][A-Z0-9.-]{0,9}', ticker):
        return None
    try:
        if not isinstance(expiry, str) or date.fromisoformat(expiry).isoformat() != expiry:
            return None
    except ValueError:
        return None
    if option.get('side') not in ('call', 'put') or strike is None or not 0 < strike <= 1000000:
        return None
    return ticker, expiry, option['side'], strike


def audit(snapshot, batch):
    if not isinstance(snapshot.get('candidates'), list) or snapshot.get('delivery_window'):
        raise ValueError('Supply the original full scanner snapshot, not a delivery projection')
    snapshot_day = date.fromisoformat(snapshot['market_date'])
    generated = datetime.fromisoformat(snapshot['generated_at'].replace('Z', '+00:00'))
    if generated.utcoffset() is None:
        raise ValueError('Source clock needs a timezone')
    counts, seen, ranked, conflicts, raw_failures = Counter(), {}, [], [], []
    screens = ('quote_valid', 'near_atm', 'delta_ok', 'usable_spread')
    relevant = ('contract_id', 'ask', 'bid', 'volume', 'dte', 'delta', 'delta_verified',
                'greeks_verified', 'contract_score') + screens
    for row in snapshot['candidates']:
        options = list(row.get('options', []))
        for group in row.get('expiry_groups', {}).values():
            options.extend(group.get('options', []))
        accepted = []
        for option in options:
            counts['source_occurrences'] += 1
            key = identity(row.get('ticker'), option)
            if key is None:
                counts['invalid_identity_occurrences'] += 1
                continue
            signature = {k: option.get(k) for k in relevant}
            if key in seen:
                counts['duplicate_occurrences'] += 1
                if signature != seen[key]:
                    conflicts.append(list(key))
                continue
            seen[key] = signature
            counts['scanned_contracts'] += 1
            ask = numeric(option.get('ask'))
            if ask is None or not 0 < ask <= .30:
                continue
            counts['price_qualifying_contracts'] += 1
            dte, volume = option.get('dte'), numeric(option.get('volume'))
            if (any(option.get(k) is not True for k in screens) or volume is None or volume < 20
                    or type(dte) is not int or not 0 <= dte <= 14):
                continue
            counts['qualifying_contracts'] += 1
            # Cross-check published passes against raw numeric evidence, independently.
            bid, delta, price = numeric(option.get('bid')), numeric(option.get('delta')), numeric(row.get('price'))
            failures = []
            if bid is None or not 0 < bid <= ask:
                failures.append('book')
            else:
                if ask - bid > .10 or (ask - bid) / ((ask + bid) / 2) * 100 > 30:
                    failures.append('spread')
            if price is None or price <= 0 or abs(key[3] - price) / price * 100 > 3:
                failures.append('strike_distance')
            if (delta is None or not .30 <= abs(delta) <= .50 or
                    (delta > 0) != (key[2] == 'call') or
                    not option.get('delta_verified', option.get('greeks_verified'))):
                failures.append('delta')
            if (date.fromisoformat(key[1]) - snapshot_day).days != dte:
                failures.append('expiry_dte')
            if failures:
                raw_failures.append({'identity': list(key), 'checks': failures})
            score = numeric(option.get('contract_score'))
            accepted.append((score if score is not None else -math.inf, key, option, ask))
        ranked.extend(sorted(accepted, key=lambda record: record[0], reverse=True))
    selected, omitted, per_ticker = [], [], Counter()
    for _, key, option, ask in ranked:
        if len(selected) == 20 or per_ticker[key[0]] == 2:
            omitted.append({'identity': list(key), 'reason': 'BATCH_CAP' if len(selected) == 20 else 'TICKER_CAP'})
            continue
        per_ticker[key[0]] += 1
        selected.append({'ticker': key[0], 'options': [{
            'contract_id': option.get('contract_id') or f'{key[0]} {key[3]:g} {key[2]} {key[1]}',
            'ticker': key[0], 'expiry': key[1], 'side': key[2], 'strike': key[3], 'scanner_ask': ask}]})
    expected = {k: counts[k] for k in ('scanned_contracts', 'price_qualifying_contracts', 'qualifying_contracts')}
    expected.update(research_rejected_contracts=counts['price_qualifying_contracts']-counts['qualifying_contracts'],
                    total_contracts=counts['qualifying_contracts'], included_contracts=len(selected),
                    omitted_contracts=counts['qualifying_contracts']-len(selected), max_per_ticker=2,
                    generated_at=snapshot['generated_at'], scan_id=snapshot.get('scan_id'),
                    market_session=snapshot.get('market_session'), format='candidate-identities-v1',
                    selection_policy='published-research-screens-v1', environment='production',
                    source='main / market-dashboard.json', ranking_effect='NONE', candidates=selected)
    mismatches = [key for key, value in expected.items() if batch.get(key) != value]
    return {'status': 'PASS' if not (mismatches or conflicts or raw_failures) else 'FAIL',
            'scan_id': snapshot.get('scan_id'), 'generated_at': snapshot['generated_at'],
            'market_date': snapshot['market_date'], 'scanner_rows': len(snapshot['candidates']),
            'counts': dict(counts), 'expected_batch_counts': {k: v for k, v in expected.items() if k.endswith('_contracts')},
            'mismatched_fields': mismatches, 'conflicting_duplicate_identities': conflicts,
            'raw_evidence_failures': raw_failures, 'selected': selected, 'omitted': omitted,
            'limitations': ['Snapshot-to-batch integrity only; not an independent provider chain audit.',
                            'Retained source market-session label is historical; PASS does not mean current quotes.',
                            'Provider metadata matching and live quote checks remain separate.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('snapshot')
    parser.add_argument('batch')
    args = parser.parse_args()
    inputs = [open(path, 'rb').read() for path in (args.snapshot, args.batch)]
    report = audit(*(json.loads(data) for data in inputs))
    report['input_sha256'] = dict(zip(('snapshot', 'batch'), (hashlib.sha256(data).hexdigest() for data in inputs)))
    print(json.dumps(report, indent=2))
    raise SystemExit(report['status'] != 'PASS')
