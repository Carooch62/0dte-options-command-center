"""Fixed-window quote markouts, never fills or a profitability backtest."""
import argparse
import json
import math
from datetime import timedelta
from news_research import clock

HORIZONS = (5, 15, 30)
TOLERANCE_SECONDS = 60
MAX_QUOTE_AGE_SECONDS = 60


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def quote_valid(quote, cutoff):
    if not isinstance(quote, dict):
        return False
    observed, received = clock(quote.get('observed_at')), clock(quote.get('received_at'))
    bid, ask = quote.get('bid'), quote.get('ask')
    return (observed is not None and received is not None and observed <= received <= cutoff
            and 0 <= (cutoff-observed).total_seconds() <= MAX_QUOTE_AGE_SECONDS
            and finite(bid) and finite(ask) and 0 < bid <= ask
            and ask-bid <= .10+1e-9 and (ask-bid)/((ask+bid)/2) <= .30+1e-9
            and isinstance(quote.get('source'), str) and bool(quote['source'].strip())
            and quote.get('multiplier') == 100 and type(quote.get('multiplier')) is int)


def stock_valid(observation, cutoff):
    observed, received = clock(observation.get('observed_at')), clock(observation.get('received_at'))
    return (observed is not None and received is not None and observed <= received <= cutoff
            and 0 <= (cutoff-observed).total_seconds() <= 300
            and finite(observation.get('price')) and observation['price'] > 0
            and isinstance(observation.get('source'), str) and bool(observation['source'].strip()))


def evaluate_outcomes(entries, observations, as_of, stock_observations=None):
    now = clock(as_of)
    if now is None or not isinstance(entries, list) or not isinstance(observations, list):
        raise ValueError('Entries, observations and timezone-aware as_of required')
    seen, results = set(), []
    stock_observations = stock_observations or []
    for entry in entries:
        ident, decision = entry.get('candidate_id'), clock(entry.get('decision_at'))
        if not isinstance(ident, str) or not ident or decision is None or (ident, decision) in seen:
            raise ValueError('Unique candidate_id/decision_at required')
        seen.add((ident, decision))
        start = entry.get('quote', {})
        valid_entry = decision <= now and start.get('contract_id') == ident and quote_valid(start, decision)
        row = {'candidate_id': ident, 'decision_at': decision.isoformat(), 'windows': [],
               'entry_status': 'QUOTE_ESTIMATE' if valid_entry else 'WITHHELD_ENTRY_QUOTE'}
        for minutes in HORIZONS:
            target = decision + timedelta(minutes=minutes)
            end = target + timedelta(seconds=TOLERANCE_SECONDS)
            window = {'minutes': minutes, 'target_at': target.isoformat(), 'status': 'PENDING'}
            if not valid_entry:
                window['status'] = 'WITHHELD_ENTRY_QUOTE'
            elif now >= target:
                # First observed eligible quote in the declared window; never best hindsight price.
                candidates = []
                for quote in observations:
                    observed, received = clock(quote.get('observed_at')), clock(quote.get('received_at'))
                    if (quote.get('contract_id') == ident and observed is not None and received is not None
                            and target <= observed <= end and received <= now and quote_valid(quote, received)):
                        candidates.append(quote)
                candidates.sort(key=lambda q: (clock(q['observed_at']), clock(q['received_at'])))
                if candidates:
                    first = candidates[0]
                    same_time = [q for q in candidates if clock(q['observed_at']) == clock(first['observed_at'])]
                    if len({(q['bid'], q['ask'], q['source']) for q in same_time}) > 1:
                        window['status'] = 'WITHHELD_CONFLICTING_QUOTES'
                    else:
                        delta = first['bid'] - start['ask']
                        window.update(status='QUOTE_ESTIMATE', exit_observed_at=first['observed_at'],
                                      entry_ask=start['ask'], exit_bid=first['bid'],
                                      gross_dollars_per_contract=round(delta*100, 6),
                                      gross_return_pct=round(delta/start['ask']*100, 6))
                elif now >= end:
                    window['status'] = 'WITHHELD_MISSING_WINDOW_QUOTE'
            row['windows'].append(window)
        # Extremes use all valid observed bids; missing intervals make these sampled estimates.
        sample_quotes = [q for q in observations if q.get('contract_id') == ident
                   and clock(q.get('observed_at')) is not None and clock(q.get('received_at')) is not None
                   and decision < clock(q['observed_at']) <= min(now, decision+timedelta(minutes=30))
                   and clock(q['received_at']) <= now and quote_valid(q, clock(q['received_at']))]
        conflicting = {clock(q['observed_at']) for q in sample_quotes
                       if len({(s['bid'], s['ask'], s['source']) for s in sample_quotes
                               if clock(s['observed_at']) == clock(q['observed_at'])}) > 1}
        samples = [q['bid'] for q in sample_quotes if clock(q['observed_at']) not in conflicting]
        row['sampled_excursion'] = ({'samples': len(samples),
                                    'best_bid_change_dollars': round((max(samples)-start['ask'])*100, 6),
                                    'worst_bid_change_dollars': round((min(samples)-start['ask'])*100, 6)}
                                   if valid_entry and samples else {'samples': 0, 'status': 'UNAVAILABLE'})
        stock = entry.get('stock', {})
        row['underlying_windows'] = []
        for minutes in HORIZONS:
            target = decision+timedelta(minutes=minutes)
            window = {'minutes': minutes, 'status': 'PENDING'}
            if not stock.get('ticker') or not stock_valid(stock, decision):
                window['status'] = 'WITHHELD_ENTRY_STOCK'
            elif now >= target:
                candidates = [s for s in stock_observations if s.get('ticker') == stock['ticker']
                              and clock(s.get('observed_at')) is not None and clock(s.get('received_at')) is not None
                              and target <= clock(s['observed_at']) <= target+timedelta(seconds=TOLERANCE_SECONDS)
                              and clock(s['received_at']) <= now and stock_valid(s, clock(s['received_at']))]
                candidates.sort(key=lambda s: (clock(s['observed_at']), clock(s['received_at'])))
                if candidates:
                    first = candidates[0]
                    if len({s['price'] for s in candidates if clock(s['observed_at']) == clock(first['observed_at'])}) > 1:
                        window['status'] = 'WITHHELD_CONFLICTING_STOCK'
                    else:
                        window.update(status='OBSERVED_MOVE', observed_at=first['observed_at'],
                                      change_pct=round((first['price']/stock['price']-1)*100, 6))
                elif now >= target+timedelta(seconds=TOLERANCE_SECONDS):
                    window['status'] = 'WITHHELD_MISSING_STOCK'
            row['underlying_windows'].append(window)
        results.append(row)
    return {'format': 'shadow-outcomes-v1', 'mode': 'OFFLINE_SHADOW', 'as_of': now.isoformat(),
            'policy': {'horizons_minutes': HORIZONS, 'window_tolerance_seconds': TOLERANCE_SECONDS,
                       'maximum_quote_age_seconds': MAX_QUOTE_AGE_SECONDS, 'entry': 'ask', 'exit': 'bid'},
            'results': results, 'ranking_effect': 'NONE',
            'limitations': ['Quotes are not fills; fees, slippage and available size are not modeled.',
                            'Sampled excursions are not continuous maximum favorable/adverse movement.',
                            'Missing or unknown quote clocks are withheld, never reconstructed.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input')
    args = parser.parse_args()
    with open(args.input) as handle:
        data = json.load(handle)
    print(json.dumps(evaluate_outcomes(data['entries'], data['observations'], data['as_of'], data.get('stock_observations')), indent=2))
