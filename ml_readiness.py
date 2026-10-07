"""Audit retained signal observations without claiming executed returns or model readiness."""
import argparse
import gzip
import json
from pathlib import Path
from quality import parse_time


def audit(data_dir):
    data_dir = Path(data_dir)
    sources = [data_dir / 'option-observations.json', *sorted((data_dir / 'archive').glob('*/option-observations.json.gz'))]
    records = {}; failures = []
    for path in sources:
        if not path.exists():
            continue
        try:
            raw = gzip.decompress(path.read_bytes()) if path.suffix == '.gz' else path.read_bytes()
            rows = json.loads(raw)
            if not isinstance(rows, list):
                raise ValueError('Expected observation array')
            for row in rows:
                key = (row['scan_id'], row['contract_id'])
                if key not in records or len(row.get('markouts', {})) > len(records[key].get('markouts', {})):
                    records[key] = row
        except (OSError, ValueError, KeyError, TypeError) as exc:
            failures.append({'path': str(path.relative_to(data_dir)), 'error': type(exc).__name__})
    sessions = {}
    for row in records.values():
        day = row.get('market_date') or 'UNKNOWN'
        stats = sessions.setdefault(day, {'observations': 0, 'quote_timed': 0, 'theta_recorded': 0,
                                         'spread_recorded': 0, 'timed_followup': 0})
        stats['observations'] += 1
        stats['quote_timed'] += bool(parse_time(row.get('quote_timestamp')))
        stats['theta_recorded'] += row.get('theta') is not None
        stats['spread_recorded'] += row.get('spread') is not None
        stats['timed_followup'] += any(m.get('timing_verified') is True and parse_time(m.get('quote_timestamp'))
                                      for m in row.get('markouts', {}).values())
    usable = sorted(day for day, stats in sessions.items() if day != 'UNKNOWN' and stats['quote_timed'] and stats['timed_followup'])
    return {'version': 1, 'observations': len(records), 'distinct_sessions': len([d for d in sessions if d != 'UNKNOWN']),
            'sessions': dict(sorted(sessions.items())), 'sessions_with_timed_entry_and_followup': usable,
            'source_failures': failures, 'ml_ready': False, 'split_status': 'NOT_ASSIGNED',
            'blockers': ['Chronological train/validation/test periods have not been audited and reserved.',
                         'Quote timing, missing features, overlapping horizons and source changes require validation.',
                         'Retained observations select qualifying signals; they do not represent all candidate decisions.'],
            'next_step': 'Validate timestamped entry/follow-up pairs, retain candidate controls, then reserve whole sessions chronologically with a gap for overlapping horizons. Evaluate a simple baseline in shadow mode against existing rules.',
            'interpretation': 'Delayed quote research; execution, fees and tradable returns are not verified. No arbitrary observation count establishes readiness.'}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', default='data')
    args = parser.parse_args()
    print(json.dumps(audit(args.data_dir), indent=2))
