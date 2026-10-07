"""Fetch a bounded, private Market Data trial sample; never feeds trading decisions."""
import argparse
from datetime import date, datetime, timezone
import json
import math
import os
from pathlib import Path
import re

import requests

API = 'https://api.marketdata.app/v1/options/quotes/'
SYMBOL = re.compile(r'[A-Z0-9.]{1,6}\d{6}[CP]\d{8}')


def normalize(payload, symbol, received_at, historical=False):
    if payload.get('s') != 'ok' or payload.get('optionSymbol') != [symbol]:
        raise ValueError('Expected exactly the requested contract')

    def number(key, required=False):
        column = payload.get(key)
        if column is None and not required:
            return None
        if not isinstance(column, list) or len(column) != 1:
            raise ValueError('Invalid column: ' + key)
        value = column[0]
        if value is None and not required:
            return None
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError('Invalid number: ' + key)
        return value

    bid, ask = number('bid', True), number('ask', True)
    if bid < 0 or ask <= 0 or bid > ask:
        raise ValueError('Invalid or crossed bid/ask')
    updated = number('updated', True)
    # Documented Unix seconds, not milliseconds or an Eastern wall clock.
    if updated != int(updated) or not 946684800 <= updated <= received_at.timestamp():
        raise ValueError('Invalid or future snapshot clock')
    stamp = datetime.fromtimestamp(updated, timezone.utc)
    greeks = {key: number(key) for key in ('iv', 'delta', 'gamma', 'theta', 'vega')}
    if historical:
        greeks = dict.fromkeys(greeks)  # The provider does not store historical Greeks.
    if greeks['delta'] is not None and not -1 <= greeks['delta'] <= 1:
        raise ValueError('Invalid delta')
    return {
        'contract_id': symbol, 'bid': bid, 'ask': ask,
        'spread': round(ask - bid, 8), 'spread_pct': round((ask - bid) / ask * 100, 6),
        **greeks, 'theta_available': greeks['theta'] is not None,
        'quote_timestamp': stamp.isoformat(), 'received_at': received_at.isoformat(),
        'observed_snapshot_age_seconds': (received_at - stamp).total_seconds(),
        'timestamp_precision': 'second', 'timestamp_basis': 'PROVIDER_SNAPSHOT_UPDATED',
        'bid_event_timestamp': None, 'ask_event_timestamp': None,
        'source': 'Market Data', 'request_kind': 'historical_eod' if historical else 'latest_available',
        'interpretation': 'DELAYED_SNAPSHOT_RESEARCH_NOT_EXECUTION',
        'fees_included': False, 'contract_size': None, 'entry_time_greeks_verified': False,
    }


def fetch_sample(symbols, token=None, historical_date=None, demo=False, session=None):
    symbols = list(dict.fromkeys(symbols))
    if not 1 <= len(symbols) <= 5 or any(not SYMBOL.fullmatch(s) for s in symbols):
        raise ValueError('Provide one to five OCC symbols')
    if demo and any(not s.startswith('AAPL') for s in symbols):
        raise ValueError('Unauthenticated demo is restricted to AAPL')
    if not demo and not token:
        raise ValueError('Set MARKETDATA_TOKEN privately; do not paste it into chat')
    if token and any(c.isspace() for c in token):
        raise ValueError('Invalid token format')
    if historical_date:
        date.fromisoformat(historical_date)
    client = session or requests.Session()
    headers = {'Authorization': 'Bearer ' + token} if token and not demo else {}
    quotes = []
    for symbol in symbols:
        # No redirects or automatic retries: avoid credential leakage and hidden credit usage.
        response = client.get(API + symbol + '/', headers=headers,
                              params={'date': historical_date} if historical_date else {},
                              timeout=25, allow_redirects=False)
        received_at = datetime.now(timezone.utc)
        if response.status_code not in (200, 203):
            raise ValueError('Provider request failed (HTTP %s); response body omitted' % response.status_code)
        quote = normalize(response.json(), symbol, received_at, bool(historical_date))
        quote['http_status'] = response.status_code
        quotes.append(quote)
    return {'format': 'marketdata-private-research-v1',
            'collected_at': datetime.now(timezone.utc).isoformat(), 'quotes': quotes,
            'access_mode': 'unauthenticated_aapl_demo' if demo else 'user_token',
            'plan_assumption': 'Starter Trial: at least 24-hour delayed options',
            'ml_ready': False, 'live_scanner_integration': False,
            'note': 'Snapshot clocks are not per-side quote event times or fills. Keep provider data private. Historical requests have no Greeks.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('symbols', nargs='+')
    parser.add_argument('--date', dest='historical_date')
    parser.add_argument('--demo', action='store_true')
    args = parser.parse_args()
    try:
        sample = fetch_sample(args.symbols, os.environ.get('MARKETDATA_TOKEN'), args.historical_date, args.demo)
    except (ValueError, requests.RequestException):
        # Do not echo transport exceptions, request headers, tokens or provider bodies.
        parser.exit(1, 'Research request failed. Check contract/date, credentials and account limits. No output saved.\n')
    directory = Path(__file__).resolve().parent / 'private-research'
    directory.mkdir(mode=0o700, exist_ok=True)
    output = directory / ('marketdata-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.json')
    with output.open('x', encoding='utf-8') as file:
        os.chmod(output, 0o600)
        json.dump(sample, file, indent=2, allow_nan=False)
    print('Saved private research sample:', output)


if __name__ == '__main__':
    main()
