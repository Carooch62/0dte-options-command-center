#!/usr/bin/env python3
"""Normalize scanner output into a stable dashboard contract."""
import json
import os
import re
from pathlib import Path
from datetime import datetime, timezone

src = Path('data/market.json')
data = json.loads(src.read_text())
scan_mode = os.getenv('SCAN_MODE') or data.get('scan_mode') or 'scheduled'

direct_terms = (
    'reports earnings','reports results','earnings beat','earnings miss','raises guidance',
    'cuts guidance','withdraws guidance','acquisition','merger','buyout','to acquire',
    'acquires','contract win','wins contract','partnership','strategic agreement',
    'announces agreement','signs agreement','convertible notes','convertible offering',
    'secondary offering','public offering','stock offering','files 8-k','files 10-q',
    'files 10-k','lawsuit','settlement','fda approval','regulatory approval','receives approval',
    'product approval','recall','appoints ceo','appoints cfo','ceo resigns','cfo resigns',
    'ceo leaves','cfo leaves','price target','upgraded','downgraded','initiates coverage',
    'initiated coverage','raises price target','cuts price target','raises target','cuts target',
)
background_terms = (
    'should you buy','should you sell','could derail','could be','could become','better buy',
    'better value','what needs to be true','what needs to happen','is it time to','here\'s why',
    'here is why','market today','sector update','forecast','price prediction','what investors need to know',
    'fully priced','earnings story','ahead of earnings',' vs ','betting on','stocks to own',
    'growth come from','may be missing','what to expect','what you need to know',
    'why .* stock is','why .* shares','gains as market','trade up, what you need',
)


def ticker_explicit(ticker, item):
    """Require the candidate ticker to be explicitly named in the article title/URL.
    relatedTickers alone is not enough because broad articles can list many symbols."""
    t = str(ticker or '').upper().strip()
    title = str(item.get('title', ''))
    url = str(item.get('url', ''))
    pat = re.compile(r'(?<![A-Z0-9])' + re.escape(t) + r'(?![A-Z0-9])', re.I)
    return bool(pat.search(title) or pat.search(url))


for x in data.get('candidates', []):
    move = float(x.get('day_move', x.get('change_pct', 0)) or 0)
    rvol = float(x.get('rvol', x.get('volume_ratio', 0)) or 0)
    cp = float(x.get('cp_ratio', x.get('call_put_ratio', x.get('option_call_put_ratio', 0))) or 0)
    x['change_pct'] = round(move, 2)
    x['percent_change'] = round(move, 2)
    x['change'] = round(move, 2)
    x['rvol'] = round(rvol, 2)
    x['volume_ratio'] = round(rvol, 2)
    x['cp_ratio'] = round(cp, 2)
    x['call_put_ratio'] = round(cp, 2)
    x['option_call_put_ratio'] = round(cp, 2)

    flow = str(x.get('option_flow_direction') or x.get('option_direction') or 'NEUTRAL').upper()
    if flow not in ('CALL', 'PUT', 'NEUTRAL') or not x.get('zero_dte'):
        flow = 'NEUTRAL'
    x['option_flow_direction'] = flow
    x['option_direction'] = flow

    items = x.get('news_items') if isinstance(x.get('news_items'), list) else []
    ticker = x.get('ticker', '')
    for n in items:
        title = str(n.get('title', '')).lower()
        explicit = ticker_explicit(ticker, n)
        is_background = any(k in title for k in background_terms)
        is_direct = explicit and any(k in title for k in direct_terms)
        if is_background:
            n['level'] = 'BACKGROUND'
            n['type'] = 'Background / Opinion'
            n['catalyst_score'] = 0
        elif is_direct:
            n['level'] = 'DIRECT'
            n['type'] = 'Company-specific event'
            n['catalyst_score'] = 3
        elif explicit:
            n['level'] = 'LIKELY'
            n['type'] = 'Company-specific news'
            n['catalyst_score'] = 1
        else:
            n['level'] = 'BACKGROUND'
            n['type'] = 'Market / Sector context'
            n['catalyst_score'] = 0
    items.sort(key=lambda n: (n.get('catalyst_score', 0), -float(n.get('age_hours', 999))), reverse=True)
    x['news_items'] = items[:4]
    x['catalyst_level'] = 'DIRECT' if any(n.get('level') == 'DIRECT' for n in items) else ('LIKELY' if any(n.get('level') == 'LIKELY' for n in items) else 'NONE')
    x['catalyst_type'] = next((n.get('type') for n in items if n.get('level') in ('DIRECT', 'LIKELY')), 'None confirmed')
    x['catalyst'] = x['catalyst_level'] != 'NONE'
    x['news'] = ' | '.join(f"{n.get('title','')} ({n.get('publisher','')})" for n in items if n.get('title'))

    preferred = x.get('preferred_contracts') or []
    usable = x.get('usable_contracts') or []
    aligned = (flow == 'CALL' and move > 0) or (flow == 'PUT' and move < 0)
    momentum = abs(move) >= 3 and rvol >= 1.5
    acceleration = float(x.get('volume_acceleration', 0) or 0) >= 1.25 and abs(float(x.get('move_5m', 0) or 0)) >= 0.25
    catalyst = x['catalyst_level'] in ('DIRECT', 'LIKELY')
    x['flow_aligned'] = aligned
    x['momentum_confirmed'] = momentum
    x['acceleration_confirmed'] = acceleration
    x['confirmation_count'] = sum(bool(v) for v in (catalyst, momentum or acceleration, aligned, preferred))

    if preferred and x['catalyst_level'] == 'DIRECT' and (momentum or acceleration) and (aligned or flow == 'NEUTRAL'):
        x['setup_bucket'] = 'CONFIRMED WATCH'
    elif preferred or (usable and (momentum or acceleration)):
        x['setup_bucket'] = 'WATCH'
    elif catalyst and (momentum or acceleration):
        x['setup_bucket'] = 'SECOND-WAVE'
    else:
        x['setup_bucket'] = 'PASS'

if scan_mode == 'second-wave':
    data['candidates'] = sorted(
        data.get('candidates', []),
        key=lambda x: (
            1 if x.get('setup_bucket') == 'SECOND-WAVE' else 0,
            float(x.get('volume_acceleration', 0) or 0),
            abs(float(x.get('move_5m', 0) or 0)),
            abs(float(x.get('recent_move', 0) or 0)),
            float(x.get('score', 0) or 0),
        ), reverse=True,
    )
else:
    data['candidates'] = sorted(
        data.get('candidates', []),
        key=lambda x: (
            1 if x.get('setup_bucket') == 'CONFIRMED WATCH' else 0,
            1 if x.get('preferred_contracts') else 0,
            1 if x.get('catalyst_level') == 'DIRECT' else 0,
            1 if x.get('acceleration_confirmed') else 0,
            float(x.get('score', 0) or 0),
        ), reverse=True,
    )

data['schema_version'] = 4
data['data_quality'] = 'DELAYED_BEST_EFFORT'
data['dashboard_generated_at'] = datetime.now(timezone.utc).isoformat()
data['scan_mode'] = scan_mode
Path('data/market-dashboard.json').write_text(json.dumps(data, separators=(',', ':')))
print(f"normalized {len(data.get('candidates', []))} candidates; mode={scan_mode}")
