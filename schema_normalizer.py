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

# Strong event language is deliberately narrower than generic financial/news language.
# This prevents unrelated headlines (for example, another company's CEO change) from
# becoming DIRECT catalysts merely because the word "CEO" appears.
direct_terms = (
    'reports earnings','reports results','earnings beat','earnings miss','raises guidance',
    'cuts guidance','withdraws guidance','acquisition','merger','buyout','to acquire',
    'acquires','contract win','wins contract','partnership','strategic agreement',
    'announces agreement','signs agreement','convertible notes','convertible offering',
    'secondary offering','public offering','stock offering','files 8-k','files 10-q',
    'files 10-k','lawsuit','settlement','fda approval','regulatory approval','receives approval',
    'product approval','recall','appoints ceo','appoints cfo','ceo resigns','cfo resigns',
    'ceo leaves','cfo leaves','price target','upgraded','downgraded','initiates coverage',
    'initiated coverage','raises price target','cuts price target','raises target','cuts target'
)
background_terms = (
    'should you buy','should you sell','could derail','could be','could become','better buy',
    'better value','what needs to be true','is it time to','here\'s why','here is why',
    'market today','sector update','forecast','price prediction','what investors need to know',
    'fully priced','earnings story','ahead of earnings','vs.',' vs ','betting on','stocks to own',
    'growth come from','may be missing','what to expect','what you need to know',
    'why .* stock is','why .* shares','gains as market','trade up, what you need'
)


def ticker_is_explicit(ticker, item):
    """Require the article itself to reference the candidate ticker before DIRECT."""
    t = str(ticker or '').upper().strip()
    if not t:
        return False
    title = str(item.get('title', ''))
    url = str(item.get('url', ''))
    # Exact ticker token in title/URL. This is especially useful for short tickers where
    # substring matches would create false positives (e.g. NET inside "internet").
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

    # CALL/PUT is an options-flow label, not a stock-direction guess. If there is no
    # same-day chain, expose NEUTRAL so the UI never implies options confirmation exists.
    has_zero_dte = bool(x.get('zero_dte')) or any(float(o.get('dte', 99) or 99) == 0 for o in (x.get('options') or []))
    if has_zero_dte:
        flow = str(x.get('option_flow_direction') or x.get('option_direction') or 'NEUTRAL').upper()
        if flow not in ('CALL', 'PUT', 'NEUTRAL'):
            flow = 'NEUTRAL'
    else:
        flow = 'NEUTRAL'
    x['option_flow_direction'] = flow
    x['option_direction'] = flow

    items = x.get('news_items') if isinstance(x.get('news_items'), list) else []
    ticker = x.get('ticker', '')
    for n in items:
        title = str(n.get('title', '')).lower()
        explicit = ticker_is_explicit(ticker, n)
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
        else:
            n['level'] = 'LIKELY'
            n['type'] = 'Company / Market News'
            n['catalyst_score'] = 1
    items.sort(key=lambda n:(n.get('catalyst_score', 0), -float(n.get('age_hours', 999))), reverse=True)
    x['news_items'] = items[:4]
    x['catalyst_level'] = 'DIRECT' if any(n.get('level') == 'DIRECT' for n in items) else ('LIKELY' if any(n.get('level') == 'LIKELY' for n in items) else 'NONE')
    x['catalyst_type'] = next((n.get('type') for n in items if n.get('level') in ('DIRECT', 'LIKELY')), 'None confirmed')
    x['catalyst'] = x['catalyst_level'] != 'NONE'
    x['news'] = ' | '.join(f"{n.get('title','')} ({n.get('publisher','')})" for n in items if n.get('title'))

if scan_mode == 'second-wave':
    data['candidates'] = sorted(
        data.get('candidates', []),
        key=lambda x:(float(x.get('volume_acceleration', 0) or 0), abs(float(x.get('recent_move', 0) or 0)), float(x.get('score', 0) or 0)),
        reverse=True,
    )
else:
    data['candidates'] = sorted(
        data.get('candidates', []),
        key=lambda x:(
            1 if x.get('preferred_contracts') else 0,
            1 if x.get('usable_contracts') else 0,
            1 if x.get('catalyst_level') == 'DIRECT' else 0,
            float(x.get('score', 0) or 0),
        ),
        reverse=True,
    )

data['schema_version'] = 3
data['data_quality'] = 'DELAYED_BEST_EFFORT'
data['dashboard_generated_at'] = datetime.now(timezone.utc).isoformat()
data['scan_mode'] = scan_mode
Path('data/market-dashboard.json').write_text(json.dumps(data, separators=(',', ':')))
print(f"normalized {len(data.get('candidates', []))} candidates; mode={scan_mode}")
