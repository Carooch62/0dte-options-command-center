"""Synthetic news fixtures for isolated fixed-scoring release checks."""
from datetime import datetime, timezone

NOW = datetime(2026, 10, 8, 15, 0, tzinfo=timezone.utc)


def event(**changes):
    value = {'event_id': 'contract-1', 'ticker': 'TEST', 'title': 'TEST announces contract',
             'source_url': 'https://example.com/release', 'event_at': NOW.isoformat(),
             'published_at': NOW.isoformat(), 'reviewed_at': NOW.isoformat(),
             'horizon': 'INTRADAY', 'relevance': 'DIRECT', 'direction': 'BULLISH',
             'scores': {'materiality': 3, 'surprise': 3, 'credibility': 4, 'novelty': 4},
             'evidence': {k: 'Synthetic evidence for ' + k for k in
                          ('materiality', 'surprise', 'credibility', 'novelty', 'relevance', 'horizon', 'direction')}}
    value.update(changes)
    return value


def row(events=None, **changes):
    value = {'ticker': 'TEST', 'direction': 'UP', 'score': 9, 'news_status': 'SUCCESS',
             'news_checked_at': NOW.isoformat(), 'news_items': [{'title': 'Synthetic TEST announcement'}],
             'news_event_evidence': [event()] if events is None else events}
    value.update(changes)
    return value
