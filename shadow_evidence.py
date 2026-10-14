"""Freeze allowlisted public research inputs; never synthesize human reviews."""
import argparse
import copy
import gzip
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
from news_research import clock
from shadow_outcomes import evaluate_outcomes
from component_scoring import RUBRIC

STOCK_FIELDS = ('price', 'price_source', 'price_received_at', 'bar_end', 'bar_timestamp',
                'research_bars', 'session_bar_count', 'direction', 'rank', 'score', 'day_move',
                'move_5m', 'recent_move', 'move_30m', 'move_60m', 'vwap', 'volume_ratio',
                'volume_acceleration', 'trigger_price', 'invalidation_price', 'pattern_research',
                'relative_volume_research', 'trend_context', 'news_items', 'news_status',
                'news_checked_at', 'news_event_evidence', 'news_research', 'qualification_checks',
                'qualification_reasons', 'setup_qualified', 'execution_state')
OPTION_FIELDS = ('contract_id', 'side', 'strike', 'expiry', 'dte', 'bid', 'ask', 'volume', 'oi',
                 'delta', 'gamma', 'iv', 'theta', 'source', 'option_timestamp', 'received_at',
                 'payload_timestamp', 'minimum_delay_minutes', 'timestamp_basis', 'quote_valid',
                 'delta_ok', 'near_atm', 'usable_spread', 'contract_score')


def select_fields(row, fields):
    return copy.deepcopy({key: row[key] for key in fields if key in row})


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def contracts(snapshot):
    for row in snapshot.get('candidates', []):
        seen = set()
        options = list(row.get('options') or [])
        for group in (row.get('expiry_groups') or {}).values():
            options.extend(group.get('options') or [])
        for option in options:
            ident = option.get('contract_id')
            if isinstance(ident, str) and ident and ident not in seen:
                seen.add(ident)
                yield row, option


def eligible(option):
    ask = option.get('ask')
    return (type(ask) in (int, float) and math.isfinite(ask) and 0 < ask <= .30
            and all(option.get(k) is True for k in ('quote_valid', 'delta_ok', 'near_atm', 'usable_spread'))
            and type(option.get('volume')) in (int, float) and option['volume'] >= 20
            and type(option.get('dte')) is int and 0 <= option['dte'] <= 14)


def quote_record(option):
    return {'contract_id': option['contract_id'], 'bid': option.get('bid'), 'ask': option.get('ask'),
            'observed_at': option.get('option_timestamp'), 'received_at': option.get('received_at'),
            'source': option.get('source'), 'multiplier': None}


def stock_record(stock):
    return {'ticker': stock.get('ticker'), 'price': stock.get('price'), 'observed_at': stock.get('bar_end'),
            'received_at': stock.get('price_received_at'), 'source': stock.get('price_source')}


def make_packet(snapshot, captured_at, source_commit=None, tracked_ids=()):
    generated, captured = clock(snapshot.get('generated_at')), clock(captured_at)
    if generated is None or captured is None or generated > captured or not snapshot.get('scan_id'):
        raise ValueError('Original scan identity and ordered timezone-aware clocks required')
    selected, counts, scanned, qualifying, followups, selected_ids = [], {}, 0, 0, [], set()
    for stock, option in contracts(snapshot):
        scanned += 1
        if option['contract_id'] in tracked_ids:
            followups.append(quote_record(option))
        if not eligible(option):
            continue
        qualifying += 1
        ticker = stock.get('ticker')
        if len(selected) >= 20 or counts.get(ticker, 0) >= 2 or option['contract_id'] in selected_ids:
            continue
        selected_ids.add(option['contract_id'])
        counts[ticker] = counts.get(ticker, 0)+1
        selected.append({'candidate_id': option['contract_id'], 'ticker': ticker,
                         'stock': select_fields(stock, STOCK_FIELDS), 'contract': select_fields(option, OPTION_FIELDS)})
    payload = {'format': 'shadow-evidence-v1', 'scan_id': snapshot['scan_id'],
               'generated_at': snapshot['generated_at'], 'captured_at': captured.isoformat(),
               'market_date': snapshot.get('market_date'), 'market_session': snapshot.get('market_session'),
               'source_commit': source_commit, 'ranking_effect': 'NONE', 'candidates': selected,
               'followup_quotes': followups,
               'stock_observations': [stock_record(row) for row in snapshot.get('candidates', [])],
               'coverage': {'examined': scanned, 'qualifying': qualifying,
                                                       'included': len(selected), 'omitted': qualifying-len(selected)},
               'limitations': ['Public research only; private brokerage data excluded.',
                               'Capture time is availability of this packet, not the exchange quote time.',
                               'Missing source bars, reviews or quote clocks remain missing.']}
    return {**payload, 'packet_id': digest(payload)}


def review_queue(packet):
    rows = []
    for candidate in packet['candidates']:
        stock, contract = candidate['stock'], candidate['contract']
        gaps = ['COMPONENT_REVIEWS_REQUIRED', 'LIQUIDITY_AND_RISK_REVIEWS_REQUIRED',
                'HISTORICAL_RVOL_BASELINE_BARS_NOT_RETAINED']
        if not stock.get('research_bars'):
            gaps.append('SOURCE_BARS_MISSING')
        if stock.get('news_status') != 'SUCCESS':
            gaps.append('NEWS_COVERAGE_INCOMPLETE')
        if clock(contract.get('option_timestamp')) is None:
            gaps.append('EXCHANGE_QUOTE_TIME_UNKNOWN')
        if packet.get('market_session') != 'OPEN':
            gaps.append('OUTSIDE_OPEN_SESSION')
        rows.append({'candidate_id': candidate['candidate_id'], 'ticker': candidate['ticker'],
                     'ask': contract.get('ask'), 'expiry': contract.get('expiry'),
                     'review_status': 'AWAITING_REVIEW', 'replay_status': 'NOT_RUN', 'evidence_gaps': gaps})
    return {'format': 'shadow-review-queue-v1', 'packet_id': packet['packet_id'],
            'generated_at': packet['generated_at'], 'captured_at': packet['captured_at'],
            'market_session': packet.get('market_session'), 'coverage': packet['coverage'], 'candidates': rows,
            'ranking_effect': 'NONE'}


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, separators=(',', ':'), allow_nan=False))
    temporary.replace(path)


def capture(data_dir, captured_at=None, source_commit=None):
    data = Path(data_dir)
    snapshot = json.loads((data/'market-dashboard.json').read_text())
    latest = data/'shadow-evidence-latest.json'
    if latest.exists() and json.loads(latest.read_text()).get('scan_id') == snapshot.get('scan_id'):
        return {'status': 'ALREADY_CAPTURED', 'scan_id': snapshot.get('scan_id')}
    archive = data/'shadow-evidence'
    # Only the five most recent market dates participate in the rolling outcome report.
    days = sorted(p for p in archive.glob('*') if p.is_dir())[-5:]
    previous = []
    for day in days:
        for path in sorted(day.glob('*.json.gz')):
            previous.append(json.loads(gzip.decompress(path.read_bytes())))
    if any(p['scan_id'] == snapshot['scan_id'] for p in previous):
        return {'status': 'ALREADY_CAPTURED', 'scan_id': snapshot['scan_id']}
    captured_at = captured_at or datetime.now(timezone.utc).isoformat()
    tracked = {c['candidate_id'] for p in previous for c in p['candidates']}
    packet = make_packet(snapshot, captured_at, source_commit, tracked)
    day = clock(snapshot['generated_at']).astimezone(ZoneInfo('America/New_York')).date().isoformat()
    path = archive/day/(packet['packet_id']+'.json.gz')
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        temporary = path.with_suffix('.tmp')
        temporary.write_bytes(gzip.compress(json.dumps(packet, separators=(',', ':')).encode(), mtime=0))
        temporary.replace(path)
    atomic_json(data/'shadow-evidence-latest.json', packet)
    atomic_json(data/'shadow-review-queue.json', review_queue(packet))
    packets = previous+[packet]
    entries = [{'candidate_id': c['candidate_id'], 'decision_at': p['captured_at'], 'quote': quote_record(c['contract']),
                'stock': stock_record({**c['stock'], 'ticker': c['ticker']})}
               for p in packets for c in p['candidates']]
    observations = [q for p in packets for q in p['followup_quotes']]
    stock_observations = [s for p in packets for s in p.get('stock_observations', [])]
    atomic_json(data/'shadow-outcomes.json', evaluate_outcomes(entries, observations, captured_at, stock_observations))
    return {'status': 'CAPTURED', 'packet_id': packet['packet_id'], 'coverage': packet['coverage']}


def review_template(packet):
    # Deliberately unrated: actual reviewers supply evidence and availability clocks.
    return {'packet_id': packet['packet_id'], 'as_of': packet['captured_at'], 'records': [
        {'session': packet.get('market_date'), 'candidate_id': c['candidate_id'], 'ticker': c['ticker'],
         'direction': c['stock'].get('direction'), 'as_of': packet['captured_at'], 'reviewed_at': None,
         'reviewer_id': '', 'evidence_set_id': packet['packet_id'],
         'eligibility_evidence': {k: {'passed': None, 'policy_version': '', 'source': '', 'evidence': '',
                                     'observed_at': None, 'available_at': None} for k in ('liquidity', 'risk')},
         'component_reviews': {k: {'candidate_id': c['candidate_id'], 'dimensions': {
             d: {'rating': None, 'source': '', 'evidence': '', 'observed_at': None, 'available_at': None}
             for d in dimensions}} for k, dimensions in RUBRIC.items()},
         'news_event_evidence': copy.deepcopy(c['stock'].get('news_event_evidence', []))}
        for c in packet['candidates']]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', default='data')
    parser.add_argument('--source-commit')
    parser.add_argument('--prepare-reviews', help='Evidence packet JSON; prints an unrated review template instead of capturing')
    args = parser.parse_args()
    if args.prepare_reviews:
        print(json.dumps(review_template(json.loads(Path(args.prepare_reviews).read_text())), indent=2))
    else:
        print(json.dumps(capture(args.data_dir, source_commit=args.source_commit)))
