import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import json, os, subprocess
from shadow_evidence import capture
health=json.loads(Path('data/scan-health.json').read_text())
snapshot=json.loads(Path('data/market-dashboard.json').read_text())
expected=os.environ.get('SCAN_REQUEST_ID')
if (isinstance(expected,str) and bool(expected.strip()) and health.get('stage')=='VALIDATED' and health.get('status') in ('SUCCESS','DEGRADED')
        and health.get('request_id')==expected==snapshot.get('scan_id')
        and snapshot.get('market_session')=='OPEN'):
    print(json.dumps(capture('data',source_commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip())))
else:
    print('No newly validated OPEN scan for this request; retained evidence is unchanged.')
