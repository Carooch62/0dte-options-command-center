"""Compressed daily research archives. Never contain the browser trade journal."""
import gzip
import hashlib
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ET = ZoneInfo('America/New_York')

def day_of(timestamp):
    dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
    if dt.tzinfo is None:
        raise ValueError('Archive timestamp must include timezone')
    return dt.astimezone(ET).date().isoformat()

def write_gzip(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_bytes(gzip.compress(json.dumps(value, separators=(',', ':')).encode(), mtime=0))
    temporary.replace(path)

def archive_research(source, destination):
    """Backfill retained rows; absent earlier scans remain absent, never reconstructed."""
    source, destination = Path(source), Path(destination)
    affected_days = set()
    for row in json.loads((source / 'scan-history.json').read_text()):
        timestamp = row['generated_at']
        affected_days.add(day_of(timestamp))
        key = hashlib.sha256(str(row.get('scan_id') or timestamp).encode()).hexdigest()[:24]
        path = destination / day_of(timestamp) / 'scans' / (key + '.json.gz')
        if not path.exists():
            write_gzip(path, row)
    for day in affected_days:
        rebuild_brokerage_index(destination / day)
    groups = {}
    for row in json.loads((source / 'option-observations.json').read_text()):
        groups.setdefault(day_of(row['observed_at']), []).append(row)
    for day, rows in groups.items():
        path = destination / day / 'option-observations.json.gz'
        previous = json.loads(gzip.decompress(path.read_bytes())) if path.exists() else []
        # Later markouts update an existing event; rolled-off events survive.
        merged = {(r['scan_id'], r['contract_id']): r for r in previous}
        merged.update({(r['scan_id'], r['contract_id']): r for r in rows})
        write_gzip(path, sorted(merged.values(), key=lambda r: r['observed_at']))

def archive_receipt(destination, health, receipts):
    key = hashlib.sha256(str(health.get('request_id') or health.get('run_id') or health['updated_at']).encode()).hexdigest()[:24]
    matching = [r for r in receipts if r.get('run_id') == health.get('run_id') and r.get('run_id') is not None]
    write_gzip(Path(destination) / day_of(health['updated_at']) / 'receipts' / (key + '.json.gz'),
               {'health': health, 'receipts': matching})


BROKER_FIELDS = ('ticker', 'rank', 'direction', 'setup_qualified', 'qualification_checks',
                 'qualification_reasons', 'bar_end', 'execution_state', 'chase_risk',
                 'vwap', 'price', 'trigger_price', 'volume_ratio', 'volume_acceleration', 'trend_context')

def rebuild_brokerage_index(day_path):
    """Expose decision-time fields only; omit later markouts and outcome labels."""
    day_path = Path(day_path)
    scans, contexts, context_ids = [], [], {}
    for path in sorted((day_path / 'scans').glob('*.json.gz')):
        row = json.loads(gzip.decompress(path.read_bytes()))
        scan = {k: row[k] for k in ('scan_id', 'generated_at', 'dashboard_generated_at',
                                   'recovered_commit_at', 'recovered_from_commit') if k in row}
        scan['candidate_state'] = [{k: candidate[k] for k in BROKER_FIELDS if k in candidate}
                                   for candidate in row.get('candidate_state', [])]
        for candidate in scan['candidate_state']:
            if 'trend_context' in candidate:
                context = candidate.pop('trend_context')
                key = json.dumps(context, sort_keys=True, separators=(',', ':'))
                if key not in context_ids:
                    context_ids[key] = len(contexts)
                    contexts.append(context)
                candidate['trend_context_ref'] = context_ids[key]
        scans.append(scan)
    scans.sort(key=lambda s: s.get('dashboard_generated_at') or s['generated_at'])
    target = day_path / 'brokerage-scans.json'
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps({'version': 1, 'snapshots': scans, 'trend_contexts': contexts}, separators=(',', ':')))
    temporary.replace(target)
