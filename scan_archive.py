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
    for row in json.loads((source / 'scan-history.json').read_text()):
        timestamp = row['generated_at']
        key = hashlib.sha256(str(row.get('scan_id') or timestamp).encode()).hexdigest()[:24]
        path = destination / day_of(timestamp) / 'scans' / (key + '.json.gz')
        if not path.exists():
            write_gzip(path, row)
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
