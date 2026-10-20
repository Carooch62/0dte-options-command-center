"""Capture-time pattern ledger; reconstructed bar times never become observations."""
import copy
import math
import argparse
import json
from pathlib import Path
from collections import Counter
from news_research import clock
from pattern_lifecycle import VERSION

FIELDS = ('episode_id', 'direction', 'state', 'formed_at', 'trigger', 'invalidation',
          'formation_volume', 'confirmed_at', 'retested_at', 'ended_at', 'reason')
STATES = ('FORMING', 'CONFIRMED', 'INVALIDATED', 'EXPIRED')


def snapshot_observations(snapshot):
    """Allowlist every scanned stock, independently of selected option contracts."""
    rows = []
    for stock in snapshot.get('candidates', []):
        ticker = stock.get('ticker')
        if not isinstance(ticker, str) or not ticker.strip():
            continue
        pattern = stock.get('pattern_research')
        pattern = pattern if isinstance(pattern, dict) else {}
        life = pattern.get('lifecycle')
        life = life if isinstance(life, dict) else {}
        events = life.get('episodes', [])
        status = life.get('status', 'NOT_RECORDED')
        if not isinstance(events, list):
            status, events = 'INVALID_EPISODE_LIST', []
        rows.append({'ticker': ticker, 'method_version': life.get('method_version'),
                     'status': status,
                     'baseline_direction': stock.get('direction'),
                     'baseline_early_watch': stock.get('early_watch'),
                     'baseline_forming': (all(pattern.get(k) is True for k in
                         ('range_compression', 'volume_dry_up', 'directional_structure', 'near_trigger'))
                         if pattern.get('status') == 'READY' else None),
                     'episodes': [{k: copy.deepcopy(e[k]) for k in FIELDS if k in e}
                                  for e in events if isinstance(e, dict)]})
    return rows


def valid_episode(event, cutoff):
    formed = clock(event.get('formed_at'))
    side, state = event.get('direction'), event.get('state')
    if (side not in ('UP', 'DOWN') or state not in STATES or formed is None or formed > cutoff
            or event.get('episode_id') != side + ':' + event.get('formed_at', '')):
        return False
    levels = [event.get(k) for k in ('trigger', 'invalidation', 'formation_volume')]
    if any(type(v) not in (int, float) or not math.isfinite(v) or v <= 0 for v in levels):
        return False
    trigger, invalid, _ = levels
    if not (invalid < trigger if side == 'UP' else invalid > trigger):
        return False
    times = {k: clock(event.get(k)) for k in ('confirmed_at', 'retested_at', 'ended_at')}
    if any(event.get(k) is not None and (t is None or not formed < t <= cutoff) for k, t in times.items()):
        return False
    confirmed, retest, ended = [times[k] for k in ('confirmed_at', 'retested_at', 'ended_at')]
    if retest is not None and (confirmed is None or retest <= confirmed):
        return False
    if ended is not None and any(t is not None and t > ended for t in (confirmed, retest)):
        return False
    return ((state == 'FORMING' and all(t is None for t in times.values()))
            or (state == 'CONFIRMED' and confirmed is not None and ended is None)
            or (state in ('INVALIDATED', 'EXPIRED') and ended is not None))


def prospective_report(packets, as_of):
    now = clock(as_of)
    if now is None:
        raise ValueError('Timezone-aware as_of required')
    unique, exclusions = {}, []
    conflicts = set()
    for p in packets:
        if not isinstance(p, dict):
            exclusions.append({'reason': 'INVALID_PACKET'})
            continue
        ident, generated, captured = p.get('packet_id'), clock(p.get('generated_at')), clock(p.get('captured_at'))
        if (not isinstance(ident, str) or not ident or generated is None or captured is None
                or not generated <= captured <= now):
            exclusions.append({'packet_id': ident, 'reason': 'INVALID_OR_FUTURE_PACKET_CLOCKS'})
            continue
        if ident in unique and unique[ident] != p:
            conflicts.add(ident)
        unique[ident] = p
    for ident in conflicts:
        unique.pop(ident)
        exclusions.append({'packet_id': ident, 'reason': 'CONFLICTING_PACKET_ID'})
    ledger, coverage, gaps, untracked = {}, Counter(), [], 0
    baseline = {'forming': Counter(), 'early_watch': Counter()}
    for p in sorted(unique.values(), key=lambda p: (clock(p['captured_at']), p['packet_id'])):
        rows = p.get('pattern_observations')
        if not isinstance(rows, list):
            untracked += 1  # Never reconstruct capture-time history from old stock bars.
            continue
        generated, captured = clock(p['generated_at']), clock(p['captured_at'])
        counts = Counter(r.get('ticker') for r in rows if isinstance(r, dict) and isinstance(r.get('ticker'), str))
        for row in rows:
            ticker = row.get('ticker') if isinstance(row, dict) else None
            if not isinstance(ticker, str) or not ticker or counts[ticker] != 1:
                gaps.append({'packet_id': p['packet_id'], 'ticker': ticker, 'reason': 'INVALID_OR_DUPLICATE_TICKER'})
                continue
            status = row.get('status')
            coverage[status if isinstance(status, str) else 'UNKNOWN'] += 1
            for name, field in (('forming', 'baseline_forming'), ('early_watch', 'baseline_early_watch')):
                value = row.get(field)
                baseline[name]['TRUE' if value is True else 'FALSE' if value is False else 'UNKNOWN'] += 1
            if row.get('method_version') != VERSION or status != 'READY':
                if row.get('method_version') != VERSION and status != 'NOT_RECORDED':
                    gaps.append({'packet_id': p['packet_id'], 'ticker': ticker, 'reason': 'UNSUPPORTED_METHOD'})
                continue
            events = row.get('episodes')
            if not isinstance(events, list):
                gaps.append({'packet_id': p['packet_id'], 'ticker': ticker, 'reason': 'INVALID_EPISODE_LIST'})
                continue
            ids = Counter(e.get('episode_id') for e in events if isinstance(e, dict) and isinstance(e.get('episode_id'), str))
            for event in events:
                if not isinstance(event, dict) or not valid_episode(event, generated):
                    gaps.append({'packet_id': p['packet_id'], 'ticker': ticker, 'reason': 'INVALID_EPISODE'})
                    continue
                key = (ticker, row['method_version'], event['episode_id'])
                record = ledger.setdefault(key, {'ticker': ticker, 'method_version': row['method_version'],
                    'episode_id': event['episode_id'], 'direction': event['direction'],
                    'formed_at': event['formed_at'], 'trigger': event['trigger'],
                    'invalidation': event['invalidation'], 'formation_volume': event['formation_volume'],
                    'first_observed_at': captured.isoformat(), 'first_observed_state': event['state'],
                    'last_observed_at': captured.isoformat(), 'last_packet_id': p['packet_id'],
                    'status': 'RECORDED', 'reasons': [], 'observations': [],
                    'observed_forming_at': None, 'observed_confirmation_at': None})
                reasons = record['reasons']
                if ids[event['episode_id']] != 1:
                    reasons.append('DUPLICATE_EPISODE')
                if any(event[k] != record[k] for k in ('formed_at', 'trigger', 'invalidation', 'formation_volume', 'direction')):
                    reasons.append('FROZEN_EVIDENCE_CHANGED')
                signature = {k: event.get(k) for k in ('state', 'confirmed_at', 'retested_at', 'ended_at', 'reason')}
                previous = record['observations'][-1] if record['observations'] else None
                if previous:
                    old = previous['state']
                    if (old in ('INVALIDATED', 'EXPIRED') and event['state'] != old) or (old == 'CONFIRMED' and event['state'] == 'FORMING'):
                        reasons.append('STATE_REGRESSION')
                    if captured == clock(previous['observed_at']) and any(signature[k] != previous.get(k) for k in signature):
                        reasons.append('SAME_CAPTURE_CONFLICT')
                    for k in ('confirmed_at', 'retested_at', 'ended_at'):
                        if previous.get(k) is not None and event.get(k) != previous[k]:
                            reasons.append('RECORDED_EVENT_TIME_CHANGED')
                record.update(last_observed_at=captured.isoformat(), last_packet_id=p['packet_id'])
                if event['state'] == 'FORMING' and record['observed_forming_at'] is None:
                    record['observed_forming_at'] = captured.isoformat()
                if event['state'] == 'CONFIRMED' and record['observed_confirmation_at'] is None:
                    record['observed_confirmation_at'] = captured.isoformat()
                if previous is None or any(signature[k] != previous.get(k) for k in signature):
                    record['observations'].append({**signature, 'observed_at': captured.isoformat(), 'packet_id': p['packet_id']})
                record['reasons'] = sorted(set(reasons))
                if reasons:
                    record['status'] = 'WITHHELD'
    records = list(ledger.values())
    recorded = [r for r in records if r['status'] == 'RECORDED']
    return {'format': 'pattern-prospective-v1', 'mode': 'SHADOW', 'as_of': now.isoformat(),
            'ranking_effect': 'NONE', 'eligibility_effect': 'NONE', 'performance_evaluated': False,
            'packets': len(unique), 'packets_without_tracking': untracked,
            'coverage_observations': dict(coverage), 'excluded_packets': exclusions,
            'baseline_observations': {k: dict(v) for k, v in baseline.items()},
            'evidence_gaps': gaps, 'episodes': records,
            'summary': {'recorded': len(recorded), 'withheld': len(records)-len(recorded),
                        'first_seen_states': dict(Counter(r['first_observed_state'] for r in recorded)),
                        'forming_then_confirmation_observed': sum(r['observed_forming_at'] is not None
                            and r['observed_confirmation_at'] is not None
                            and clock(r['observed_forming_at']) < clock(r['observed_confirmation_at']) for r in recorded)},
            'limitations': ['Capture time is first observed in supplied retained packets, not earliest possible live detection.',
                            'Bar-end event times remain reconstructions; packet clocks are supplied metadata.',
                            'Missing scans, absent tickers and omitted episodes do not imply expiry or no setup.',
                            'Historical packets without tracking are not backfilled; retained history is a rolling window.',
                            'No independent outcome samples, profitability or detection improvement established.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('packets', nargs='+', help='Retained public shadow packet JSON files')
    parser.add_argument('--as-of', required=True, help='Timezone-aware observation cutoff')
    args = parser.parse_args()
    print(json.dumps(prospective_report([json.loads(Path(p).read_text()) for p in args.packets], args.as_of), indent=2))
