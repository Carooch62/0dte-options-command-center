"""Build in isolation and replace published data only after validation."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone, timedelta
from market_clock import session_info
from scan_archive import archive_research, archive_receipt

ROOT=Path(__file__).resolve().parent
FILES=('market.json','market-dashboard.json','scan-history.json','feedback.json','option-observations.json','trend-cache.json')

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
    return {'status':'DEGRADED' if raw.get('core_missing') or received<configured*.9 or any(raw['coverage']['chain_status_counts'].get(s) for s in ('SOURCE_FAILURE','EMPTY_UNVERIFIED')) else 'SUCCESS',
            'coverage':raw['coverage'],'core_missing':raw.get('core_missing',[]),'scan_id':raw['scan_id']}

def run():
    dest=ROOT/'data';dest.mkdir(exist_ok=True)
    health={'updated_at':datetime.now(timezone.utc).isoformat(),'run_id':os.getenv('GITHUB_RUN_ID'),
            'request_id':os.getenv('SCAN_REQUEST_ID') or None,'status':'RUNNING'}
    try:
        if (dest/'scan-history.json').exists() and (dest/'option-observations.json').exists():
            health['stage']='ARCHIVE_EXISTING'
            archive_research(dest, dest/'archive')
        now=datetime.now(timezone.utc)
        info=session_info(now)
        first_bar_at=datetime.fromisoformat(info['open_at'])+timedelta(minutes=5) if info.get('open_at') else None
        waiting=info['session']=='OPEN' and first_bar_at is not None and now<first_bar_at
        if info['session']=='CLOSED' or waiting:
            status='WAITING_FOR_BAR' if waiting else 'CLOSED'
            health.update(status=status,stage='MARKET_CALENDAR')
            if waiting: health.update(retry_after=first_bar_at.isoformat(),message='Waiting for the first completed five-minute regular-session bar; last snapshot retained.')
            receipt_path=dest/'scan-receipts.json'
            try: receipts=json.loads(receipt_path.read_text())
            except (OSError,ValueError): receipts=[]
            if not isinstance(receipts,list): receipts=[]
            # Preserve a pre-upgrade closed result before the new health record replaces it.
            try: prior=json.loads((dest/'scan-health.json').read_text())
            except (OSError,ValueError): prior={}
            prior_id=prior.get('request_id') or prior.get('run_id')
            if prior.get('status')=='CLOSED' and prior_id and not any(r.get('scan_id')==prior_id for r in receipts):
                receipts.append({'scan_id':prior_id,'run_id':prior.get('run_id'),'status':'CLOSED',
                                 'completed_at':prior.get('updated_at')})
            request_id=health['request_id'] or health['run_id']
            receipts=[r for r in receipts if r.get('scan_id')!=request_id]
            receipts.append({'scan_id':request_id,'run_id':health['run_id'],'status':status,
                             'completed_at':datetime.now(timezone.utc).isoformat(),
                             **({'retry_after':health['retry_after']} if waiting else {})})
            receipt_path.write_text(json.dumps(receipts[-100:],separators=(',',':')))
            return 0
        with tempfile.TemporaryDirectory(prefix='scan-') as folder:
            stage=Path(folder);(stage/'data').mkdir()
            for name in ('scan-history.json','option-observations.json','trend-cache.json'):
                if (dest/name).exists():shutil.copy2(dest/name,stage/'data'/name)
            for name in ('scanner.py','trend_context.py','option_expander.py','core_0dte.py','schema_normalizer.py','execution_normalizer.py'):
                health['stage']=name
                try:
                    subprocess.run([sys.executable,str(ROOT/name)],cwd=stage,check=True,timeout=300 if name in ('scanner.py','option_expander.py') else 120)
                except (subprocess.SubprocessError, OSError):
                    if name != 'trend_context.py':
                        raise
                    # Daily context is optional; its failure cannot discard a valid
                    # intraday scan. Preserve the existing cache and publish UNKNOWN.
                    raw=json.loads((stage/'data/market.json').read_text())
                    for row in raw.get('candidates', []):
                        row['trend_context']={'status':'SOURCE_FAILURE','alignment':'UNKNOWN','periods':{}}
                    (stage/'data/market.json').write_text(json.dumps(raw,separators=(',',':')))
                    cache_path=stage/'data/trend-cache.json'
                    if not cache_path.exists():cache_path.write_text('{}')
            health.update(validate(stage))
            health['stage']='ARCHIVE'
            archive_research(stage/'data', dest/'archive')
            # The complete retained history is archived before bounding the live file.
            history_path=stage/'data/scan-history.json'
            history_path.write_text(json.dumps(json.loads(history_path.read_text())[-50:],separators=(',',':')))
            snapshot=json.loads((stage/'data/market-dashboard.json').read_text())
            receipt_path=dest/'scan-receipts.json'
            try: receipts=json.loads(receipt_path.read_text())
            except (OSError,ValueError): receipts=[]
            if not isinstance(receipts,list): receipts=[]
            receipts=[r for r in receipts if r.get('scan_id')!=snapshot['scan_id']]
            receipts.append({'scan_id':snapshot['scan_id'],'run_id':health['run_id'],
                             'generated_at':snapshot['generated_at'],'coverage':snapshot['coverage']})
            for name in FILES:shutil.copy2(stage/'data'/name,dest/name)
            receipt_path.write_text(json.dumps(receipts[-100:],separators=(',',':')))
        health['stage']='VALIDATED'
        return 0
    except Exception as exc:
        health.update(status='FAILED',error=f'{type(exc).__name__}: {str(exc)[:180]}')
        return 1
    finally:
        health['updated_at']=datetime.now(timezone.utc).isoformat()
        try:
            receipt_path=dest/'scan-receipts.json'
            archive_receipt(dest/'archive', health, json.loads(receipt_path.read_text()) if receipt_path.exists() else [])
        except Exception as exc:
            health['archive_error']=f'{type(exc).__name__}: {str(exc)[:180]}'
        (dest/'scan-health.json').write_text(json.dumps(health,separators=(',',':')))
        print(json.dumps(health))

if __name__=='__main__':sys.exit(run())
