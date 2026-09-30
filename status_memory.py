"""Preserve setup observations independently of present data availability.

This is display history, never input to signal generation or option markouts.
"""
from datetime import timedelta
from quality import parse_time, ET

STATES = {'PASS', 'WATCH', 'SECOND-WAVE', 'TRIGGERED', 'CONFIRMED', 'DECAYING'}


def observation(row, snapshot):
    now = parse_time(snapshot.get('generated_at'))
    end = parse_time(row.get('bar_end'))
    start = parse_time(row.get('bar_timestamp'))
    if end is None and start is not None:
        end = start + timedelta(minutes=5)
    if now is None or end is None or row.get('execution_state') not in STATES:
        return None
    local = now.astimezone(ET)
    # Legacy history has no session field; only recover timestamped regular-session bars.
    if snapshot.get('market_session', 'OPEN') != 'OPEN' or not (570 <= local.hour * 60 + local.minute < 960):
        return None
    if end.astimezone(ET).date() != local.date() or not (0 <= (now-end).total_seconds() <= 480):
        return None
    if row.get('price_freshness', 'RECENT') != 'RECENT':
        return None
    return {'state': row['execution_state'], 'observed_at': snapshot['generated_at'],
            'bar_end': end.isoformat(), 'direction': row.get('direction'), 'scan_id': snapshot.get('scan_id')}


def attach_last_status(data, history):
    cutoff = parse_time(data.get('generated_at'))
    saved = {}
    def retain(ticker, record):
        if not record or record.get('state') not in STATES:
            return
        stamp = parse_time(record.get('observed_at'))
        if stamp is None or cutoff is None or stamp > cutoff:
            return
        old = saved.get(ticker)
        if old is None or stamp > parse_time(old['observed_at']):
            saved[ticker] = dict(record)
    for snapshot in history:
        for row in snapshot.get('candidate_state', []):
            retain(row.get('ticker'), row.get('last_status'))
            retain(row.get('ticker'), observation(row, snapshot))
    for row in data.get('candidates', []):
        retain(row.get('ticker'), observation(row, data))
        row['last_status'] = saved.get(row.get('ticker'))
    return data
