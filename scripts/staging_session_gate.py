"""Schedule is an attempt; the exchange calendar and current code gate collection."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from datetime import datetime, timedelta, timezone
from market_clock import session_info

def collection_open(now=None):
    now=now or datetime.now(timezone.utc)
    info=session_info(now)
    return info['session']=='OPEN' and now>=datetime.fromisoformat(info['open_at'])+timedelta(minutes=5)

if __name__=='__main__':
    print('collect='+str(collection_open()).lower())
