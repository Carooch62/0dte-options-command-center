"""Shared fail-closed market-data validation. No network or file side effects."""
import math
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

ET = ZoneInfo('America/New_York')

def number(value, default=None):
    try:
        n = float(value)
        return n if math.isfinite(n) else default
    except (ValueError, TypeError):
        return default

def parse_time(value, naive_tz=None):
    try:
        if isinstance(value, (int, float)):
            n = number(value)
            return datetime.fromtimestamp(n / 1000 if n > 10_000_000_000 else n, timezone.utc)
        dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        if dt.tzinfo is None:
            if naive_tz is None:
                return None
            dt = dt.replace(tzinfo=naive_tz)
        return dt.astimezone(timezone.utc)
    except (ValueError, TypeError, OverflowError, OSError):
        return None

def age_minutes(value, now=None, naive_tz=None):
    dt = parse_time(value, naive_tz)
    return ((now or datetime.now(timezone.utc)) - dt).total_seconds() / 60 if dt else None

def freshness(value, now=None, delay=0, max_age=8, naive_tz=None):
    age = age_minutes(value, now, naive_tz)
    if age is None:
        return 'UNKNOWN'
    if age < -0.5:
        return 'FUTURE'
    if max(0, age) + delay > max_age:
        return 'STALE'
    return 'DELAYED' if delay else 'RECENT'

def valid_quote(o):
    bid, ask = number(o.get('bid')), number(o.get('ask'))
    return bid is not None and ask is not None and 0 < bid <= ask

def verified_delta(o):
    d = number(o.get('delta'))
    side = o.get('side')
    return bool(o.get('delta_verified', o.get('greeks_verified'))) and d is not None and ((side == 'call' and 0 < d <= 1) or (side == 'put' and -1 <= d < 0))

def contract_checks(o, price):
    valid = valid_quote(o)
    bid, ask = number(o.get('bid'), 0), number(o.get('ask'), 0)
    mid = (bid + ask) / 2 if valid else None
    spread = ask - bid if valid else None
    relative = spread / mid * 100 if valid else None
    dist = abs(number(o.get('strike'), 0) - price) / price * 100 if price else None
    delta_ok = verified_delta(o) and abs(number(o.get('delta'), 0)) >= .25
    reasons = []
    if not valid: reasons.append('INVALID_QUOTE')
    if not verified_delta(o): reasons.append('DELTA_UNVERIFIED')
    elif not delta_ok: reasons.append('LOW_DELTA')
    if dist is None or dist > 3: reasons.append('STRIKE_DISTANCE')
    if number(o.get('volume'), 0) < 20: reasons.append('LOW_VOLUME')
    if not valid or spread > .05 or relative > 20: reasons.append('WIDE_SPREAD')
    return dict(quote_valid=valid, mid=mid, spread=spread, spread_pct=relative, distance_pct=dist,
                delta_ok=delta_ok, preferred_delta=verified_delta(o) and abs(number(o.get('delta'), 0)) >= .4,
                near_atm=dist is not None and dist <= 3,
                tight_spread=valid and spread <= .05 and relative <= 20,
                usable_spread=valid and spread <= .10 and relative <= 30,
                rejection_reasons=reasons)
