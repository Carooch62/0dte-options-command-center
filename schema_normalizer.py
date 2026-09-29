#!/usr/bin/env python3
"""Normalize scanner output into a stable dashboard contract."""
import json
import os
from pathlib import Path
from datetime import datetime, timezone

src = Path('data/market.json')
data = json.loads(src.read_text())
scan_mode = os.getenv('SCAN_MODE') or data.get('scan_mode') or 'scheduled'

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
    x['option_flow_direction'] = x.get('option_flow_direction') or x.get('option_direction') or 'NEUTRAL'
    x['option_direction'] = x['option_flow_direction']

    items = x.get('news_items') if isinstance(x.get('news_items'), list) else []
    direct_terms = (
        'earnings','guidance','fda','acquisition','merger','buyout','contract','partnership',
        'agreement','offering','convertible notes','upgrade','downgrade','price target',
        'initiated','8-k','10-q','10-k','lawsuit','settlement','ceo','cfo','approval','recall'
    )
    background_terms = (
        'should you buy','should you sell','could derail','better buy','better value',
        'what needs to be true','is it time to','here\'s why','market today','sector update',
        'forecast','price prediction','what investors need to know'
    )
    for n in items:
        title = str(n.get('title','')).lower()
        if any(k in title for k in direct_terms):
            n['level'] = 'DIRECT'; n['type'] = 'Company-specific event'; n['catalyst_score'] = 3
        elif any(k in title for k in background_terms):
            n['level'] = 'BACKGROUND'; n['type'] = 'Background / Opinion'; n['catalyst_score'] = 0
        else:
            n['level'] = 'LIKELY'; n['type'] = 'Company / Market News'; n['catalyst_score'] = 1
    items.sort(key=lambda n:(n.get('catalyst_score',0), -float(n.get('age_hours',999))), reverse=True)
    x['news_items'] = items[:4]
    x['catalyst_level'] = 'DIRECT' if any(n.get('level')=='DIRECT' for n in items) else ('LIKELY' if any(n.get('level')=='LIKELY' for n in items) else 'NONE')
    x['catalyst_type'] = next((n.get('type') for n in items if n.get('level') in ('DIRECT','LIKELY')), 'None confirmed')
    x['catalyst'] = x['catalyst_level'] != 'NONE'
    x['news'] = ' | '.join(f"{n.get('title','')} ({n.get('publisher','')})" for n in items if n.get('title'))

if scan_mode == 'second-wave':
    data['candidates'] = sorted(
        data.get('candidates', []),
        key=lambda x:(float(x.get('volume_acceleration',0) or 0), abs(float(x.get('recent_move',0) or 0)), float(x.get('score',0) or 0)),
        reverse=True,
    )
else:
    data['candidates'] = sorted(
        data.get('candidates', []),
        key=lambda x:(
            1 if x.get('preferred_contracts') else 0,
            1 if x.get('usable_contracts') else 0,
            1 if x.get('catalyst_level') == 'DIRECT' else 0,
            float(x.get('score',0) or 0),
        ),
        reverse=True,
    )

data['schema_version'] = 2
data['data_quality'] = 'DELAYED_BEST_EFFORT'
data['dashboard_generated_at'] = datetime.now(timezone.utc).isoformat()
data['scan_mode'] = scan_mode
Path('data/market-dashboard.json').write_text(json.dumps(data, separators=(',', ':')))
print(f"normalized {len(data.get('candidates', []))} candidates; mode={scan_mode}")
