"""Compact contract identities for private comparison; never changes scores."""
import json
from pathlib import Path

def compact_candidates(snapshot):
    rows = []
    total = 0
    included = 0
    for candidate in snapshot.get('candidates', []):
        options = list(candidate.get('options') or [])
        for group in (candidate.get('expiry_groups') or {}).values():
            options.extend(group.get('options') or [])
        seen = set()
        contracts = []
        for option in options:
            identity = tuple(option.get(k) for k in ('contract_id', 'strike', 'side', 'expiry'))
            if identity in seen:
                continue
            seen.add(identity)
            contracts.append(dict(zip(('contract_id', 'strike', 'side', 'expiry'), identity)))
        total += len(contracts)
        selected = contracts[:20]
        included += len(selected)
        if selected:
            rows.append({'ticker': candidate['ticker'], 'options': selected})
    return {**{k: snapshot.get(k) for k in ('generated_at', 'scan_id', 'market_date', 'market_session')},
            'format': 'candidate-identities-v1', 'source': 'market-dashboard.json',
            'ranking_effect': 'NONE', 'selection': 'First 20 unique contracts per ticker in scanner order',
            'total_contracts': total, 'included_contracts': included, 'omitted_contracts': total-included, 'candidates': rows}

def write_compact(data_dir):
    data_dir = Path(data_dir)
    snapshot = json.loads((data_dir / 'market-dashboard.json').read_text())
    (data_dir / 'candidate-snapshot.json').write_text(json.dumps(compact_candidates(snapshot), separators=(',', ':')))

if __name__ == '__main__':
    import sys
    write_compact(sys.argv[1] if len(sys.argv) > 1 else 'data')
