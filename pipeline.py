"""Build in isolation and replace published data only after validation."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from market_clock import session_info

ROOT=Path(__file__).resolve().parent
FILES=('market.json','market-dashboard.json','scan-history.json','feedback.json','option-observations.json')

def validate(stage):
    raw=json.loads((stage/'data/market.json').read_text())
    dashboard=json.loads((stage/'data/market-dashboard.json').read_text())
    configured=raw['universe_size'];received=len(raw['candidates'])
    if not received or received<configured*.5:raise ValueError(f'Insufficient price coverage: {received}/{configured}')
    if dashboard['schema_version']!=7:raise ValueError('Unexpected schema')
    expected=sum(bool(x.get('chain_attempted')) for x in raw['candidates'])
    if raw['coverage']['chains_attempted']!=expected:raise ValueError('Coverage accounting mismatch')
    for x in dashboard['candidates']:
        if 'execution_state' not in x:raise ValueError('Missing execution state')
        for o in x.get('preferred_contracts',[]):
            if not o['quote_valid'] or not o['delta_ok'] or not o['tight_spread']:raise ValueError('Invalid preferred contract')
    return {'status':'DEGRADED' if raw.get('core_missing') or received<configured*.9 or raw['coverage']['chain_status_counts'].get('SOURCE_FAILURE') else 'SUCCESS',
            'coverage':raw['coverage'],'core_missing':raw.get('core_missing',[]),'scan_id':raw['scan_id']}

def run():
    dest=ROOT/'data';dest.mkdir(exist_ok=True)
    health={'updated_at':datetime.now(timezone.utc).isoformat(),'run_id':os.getenv('GITHUB_RUN_ID'),
            'request_id':os.getenv('SCAN_REQUEST_ID') or None,'status':'RUNNING'}
    try:
        if session_info()['session']=='CLOSED':
            health.update(status='CLOSED',stage='MARKET_CALENDAR')
            return 0
        with tempfile.TemporaryDirectory(prefix='scan-') as folder:
            stage=Path(folder);(stage/'data').mkdir()
            for name in ('scan-history.json','option-observations.json'):
                if (dest/name).exists():shutil.copy2(dest/name,stage/'data'/name)
            for name in ('scanner.py','option_expander.py','core_0dte.py','schema_normalizer.py','execution_normalizer.py'):
                health['stage']=name
                subprocess.run([sys.executable,str(ROOT/name)],cwd=stage,check=True,timeout=300 if name in ('scanner.py','option_expander.py') else 120)
            health.update(validate(stage))
            for name in FILES:shutil.copy2(stage/'data'/name,dest/name)
        health['stage']='VALIDATED'
        return 0
    except Exception as exc:
        health.update(status='FAILED',error=f'{type(exc).__name__}: {str(exc)[:180]}')
        return 1
    finally:
        health['updated_at']=datetime.now(timezone.utc).isoformat()
        (dest/'scan-health.json').write_text(json.dumps(health,separators=(',',':')))
        print(json.dumps(health))

if __name__=='__main__':sys.exit(run())
