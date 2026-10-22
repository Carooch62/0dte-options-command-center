"""Prepare and admit prospective fixed-score reviews locally; never write live rankings."""
import argparse
import copy
from datetime import date, datetime, timezone, timedelta
import hashlib
import importlib.util
import json
import math
import re
from pathlib import Path
from zoneinfo import ZoneInfo

from component_scoring import RUBRIC, provenance
from fixed_composite import fixed_composite
from news_research import clock
from review_corpus import audit_corpus, label
from quote_latency import request_attempts

POLICY = json.loads(Path(__file__).with_name('fixed_review_policy.json').read_text())


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def method_fingerprint():
    paths = ('component_scoring.py', 'fixed_composite.py', 'news_research.py', 'shadow_replay.py')
    return digest({name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest() for name in paths})


def packet_rows(packet):
    if (not isinstance(packet, dict) or packet.get('format') != 'shadow-evidence-v1'
            or packet.get('packet_id') != digest({k: v for k, v in packet.items() if k != 'packet_id'})
            or not isinstance(packet.get('candidates'), list) or len(packet['candidates']) > 20
            or clock(packet.get('generated_at')) is None or clock(packet.get('captured_at')) is None
            or clock(packet['generated_at']) > clock(packet['captured_at']) or not label(packet.get('scan_id'))):
        raise ValueError('Original content-hashed evidence packet with ordered clocks required')
    rows = {}
    for row in packet['candidates']:
        if (not isinstance(row, dict) or not label(row.get('candidate_id')) or row['candidate_id'] in rows
                or not label(row.get('ticker')) or not re.fullmatch(r'[A-Z][A-Z0-9.-]{0,9}', row['ticker'])
                or not isinstance(row.get('contract'), dict)
                or row['contract'].get('contract_id') != row['candidate_id']
                or row['contract'].get('side') not in ('call', 'put')
                or not numeric(row['contract'].get('strike'), positive=True)
                or not isinstance(row.get('stock'), dict)):
            raise ValueError('Unique packet candidates and exact contract labels required')
        try:
            if date.fromisoformat(row['contract']['expiry']).isoformat() != row['contract']['expiry']:
                raise ValueError('Noncanonical expiry')
        except (ValueError, TypeError, KeyError) as exc:
            raise ValueError('Exact ISO contract expiry required') from exc
        rows[row['candidate_id']] = row
    coverage = packet.get('coverage')
    if coverage is not None and (not isinstance(coverage, dict)
            or type(coverage.get('qualifying')) is not int or coverage['qualifying'] < len(rows)
            or coverage.get('included') != len(rows) or coverage.get('omitted') != coverage['qualifying'] - len(rows)):
        raise ValueError('Original packet coverage counts are inconsistent')
    return rows


def freeze(snapshot, batch, captured_at=None):
    spec = importlib.util.spec_from_file_location('fixed_batch_audit', Path(__file__).with_name('scripts').joinpath('audit-candidate-batch.py'))
    audit = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(audit)
    if audit.audit(snapshot, batch)['status'] != 'PASS':
        raise ValueError('Source snapshot and batch must pass the independent audit')
    captured_at = captured_at or datetime.now(timezone.utc).isoformat()
    if clock(captured_at) is None or clock(captured_at) < clock(snapshot['generated_at']):
        raise ValueError('Capture must follow original generation time')
    rows = []
    stock_fields = ('direction', 'price', 'price_source', 'bar_end', 'bar_timestamp', 'bar_complete', 'research_bars',
                    'move_5m', 'recent_move', 'move_30m', 'move_60m', 'vwap', 'volume_ratio',
                    'volume_acceleration', 'pattern_research', 'relative_volume_research', 'trend_context',
                    'news_status', 'news_checked_at', 'news_items', 'trigger_price', 'invalidation_price')
    contract_fields = ('contract_id', 'side', 'strike', 'expiry', 'bid', 'ask', 'delta', 'volume', 'oi',
                       'source', 'option_timestamp', 'received_at', 'timestamp_basis', 'minimum_delay_minutes')
    for selected in batch['candidates']:
        wanted = audit.identity(selected['ticker'], selected['options'][0])
        for stock in snapshot['candidates']:
            options = list(stock.get('options', [])) + [o for g in stock.get('expiry_groups', {}).values() for o in g.get('options', [])]
            match = next((o for o in options if audit.identity(stock['ticker'], o) == wanted), None)
            if match is not None:
                contract = {k: copy.deepcopy(match[k]) for k in contract_fields if k in match}
                contract['contract_id'] = selected['options'][0]['contract_id']
                rows.append({'candidate_id': contract['contract_id'], 'ticker': stock['ticker'], 'contract': contract,
                             'stock': {k: copy.deepcopy(stock[k]) for k in stock_fields if k in stock}})
                break
    payload = {'format': 'shadow-evidence-v1', 'scan_id': snapshot['scan_id'],
               'generated_at': snapshot['generated_at'], 'captured_at': captured_at,
               'market_session': snapshot.get('market_session'), 'market_date': snapshot.get('market_date'),
               'candidates': rows, 'source_sha256': {'snapshot': digest(snapshot), 'batch': digest(batch)},
               'coverage': {'included': len(rows), 'qualifying': batch['qualifying_contracts'], 'omitted': batch['omitted_contracts']},
               'ranking_effect': 'NONE'}
    packet = {**payload, 'packet_id': digest(payload)}
    packet_rows(packet)
    return packet


def scanner_import(packet):
    rows = packet_rows(packet)
    total = packet.get('coverage', {}).get('qualifying', len(rows))
    return {**{k: packet[k] for k in ('packet_id', 'scan_id', 'generated_at', 'captured_at', 'market_session')},
            'included_contracts': len(rows), 'total_contracts': total, 'omitted_contracts': total - len(rows),
            'candidates': [{'ticker': row['ticker'], 'options': [copy.deepcopy(row['contract'])]} for row in rows.values()]}


def prepare(packet, prepared_at=None):
    rows = packet_rows(packet)
    prepared_at = prepared_at or datetime.now(timezone.utc).isoformat()
    if clock(prepared_at) is None or clock(prepared_at) < max(clock(packet['captured_at']), clock(POLICY['frozen_at'])):
        raise ValueError('Preparation must follow packet capture and policy freeze')
    template = json.loads(Path(__file__).with_name('examples').joinpath('fixed-review-template.json').read_text())
    records = []
    for ident, candidate in rows.items():
        row = copy.deepcopy(template['records'][0])
        # Preserve source facts only. Ratings, reviewer identity and completion stay empty.
        row.update(candidate_id=ident, ticker=candidate['ticker'], evidence_set_id=packet['packet_id'],
                   direction='UP' if candidate['contract']['side'] == 'call' else 'DOWN',
                   intraday_bar_end=candidate['stock'].get('bar_end'),
                   policy_version=POLICY['version'], policy_sha256=digest(POLICY), method_sha256=method_fingerprint())
        for review in row['component_reviews'].values():
            review['candidate_id'] = ident
        for item in row['supporting_evidence'].values():
            item['contract_id'] = ident
        records.append(row)
    return {'format': 'fixed-review-corpus-v1', 'policy_version': POLICY['version'],
            'policy_sha256': digest(POLICY), 'method_sha256': method_fingerprint(),
            'packet_id': packet['packet_id'], 'prepared_at': prepared_at,
            'as_of': None, 'selected_reviewer_id': None, 'records': records,
            'status': 'WORKSHEET_ONLY', 'ranking_effect': 'NONE'}


def numeric(value, positive=False):
    return type(value) in (int, float) and math.isfinite(value) and (value > 0 if positive else value >= 0)


def fresh(item, cutoff, max_age):
    return provenance(item, cutoff) and (cutoff - clock(item['observed_at'])).total_seconds() <= max_age


def record_reasons(row, candidate, quote, cutoff):
    reasons = []
    if (row.get('policy_version') != POLICY['version'] or row.get('policy_sha256') != digest(POLICY)
            or row.get('method_sha256') != method_fingerprint()):
        reasons.append('RECORD_POLICY_FINGERPRINT_REQUIRED')
    if (row.get('ticker') != candidate['ticker'] or row.get('direction') not in ('UP', 'DOWN')
            or row.get('direction') != ('UP' if candidate['contract']['side'] == 'call' else 'DOWN')):
        reasons.append('CANDIDATE_IDENTITY_OR_DIRECTION_REQUIRED')
    if row.get('session') != cutoff.astimezone(ZoneInfo('America/New_York')).date().isoformat():
        reasons.append('SESSION_MUST_MATCH_DECISION_DATE_ET')
    bar_end = clock(candidate['stock'].get('bar_end'))
    if candidate['stock'].get('bar_complete') is not True:
        reasons.append('COMPLETED_BAR_EVIDENCE_REQUIRED')
    if bar_end != clock(row.get('intraday_bar_end')):
        reasons.append('BAR_CLOCK_MUST_MATCH_FROZEN_PACKET')
    if bar_end is None or not 0 <= (cutoff - bar_end).total_seconds() <= POLICY['maximum_intraday_bar_age_seconds']:
        reasons.append('COMPLETED_CURRENT_INTRADAY_BAR_REQUIRED')
    gates = row.get('eligibility_evidence')
    gates = gates if isinstance(gates, dict) else {}
    for name in ('liquidity', 'risk'):
        gate = gates.get(name)
        gate = gate if isinstance(gate, dict) else {}
        if gate.get('policy_version') != POLICY['version']:
            reasons.append(name + ':COLLECTION_POLICY_REQUIRED')
    supporting = row.get('supporting_evidence')
    supporting = supporting if isinstance(supporting, dict) else {}
    depth, benchmark, risk = [supporting.get(k) for k in ('depth', 'pricing_benchmark', 'risk_plan')]
    reviewed = clock(row.get('reviewed_at'))
    for item in (depth, benchmark, risk):
        if (not isinstance(item, dict) or item.get('contract_id') != row['candidate_id']
                or reviewed is None or clock(item.get('available_at')) is None or clock(item['available_at']) > reviewed):
            reasons.append('SUPPORTING_EVIDENCE_MUST_MATCH_CONTRACT_AND_PRECEDE_REVIEW')
    risk = risk if isinstance(risk, dict) else {}
    quantity = risk.get('intended_contracts')
    if not fresh(risk, cutoff, POLICY['maximum_quote_age_seconds']):
        reasons.append('CURRENT_RISK_PLAN_REQUIRED')
    if (type(quantity) is not int or quantity <= 0
            or not all(numeric(risk.get(k), positive=True) for k in
                       ('maximum_premium_dollars', 'maximum_loss_dollars', 'underlying_target', 'underlying_invalidation'))
            or not numeric(risk.get('estimated_round_trip_cost_dollars'))
            or not label(risk.get('cost_basis')) or not label(risk.get('exit_plan'))):
        reasons.append('RISK_SIZE_BUDGET_COSTS_AND_EXIT_REQUIRED')
    deadline = clock(risk.get('broker_deadline_at'))
    if deadline is None or deadline <= cutoff:
        reasons.append('BROKER_DEADLINE_REQUIRED')
    if (not isinstance(depth, dict) or not fresh(depth, cutoff, POLICY['maximum_quote_age_seconds'])
            or type(quantity) is not int or quantity <= 0
            or any(type(depth.get(k)) is not int or depth[k] < quantity for k in ('bid_size_contracts', 'ask_size_contracts'))):
        reasons.append('CURRENT_DISPLAYED_CONTRACT_DEPTH_REQUIRED')
    if (not isinstance(benchmark, dict) or not fresh(benchmark, cutoff, POLICY['maximum_quote_age_seconds'])
            or not numeric(benchmark.get('value'), positive=True) or not label(benchmark.get('method_version'))):
        reasons.append('CURRENT_PRICING_BENCHMARK_REQUIRED')
    if quote is None:
        reasons.append('PASSING_QUOTE_AT_DECISION_REQUIRED')
    else:
        bid, ask = quote.get('bid'), quote.get('ask')
        valid = (numeric(bid, positive=True) and numeric(ask, positive=True) and bid <= ask
                 and ask <= POLICY['maximum_live_ask']
                 and ask - bid <= POLICY['maximum_absolute_spread'] + 1e-9
                 and (ask - bid) / ((ask + bid) / 2) * 100 <= POLICY['maximum_midpoint_spread_pct'] + 1e-9
                 and quote.get('metadata_multiplier') == POLICY['standard_multiplier'])
        if not valid:
            reasons.append('QUOTE_BOOK_OR_PREMIUM_FAILED')
        if valid and type(quantity) is int and quantity > 0 and numeric(risk.get('estimated_round_trip_cost_dollars')):
            premium = ask * POLICY['standard_multiplier'] * quantity
            costs = risk['estimated_round_trip_cost_dollars']
            if (not numeric(risk.get('maximum_premium_dollars'), positive=True)
                    or not numeric(risk.get('maximum_loss_dollars'), positive=True)
                    or premium > risk['maximum_premium_dollars'] + 1e-9
                    or premium + costs > risk['maximum_loss_dollars'] + 1e-9):
                reasons.append('DECLARED_PREMIUM_OR_MAXIMUM_LOSS_BUDGET_EXCEEDED')
    try:
        expiry = date.fromisoformat(candidate['contract'].get('expiry', ''))
        if expiry < cutoff.astimezone(ZoneInfo('America/New_York')).date():
            reasons.append('CONTRACT_EXPIRED')
    except (TypeError, ValueError):
        reasons.append('CONTRACT_EXPIRY_REQUIRED')
    return reasons


def admit(packet, corpus, quote_export):
    candidates = packet_rows(packet)
    if (not isinstance(corpus, dict) or corpus.get('format') != 'fixed-review-corpus-v1'
            or corpus.get('policy_version') != POLICY['version'] or corpus.get('policy_sha256') != digest(POLICY)
            or corpus.get('method_sha256') != method_fingerprint()
            or corpus.get('packet_id') != packet['packet_id'] or not label(corpus.get('selected_reviewer_id'))):
        raise ValueError('Bound corpus, frozen policy fingerprint and explicit reviewer selection required')
    cutoff, prepared = clock(corpus.get('as_of')), clock(corpus.get('prepared_at'))
    if (cutoff is None or prepared is None or not clock(POLICY['frozen_at']) <= prepared <= cutoff
            or prepared < clock(packet['captured_at'])):
        raise ValueError('Decision must follow policy freeze, packet capture and worksheet preparation')
    from market_clock import session_info
    if session_info(cutoff)['session'] != 'OPEN' or packet.get('market_session') != 'OPEN':
        raise ValueError('Collection decision must fall within a regular exchange session')
    if (not isinstance(quote_export, dict) or quote_export.get('format') != 'shadow-outcome-input-v1'
            or not isinstance(quote_export.get('observations'), list) or len(quote_export['observations']) > 2000
            or clock(quote_export.get('as_of')) is None or clock(quote_export['as_of']) < cutoff):
        raise ValueError('Bounded original private quote export required')
    context = quote_export.get('scanner_context') or {}
    if (not isinstance(context, dict) or context.get('packet_id') != packet['packet_id']
            or context.get('scan_id') != packet['scan_id']
            or clock(context.get('generated_at')) != clock(packet['generated_at'])
            or clock(context.get('captured_at')) != clock(packet['captured_at'])):
        raise ValueError('Quote export must come from the same frozen validation packet')
    attempts = request_attempts(quote_export, clock(quote_export['as_of']))
    if not isinstance(quote_export.get('requests'), list) or len(attempts) != len(quote_export['requests']):
        raise ValueError('Malformed retained request diagnostics')
    quote_attempts = [row for row in attempts if row['operation'] == 'quotes' and clock(row['started_at']) <= cutoff]
    ordered_attempts = sorted(quote_attempts, key=lambda row: clock(row['started_at']))
    if any(clock(right['started_at']) < clock(left['finished_at'])
           for left, right in zip(ordered_attempts, ordered_attempts[1:])):
        raise ValueError('Overlapping quote requests do not establish one decision response')
    latest_attempt = max(quote_attempts, key=lambda row: clock(row['started_at']), default=None)
    if (latest_attempt is None or latest_attempt['code'] != 'SUCCESS'
            or clock(latest_attempt['finished_at']) > cutoff):
        raise ValueError('Decision requires a completed successful latest quote request and retained diagnostics')
    audit = audit_corpus(corpus)
    selected, withheld, seen = [], [], set()
    quotes, quote_keys = {}, {}
    for q in quote_export['observations']:
        if not isinstance(q, dict) or not label(q.get('contract_id')) or q['contract_id'] not in candidates:
            raise ValueError('Malformed quote observation')
        observed, received = clock(q.get('observed_at')), clock(q.get('received_at'))
        if observed is None or received is None or not observed <= received <= clock(quote_export['as_of']):
            raise ValueError('Invalid original quote clocks')
        key = q.get('contract_id'), received
        if key in quote_keys and quote_keys[key] != q:
            raise ValueError('Conflicting same-contract receipt observations')
        quote_keys[key] = q
        if received <= cutoff and q.get('contract_id') in candidates:
            if q['contract_id'] not in quotes or received > clock(quotes[q['contract_id']]['received_at']):
                # Newest response wins, including a failed response; never fall back to an older pass.
                quotes[q['contract_id']] = q
    for index, row in enumerate(corpus['records']):
        if not isinstance(row, dict) or row.get('reviewer_id') != corpus['selected_reviewer_id']:
            continue
        ident = row.get('candidate_id')
        reasons = list(audit['reviews'][index]['reasons'])
        if ident not in candidates or ident in seen:
            raise ValueError('Selected reviewer must have at most one record per packet candidate')
        seen.add(ident)
        reviewed = clock(row.get('reviewed_at'))
        if (row.get('evidence_set_id') != packet['packet_id'] or clock(row.get('as_of')) != cutoff
                or reviewed is None or not prepared <= reviewed <= cutoff):
            reasons.append('REVIEW_PACKET_CUTOFF_OR_COMPLETION_MISMATCH')
        q = quotes.get(ident)
        latest_receipt = max((clock(value['received_at']) for value in quotes.values()), default=None)
        if (q is not None and (q.get('quote_check') != 'QUOTE_CHECK_PASSED' or q.get('multiplier') != 100
                              or q.get('quote_check_reasons') or (cutoff - clock(q['observed_at'])).total_seconds() > POLICY['maximum_quote_age_seconds']
                              or clock(q['received_at']) != latest_receipt
                              or not clock(latest_attempt['started_at']) <= clock(q['received_at']) <= clock(latest_attempt['finished_at']))):
            q = None
        reasons += record_reasons(row, candidates[ident], q, cutoff)
        if reasons:
            withheld.append({'candidate_id': ident, 'reasons': sorted(set(reasons))})
        else:
            selected.append(copy.deepcopy(row))
    for ident in sorted(set(candidates) - seen):
        withheld.append({'candidate_id': ident, 'reasons': ['SELECTED_REVIEWER_RECORD_MISSING']})
    snapshot = {'packet_id': packet['packet_id'], 'as_of': cutoff.isoformat(), 'candidates': selected}
    scored = fixed_composite(snapshot)
    withheld += scored['withheld']
    admitted = {row['candidate_id'] for row in scored['scored']}
    targets = [{'minutes': minutes, 'target_at': (cutoff + timedelta(minutes=minutes)).isoformat(),
                'closes_at': (cutoff + timedelta(minutes=minutes, seconds=POLICY['window_tolerance_seconds'])).isoformat()}
               for minutes in POLICY['horizons_minutes']] if admitted else []
    return {'format': 'fixed-review-intake-v1', 'policy_version': POLICY['version'], 'policy_sha256': digest(POLICY),
            'method_sha256': method_fingerprint(),
            'status': 'ADMITTED_OFFLINE' if admitted else 'WITHHELD',
            'packet_id': packet['packet_id'], 'as_of': cutoff.isoformat(), 'corpus_audit': audit,
            'fixed_report': scored, 'withheld': withheld, 'candidate_count': len(candidates),
            'admitted_count': len(scored['scored']), 'scoring_snapshot': snapshot,
            'capture_targets': targets,
            'outcome_input': {'format': 'shadow-outcome-input-v1', 'as_of': quote_export['as_of'],
                              'entries': [{'candidate_id': ident, 'decision_at': cutoff.isoformat(), 'quote': copy.deepcopy(quotes[ident])}
                                          for ident in sorted(admitted)],
                              'observations': copy.deepcopy(quote_export['observations']),
                              'validation_policy': {'horizons_minutes': POLICY['horizons_minutes'],
                                                    'window_tolerance_seconds': POLICY['window_tolerance_seconds'],
                                                    'entry': 'ask', 'exit': 'bid'}},
            'input_sha256': {'packet': digest(packet), 'corpus': digest(corpus), 'quote_export': digest(quote_export)},
            'ranking_effect': 'NONE', 'performance_evaluated': False,
            'limitations': ['Supplied evidence and reviewer identities are not independently authenticated.',
                            'Content hashes bind supplied inputs; they do not prove source truth.',
                            'Outcome clocks use the declared decision after browser request completion; earlier first-passing receipts cannot substitute.',
                            'A passing intake does not establish predictive improvement or release readiness.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    freeze_command = commands.add_parser('freeze')
    freeze_command.add_argument('snapshot')
    freeze_command.add_argument('batch')
    scanner_command = commands.add_parser('scanner')
    scanner_command.add_argument('packet')
    prepare_command = commands.add_parser('prepare')
    prepare_command.add_argument('packet')
    admit_command = commands.add_parser('admit')
    for name in ('packet', 'corpus', 'quote_export'):
        admit_command.add_argument(name)
    args = parser.parse_args()
    if args.command == 'freeze':
        result = freeze(json.loads(Path(args.snapshot).read_text()), json.loads(Path(args.batch).read_text()))
    else:
        packet = json.loads(Path(args.packet).read_text())
    if args.command == 'prepare':
        result = prepare(packet)
    elif args.command == 'scanner':
        result = scanner_import(packet)
    elif args.command == 'admit':
        result = admit(packet, json.loads(Path(args.corpus).read_text()), json.loads(Path(args.quote_export).read_text()))
    print(json.dumps(result, indent=2, allow_nan=False))
