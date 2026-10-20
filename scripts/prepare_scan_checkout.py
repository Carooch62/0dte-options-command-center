"""Hydrate complete archive days before any sparse-checkout scan mutates history."""
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scan_archive import day_of

BASE_PATTERNS = ['/*', '!/data/', '/data/*.json']

def required_days(root, now=None):
    days = {day_of((now or datetime.now(timezone.utc)).isoformat())}
    for name, field in [('scan-history.json', 'generated_at'), ('option-observations.json', 'observed_at')]:
        path = Path(root) / 'data' / name
        if not path.exists():
            continue
        rows = json.loads(path.read_text())
        if not isinstance(rows, list):
            raise ValueError('Retained evidence must be a list: ' + name)
        for row in rows:
            days.add(day_of(row[field]))
    return sorted(days)

def hydrate(root=ROOT, now=None):
    days = required_days(root, now)
    patterns = BASE_PATTERNS + ['/data/archive/' + day + '/' for day in days]
    subprocess.run(['git', 'sparse-checkout', 'set', '--no-cone', '--stdin'],
                   input='\n'.join(patterns) + '\n', text=True, cwd=root, check=True)
    # Each referenced day is fully hydrated, including rolled-off scans and outcomes.
    # A failed fetch exits nonzero before archive_research can overwrite a partial index.
    print(json.dumps({'archive_checkout_days': days, 'archive_policy': 'complete_referenced_days'}))
    return days

if __name__ == '__main__':
    hydrate()
