"""Import Cboe DataShop Option Quotes CSV as separate timestamped research evidence."""
import argparse
import csv
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
import re
from zoneinfo import ZoneInfo

ET = ZoneInfo('America/New_York')
SPEC = 'https://datashop.cboe.com/documents/Option_Quotes_Layout.pdf'


def eastern_stamp(value):
    for fmt in ('%Y-%m-%d %H:%M:%S', '%m/%d/%Y %H:%M:%S', '%m/%d/%Y %H:%M'):
        try:
            naive = datetime.strptime(value, fmt)
            break
        except ValueError:
            continue
    else:
        raise ValueError('Unsupported quote_datetime format')
    first = naive.replace(tzinfo=ET, fold=0)
    second = naive.replace(tzinfo=ET, fold=1)
    if first.utcoffset() != second.utcoffset():
        raise ValueError('Ambiguous or nonexistent Eastern quote time')
    if first.astimezone(timezone.utc).astimezone(ET).replace(tzinfo=None) != naive:
        raise ValueError('Nonexistent Eastern quote time')
    return first.astimezone(timezone.utc).isoformat(), 'second' if value.count(':') == 2 else 'minute'


def numeric(row, key, required=False):
    value = row.get(key)
    if value is None or value.strip() == '':
        if required:
            raise ValueError('Missing ' + key)
        return None
    try:
        number = Decimal(value)
    except InvalidOperation as exc:
        raise ValueError('Invalid ' + key) from exc
    if not number.is_finite():
        raise ValueError('Nonfinite ' + key)
    return float(number)


def normalize(row):
    stamp, precision = eastern_stamp(row['quote_datetime'])
    for fmt in ('%Y-%m-%d', '%m/%d/%Y'):
        try:
            expiry = datetime.strptime(row['expiration'], fmt).date()
            break
        except ValueError:
            continue
    else:
        raise ValueError('Invalid expiration')
    root = row['root'].strip(); side = row['option_type'].strip().upper()
    if not re.fullmatch(r'[A-Z0-9.]{1,6}', root) or side not in ('C', 'P'):
        raise ValueError('Invalid option root or side')
    strike = Decimal(row['strike'])
    if not strike.is_finite() or strike <= 0 or strike * 1000 != (strike * 1000).to_integral_value() or strike * 1000 > 99999999:
        raise ValueError('Invalid option strike')
    bid, ask = numeric(row, 'bid', True), numeric(row, 'ask', True)
    if bid < 0 or ask <= 0 or bid > ask:
        raise ValueError('Invalid or crossed NBBO')
    delta = numeric(row, 'delta')
    if delta is not None and not -1 <= delta <= 1:
        raise ValueError('Invalid delta')
    return {'contract_id': f'{root}{expiry:%y%m%d}{side}{int(strike * 1000):08d}',
            'ticker': row['underlying_symbol'], 'expiry': expiry.isoformat(), 'strike': float(strike),
            'side': 'call' if side == 'C' else 'put', 'bid': bid, 'ask': ask,
            'spread': round(ask - bid, 8), 'spread_pct': round((ask - bid) / ask * 100, 6),
            'delta': delta, 'gamma': numeric(row, 'gamma'), 'theta': numeric(row, 'theta'),
            'theta_available': numeric(row, 'theta') is not None,
            'interval_trade_volume': numeric(row, 'trade_volume'),
            'quote_timestamp': stamp, 'timestamp_precision': precision,
            'timestamp_basis': 'DOCUMENTED_NBBO_INTERVAL_END',
            'source': 'Cboe DataShop Option Quotes', 'fees_included': False,
            'interpretation': 'INTERVAL_NBBO_RESEARCH_NOT_EXECUTION',
            'contract_size': None}


def import_csv(path, limit=100000):
    path = Path(path); rows = []; issues = []; seen = set()
    with path.open(newline='', encoding='utf-8-sig') as file:
        reader = csv.DictReader(file)
        required = {'underlying_symbol','quote_datetime','root','expiration','strike','option_type','bid','ask'}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError('Missing required Cboe Option Quotes columns')
        for line, row in enumerate(reader, 2):
            if line - 1 > limit:
                raise ValueError('Row limit exceeded; narrow the input or raise --limit explicitly')
            try:
                quote = normalize(row); key = (quote['contract_id'], quote['quote_timestamp'])
                if key in seen:
                    raise ValueError('Duplicate contract/time observation')
                seen.add(key); rows.append(quote)
            except (ValueError, InvalidOperation, KeyError) as exc:
                issues.append({'line': line, 'reason': str(exc)})
    return {'format': 'timestamped-option-quotes-v1', 'specification': SPEC,
            'imported_at': datetime.now(timezone.utc).isoformat(),
            'input_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'quotes': rows, 'issues': issues, 'ml_ready': False,
            'note': 'Separate research import. No retrospective scanner inputs or verified fills are created. Delivery/availability time is unknown; quote time alone cannot establish what was available before an entry.'}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv_path')
    parser.add_argument('--limit', type=int, default=100000)
    args = parser.parse_args()
    if args.limit <= 0:
        parser.error('--limit must be positive')
    print(json.dumps(import_csv(args.csv_path, args.limit), allow_nan=False, indent=2))
