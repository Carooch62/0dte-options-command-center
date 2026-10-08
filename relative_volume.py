"""Limited-history, same-clock five-minute RVOL; research only, never a gate."""
from datetime import timedelta
from market_clock import calendar, session_info, ET
from quality import number, parse_time

MIN_SESSIONS = 3
LOOKBACK_SESSIONS = 4


def same_time_rvol(bars, now, source=None):
    now = now.astimezone(ET)
    result = {
        'version': 1, 'mode': 'SHADOW', 'status': 'INSUFFICIENT_HISTORY',
        'method': 'LATEST_5M_VS_SAME_ET_SLOT_MEAN', 'ratio': None,
        'current_volume': None, 'baseline_mean_volume': None,
        'baseline_sessions': [], 'baseline_count': 0,
        'minimum_sessions': MIN_SESSIONS, 'lookback_sessions': LOOKBACK_SESSIONS,
        'bar_timestamp': None, 'bar_end': None, 'slot_et': None,
        'source': source, 'missing_sessions': [], 'excluded_sessions': [],
        'note': 'Limited five-day feed history; research only, not an entry gate.',
    }
    info = session_info(now)
    if info['session'] != 'OPEN':
        result['status'] = 'NOT_REGULAR_SESSION'
        return result
    op, cl = parse_time(info['open_at']), parse_time(info['close_at'])
    parsed = [(parse_time(b.get('time')), b) for b in bars]
    current = [(t, b) for t, b in parsed if t and op <= t < cl and t + timedelta(minutes=5) <= now]
    if not current:
        result['status'] = 'NO_COMPLETED_BAR'
        return result
    stamp = max(t for t, _ in current)
    latest = [b for t, b in current if t == stamp]
    end = stamp + timedelta(minutes=5)
    local = stamp.astimezone(ET)
    result.update(bar_timestamp=stamp.isoformat(), bar_end=end.isoformat(), slot_et=local.strftime('%H:%M'))

    def valid(t, b):
        v = number(b.get('volume'))
        return (v is not None and v >= 0 and not isinstance(b.get('volume'), bool)
                and not b.get('interpolated') and t.second == 0 and t.microsecond == 0
                and t.astimezone(ET).minute % 5 == 0)

    if len(latest) != 1 or not valid(stamp, latest[0]):
        result['status'] = 'INVALID_CURRENT_BAR'
        return result
    result['current_volume'] = number(latest[0]['volume'])
    if now - end > timedelta(minutes=8):
        result['status'] = 'STALE'
        return result
    cal = calendar()
    session = cal.date_to_session(now.date().isoformat())
    expected = []
    for _ in range(LOOKBACK_SESSIONS):
        session = cal.previous_session(session)
        expected.append(session)
    baseline = []
    for session in expected:
        day = session.date().isoformat()
        start = cal.session_open(session).to_pydatetime()
        close = cal.session_close(session).to_pydatetime()
        matches = [(t, b) for t, b in parsed if t and t.astimezone(ET).date().isoformat() == day
                   and (t.astimezone(ET).hour, t.astimezone(ET).minute) == (local.hour, local.minute)]
        if not matches:
            result['missing_sessions'].append(day)
        elif (len(matches) != 1 or not valid(*matches[0])
              or not start <= matches[0][0] or matches[0][0] + timedelta(minutes=5) > close):
            result['excluded_sessions'].append(day)
        else:
            baseline.append(number(matches[0][1]['volume']))
            result['baseline_sessions'].append(day)
    result['baseline_count'] = len(baseline)
    if len(baseline) < MIN_SESSIONS:
        return result
    mean = sum(baseline) / len(baseline)
    result['baseline_mean_volume'] = round(mean, 4)
    if mean <= 0:
        result['status'] = 'ZERO_BASELINE'
        return result
    result.update(status='READY', ratio=round(result['current_volume'] / mean, 4))
    return result
