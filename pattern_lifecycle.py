"""Completed-bar shadow setup lifecycle. No scoring, orders or network calls."""
import argparse
import copy
import json
from datetime import timedelta
from quality import ET, number, parse_time
from pattern_research import pattern_snapshot

VERSION = 'pattern-lifecycle-v1'
BAR = timedelta(minutes=5)
MAX_BARS = 78
EXPIRY_BARS = 6
BREAKOUT_VOLUME_RATIO = 1.2


def lifecycle(bars, as_of, include_timeline=False):
    now = parse_time(as_of)
    if now is None:
        raise ValueError('Timezone-aware as_of required')
    result = {'method_version': VERSION, 'mode': 'SHADOW', 'status': 'INSUFFICIENT_HISTORY',
              'as_of': now.isoformat(), 'ranking_effect': 'NONE', 'eligibility_effect': 'NONE',
              'timing_basis': 'COMPLETED_BAR_RECONSTRUCTION', 'availability_verified': False,
              'observed_bars': 0, 'directions': {}, 'episodes': [],
              'comparison': {'baseline_version': 1, 'evaluated_prefixes': 0,
                             'baseline_forming_observations': {'UP': 0, 'DOWN': 0},
                             'confirmed_episodes': 0},
              'limitations': ['Provisional setup rules, not a predictive validation or trade signal.',
                              'OHLC bars cannot determine intrabar event order.',
                              'Bar completion is not proof of when source data became available.']}
    if not isinstance(bars, list):
        return {**result, 'status': 'INVALID_HISTORY', 'reason': 'BARS_REQUIRED'}
    complete = []
    for b in bars:
        stamp = parse_time(b.get('time')) if isinstance(b, dict) else None
        if stamp is None:
            return {**result, 'status': 'INVALID_HISTORY', 'reason': 'BAR_TIME_UNKNOWN'}
        if stamp + BAR > now:
            continue  # Future/in-progress values cannot affect the cutoff result.
        h, l, c, v = [number(b.get(k)) if type(b.get(k)) in (int, float) else None
                      for k in ('high', 'low', 'close', 'volume')]
        local = stamp.astimezone(ET)
        if (any(x is None for x in (h, l, c, v)) or l <= 0 or h < l or not l <= c <= h
                or v <= 0 or b.get('interpolated') or local.second or local.microsecond
                or local.minute % 5 or not (570 <= local.hour * 60 + local.minute < 960)):
            return {**result, 'status': 'INVALID_HISTORY', 'reason': 'INVALID_REGULAR_SESSION_BAR'}
        if complete and (stamp - complete[-1]['time'] != BAR
                         or local.date() != complete[-1]['time'].astimezone(ET).date()):
            return {**result, 'status': 'INVALID_HISTORY', 'reason': 'GAP_DUPLICATE_OR_SESSION_MIX'}
        complete.append({'time': stamp, 'high': h, 'low': l, 'close': c, 'volume': v})
    result['observed_bars'] = len(complete)
    if len(complete) > MAX_BARS:
        return {**result, 'status': 'INVALID_HISTORY', 'reason': 'SESSION_LIMIT_EXCEEDED'}
    if complete and (now - (complete[-1]['time'] + BAR)).total_seconds() > 480:
        return {**result, 'status': 'STALE_HISTORY', 'reason': 'LATEST_COMPLETED_BAR_OVER_8_MINUTES_OLD'}
    if len(complete) < 12:
        return result
    result['status'] = 'READY'
    active = {'UP': None, 'DOWN': None}
    timeline = []
    for i in range(11, len(complete)):
        bar = complete[i]
        at = (bar['time'] + BAR).isoformat()
        baseline = {side: pattern_snapshot(complete[:i+1], side) for side in active}
        result['comparison']['evaluated_prefixes'] += 1
        near = {side: all(baseline[side].get(k) is True for k in
                        ('range_compression', 'volume_dry_up', 'directional_structure', 'near_trigger'))
                for side in active}
        for side in active:
            result['comparison']['baseline_forming_observations'][side] += int(near[side])
            current = active[side]
            if current is not None and current['state'] in ('FORMING', 'CONFIRMED'):
                invalid = bar['low'] <= current['invalidation'] if side == 'UP' else bar['high'] >= current['invalidation']
                touched = bar['high'] > current['trigger'] if side == 'UP' else bar['low'] < current['trigger']
                beyond = bar['close'] > current['trigger'] if side == 'UP' else bar['close'] < current['trigger']
                if invalid:
                    current.update(state='INVALIDATED', ended_at=at,
                                   reason='BOTH_LEVELS_TOUCHED' if touched else 'INVALIDATION_TOUCHED')
                elif i - current['_formed_index'] > EXPIRY_BARS:
                    current.update(state='EXPIRED', ended_at=at, reason='SIX_BAR_WINDOW_ENDED')
                elif current['state'] == 'FORMING' and beyond and bar['volume'] >= current['formation_volume'] * BREAKOUT_VOLUME_RATIO:
                    current.update(state='CONFIRMED', confirmed_at=at)
                    result['comparison']['confirmed_episodes'] += 1
                elif current['state'] == 'CONFIRMED':
                    if not beyond:
                        current.update(state='INVALIDATED', ended_at=at, reason='BREAKOUT_CLOSED_BACK_INSIDE')
                    elif bar['low'] <= current['trigger'] <= bar['high'] and current.get('retested_at') is None:
                        current['retested_at'] = at
            elif near[side]:
                recent = complete[i-5:i+1]
                current = {'episode_id': side+':'+at, 'direction': side, 'state': 'FORMING',
                           'formed_at': at, 'trigger': baseline[side]['trigger'],
                           'invalidation': min(b['low'] for b in recent) if side == 'UP' else max(b['high'] for b in recent),
                           'formation_volume': sum(b['volume'] for b in recent)/6,
                           'confirmed_at': None, 'retested_at': None, 'ended_at': None,
                           '_formed_index': i}
                active[side] = current
                result['episodes'].append(current)
            if current is not None:
                current['last_evaluated_at'] = at
                # Completed 15/30-minute close changes describe context only.
                signs = []
                for n in (3, 6):
                    change = bar['close'] - complete[i-n]['close']
                    signs.append('UP' if change > 0 else 'DOWN' if change < 0 else 'FLAT')
                current['trend_alignment'] = ('ALIGNED' if all(s == side for s in signs)
                                              else 'AGAINST' if all(s not in (side, 'FLAT') for s in signs) else 'MIXED')
        if include_timeline:
            timeline.append({'bar_end': at, 'baseline_forming': near,
                             'states': {s: active[s]['state'] if active[s] else 'NO_SETUP' for s in active}})
    result['directions'] = {side: copy.deepcopy(value) if value else {'state': 'NO_SETUP'} for side, value in active.items()}
    for record in result['episodes'] + list(result['directions'].values()):
        record.pop('_formed_index', None)
    if include_timeline:
        result['timeline'] = timeline
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', help='JSON containing research_bars and as_of')
    args = parser.parse_args()
    with open(args.input) as handle:
        source = json.load(handle)
    print(json.dumps(lifecycle(source.get('research_bars'), source.get('as_of'), True), indent=2))
