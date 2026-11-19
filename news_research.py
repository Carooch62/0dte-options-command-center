"""Versioned, equal-budget news selection for isolated staging only."""
import hashlib
from datetime import datetime, timezone
from pathlib import Path
import json
from quality import ET

POLICY = 'news-session-switchback-v1'

def select_news(rows, now=None, data_dir='data'):
    now = now or datetime.now(timezone.utc)
    marker = Path(data_dir) / 'staging-environment.json'
    isolated = marker.exists() and json.loads(marker.read_text()).get('environment') == 'staging'
    day = now.astimezone(ET).date().isoformat()
    # Assignment is fixed before each session, not selected from its outcomes.
    arm = ('TOP50' if int(hashlib.sha256((POLICY + day).encode()).hexdigest(), 16) % 2 == 0 else 'TOP40_ROTATE10') if isolated else 'TOP50'
    if arm == 'TOP50' or len(rows) <= 50:
        selected = rows[:50]
    else:
        remainder = sorted(rows[40:], key=lambda r: r['ticker'])
        slot = int(now.timestamp() // 900)
        start = (slot * 10) % len(remainder)
        selected = rows[:40] + [remainder[(start + i) % len(remainder)] for i in range(10)]
    return selected, {'policy': POLICY if isolated else 'production-top50',
                      'environment': 'staging' if isolated else 'production',
                      'arm': arm, 'session_date': day, 'budget': 50,
                      'selected': [r['ticker'] for r in selected],
                      'selected_at': now.isoformat(), 'ranking_effect': 'STAGING_ONLY' if isolated else 'NONE',
                      'limitations': 'Session-level deterministic assignment, not a randomized causal result. Compare coverage, failures and runtime before strategy outcomes.'}
