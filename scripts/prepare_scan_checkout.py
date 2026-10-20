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

def archive_requirements(root, now=None):
    scan_days = {day_of((now or datetime.now(timezone.utc)).isoformat())}
    observation_days = set()
    for name, field in [('scan-history.json', 'generated_at'), ('option-observations.json', 'observed_at')]:
        path = Path(root) / 'data' / name
        if not path.exists():
            continue
        rows = json.loads(path.read_text())
        if not isinstance(rows, list):
            raise ValueError('Retained evidence must be a list: ' + name)
        for row in rows:
            target = scan_days if name == 'scan-history.json' else observation_days
            target.add(day_of(row[field]))
    return sorted(scan_days), sorted(observation_days)

def hydrate(root=ROOT, now=None):
    scan_days, observation_days = archive_requirements(root, now)
    days = sorted(set(scan_days) | set(observation_days))
    patterns = (BASE_PATTERNS
                + ['/data/archive/' + day + '/' for day in scan_days]
                + ['/data/archive/' + day + '/option-observations.json.gz' for day in observation_days if day not in scan_days])
    subprocess.run(['git', 'sparse-checkout', 'set', '--no-cone', '--stdin'],
                   input='\n'.join(patterns) + '\n', text=True, cwd=root, check=True)
    # Scan days are complete for index rebuilds. Observation-only days need their
    # complete merged observation file; no scan index is read or rebuilt for them.
    # A failed fetch exits nonzero before archive_research can overwrite a partial index.
    print(json.dumps({'scan_archive_days': scan_days, 'observation_archive_days': observation_days,
                      'archive_policy': 'complete_scan_days_and_observation_files'}))
    return days

if __name__ == '__main__':
    hydrate()
