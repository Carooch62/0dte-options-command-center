"""Point-in-time session labels, never a ranking or entry input."""
from quality import parse_time, ET

def session_context(bar_start, session_open):
    stamp,op=parse_time(bar_start),parse_time(session_open)
    if stamp is None or op is None:return {'version':1,'status':'UNKNOWN','event_day':'UNKNOWN'}
    et=stamp.astimezone(ET)
    minutes=(stamp-op).total_seconds()/60
    return {'version':1,'status':'OBSERVED','bar_start':bar_start,
            'minutes_since_open':minutes,'first_hour':0<=minutes<60,
            'window_1300_1400_et':13<=et.hour<14,'event_day':'UNKNOWN',
            'ranking_effect':'NONE','limitation':'Time-window hypothesis; event-day classification needs separately timestamped calendar evidence.'}
