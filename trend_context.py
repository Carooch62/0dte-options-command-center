"""Completed daily trend context. Never used for entry, score or filters."""
import copy
import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from market_clock import calendar
from quality import ET, number, parse_time

PERIODS = {'week': 5, 'two_weeks': 10, 'month': 21}
CACHE_VERSION = 1


def completed_session(now):
    cal = calendar()
    session = cal.date_to_session(now.astimezone(ET).date().isoformat(), direction='previous')
    # Allow the delayed daily source to finish the closing bar before using it.
    if cal.session_close(session).to_pydatetime() + timedelta(minutes=20) > now:
        session = cal.previous_session(session)
    return session.date().isoformat()


def compare(a, b):
    return 'RISING' if a > b + 1e-8 else 'FALLING' if a < b - 1e-8 else 'FLAT'


def summarize(payload, now):
    expected = completed_session(now)
    quotes = payload.get('indicators', {}).get('quote', [{}])[0]
    adjusted = payload.get('indicators', {}).get('adjclose', [{}])[0].get('adjclose', [])
    bars = {}
    cal = calendar()
    for i, stamp in enumerate(payload.get('timestamp') or []):
        dt = parse_time(stamp)
        if dt is None:
            continue
        day = dt.astimezone(ET).date().isoformat()
        if day > expected or not cal.is_session(day):
            continue
        values = [number(quotes.get(k, [])[i]) if i < len(quotes.get(k, [])) else None
                  for k in ('close', 'high', 'low')]
        adj = number(adjusted[i]) if i < len(adjusted) else None
        close, high, low = values
        if any(v is None or v <= 0 for v in values + [adj]) or not low <= close <= high:
            continue
        factor = adj / close
        bars[day] = {'date': day, 'close': adj, 'high': high * factor, 'low': low * factor}
    bars = [bars[day] for day in sorted(bars)]
    as_of = bars[-1]['date'] if bars else None
    periods = {}
    for key, sessions in PERIODS.items():
        result = {'sessions': sessions, 'change_pct': None, 'direction': 'UNKNOWN',
                  'highs': 'UNKNOWN', 'lows': 'UNKNOWN', 'start_date': None, 'end_date': as_of}
        if len(bars) >= sessions + 1:
            window = bars[-sessions-1:]
            # Missing daily observations must not silently lengthen a horizon.
            if len(cal.sessions_in_range(window[0]['date'], window[-1]['date'])) == sessions + 1:
                active = window[1:]
                half = sessions // 2
                earlier, recent = active[:half], active[-half:]
                highs = compare(max(b['high'] for b in recent), max(b['high'] for b in earlier))
                lows = compare(min(b['low'] for b in recent), min(b['low'] for b in earlier))
                change = (window[-1]['close'] / window[0]['close'] - 1) * 100
                direction = ('UP' if change > 0 and highs == lows == 'RISING' else
                             'DOWN' if change < 0 and highs == lows == 'FALLING' else 'MIXED')
                result.update(change_pct=round(change, 2), direction=direction, highs=highs, lows=lows,
                              start_date=window[0]['date'])
        periods[key] = result
    directions = {p['direction'] for p in periods.values()}
    overall = next(iter(directions)) if len(directions) == 1 else 'MIXED'
    if 'UNKNOWN' in directions:
        overall = 'UNKNOWN'
    status = 'STALE' if as_of and as_of != expected else 'READY' if all(p['change_pct'] is not None for p in periods.values()) else 'INSUFFICIENT_HISTORY'
    return {'version': CACHE_VERSION, 'status': status, 'source': 'Yahoo adjusted daily bars',
            'adjustment': 'SPLITS_AND_DIVIDENDS', 'as_of': as_of, 'expected_as_of': expected,
            'fetched_at': now.isoformat(), 'periods': periods, 'overall_direction': overall}


def align(context, direction):
    result = copy.deepcopy(context)
    overall = result.get('overall_direction')
    result['alignment'] = ('UNKNOWN' if result.get('status') != 'READY' or overall == 'UNKNOWN' or direction not in ('UP', 'DOWN') else
                           'MIXED' if overall == 'MIXED' else 'ALIGNED' if overall == direction else 'AGAINST_TREND')
    return result


def daily_chart(ticker):
    for host in ('query1.finance.yahoo.com', 'query2.finance.yahoo.com'):
        try:
            response = requests.get(f'https://{host}/v8/finance/chart/{ticker}',
                                    params={'interval': '1d', 'range': '3mo', 'includePrePost': 'false'},
                                    headers={'User-Agent': 'Mozilla/5.0'}, timeout=4)
            response.raise_for_status()
            return response.json()['chart']['result'][0]
        except (requests.RequestException, ValueError, KeyError, IndexError, TypeError):
            continue
    raise RuntimeError('daily source unavailable')


def enrich(data, cache, now=None, fetch=daily_chart):
    now = now or datetime.now(timezone.utc)
    expected = completed_session(now)
    cached = cache.get('tickers', {}) if cache.get('version') == CACHE_VERSION else {}
    if not isinstance(cached, dict):
        cached = {}
    updated = {}
    deadline = time.monotonic() + 90

    def one(row):
        ticker = row['ticker']
        old = cached.get(ticker, {})
        if not isinstance(old, dict):
            old = {}
        if old.get('as_of') == expected and old.get('status') in ('READY', 'INSUFFICIENT_HISTORY'):
            return ticker, old
        retry = parse_time(old.get('retry_after'))
        if retry and retry > now:
            return ticker, old
        try:
            if time.monotonic() > deadline:
                raise RuntimeError('daily context time budget reached')
            return ticker, summarize(fetch(ticker), now)
        except Exception:
            result = copy.deepcopy(old)
            result.update(version=CACHE_VERSION, status='SOURCE_FAILURE', expected_as_of=expected,
                          retry_after=(now + timedelta(minutes=15)).isoformat())
            result.setdefault('periods', {})
            return ticker, result

    # Optional context has its own bounded fetch budget; failures cannot alter signals.
    with ThreadPoolExecutor(max_workers=16) as pool:
        for ticker, context in pool.map(one, data.get('candidates', [])):
            updated[ticker] = context
    for row in data.get('candidates', []):
        row['trend_context'] = align(updated[row['ticker']], row.get('direction'))
    return data, {'version': CACHE_VERSION, 'tickers': updated}


def main():
    path = Path('data/market.json')
    cache_path = Path('data/trend-cache.json')
    try:
        cache = json.loads(cache_path.read_text())
        if not isinstance(cache, dict):
            cache = {}
    except (OSError, ValueError):
        cache = {}
    data, cache = enrich(json.loads(path.read_text()), cache)
    path.write_text(json.dumps(data, separators=(',', ':'), allow_nan=False))
    cache_path.write_text(json.dumps(cache, separators=(',', ':'), allow_nan=False))


if __name__ == '__main__':
    main()
