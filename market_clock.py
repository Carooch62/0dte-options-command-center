"""US equity session dates, holidays and early closes."""
from datetime import datetime, time, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo
import exchange_calendars as xcals
ET = ZoneInfo('America/New_York')

@lru_cache(maxsize=1)
def calendar():
    return xcals.get_calendar('XNYS')

def session_info(now=None):
    now = (now or datetime.now(ET)).astimezone(ET)
    cal = calendar()
    day = now.date().isoformat()
    if not cal.is_session(day):
        return {'session': 'CLOSED', 'market_date': day, 'open_at': None, 'close_at': None}
    op = cal.session_open(day).to_pydatetime()
    cl = cal.session_close(day).to_pydatetime()
    if now < op:
        state = 'PREMARKET' if now.time() >= time(4) else 'CLOSED'
    elif now < cl: state = 'OPEN'
    else: state = 'AFTER HOURS' if now.time() < time(20) else 'CLOSED'
    return {'session':state, 'market_date':day, 'open_at':op.isoformat(), 'close_at':cl.isoformat()}
