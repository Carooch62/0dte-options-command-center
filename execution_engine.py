"""Execution-state and feedback layer for the 0DTE Command Center.

This module deliberately consumes normalized scanner snapshots instead of
replacing the existing scanner. It adds execution context, key levels,
second-wave state, momentum decay, chase risk, contract fit and session
feedback while keeping the underlying signal score intact.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import json
from quality import number, parse_time, verified_delta, valid_quote, ET

CORE_TICKERS = ("SPY", "QQQ", "IWM", "SMH", "GLD", "XLF")


def f(value, default=0.0):
    try:
        if value is None or value == "":
            return default
        return number(value, default)
    except (TypeError, ValueError):
        return default


def sign(value, eps=0.02):
    value = f(value)
    if value > eps:
        return 1
    if value < -eps:
        return -1
    return 0


def favorable_move(direction, before, after):
    before, after = f(before), f(after)
    if not before:
        return 0.0
    if direction == "UP":
        return (after / before - 1.0) * 100.0
    if direction == "DOWN":
        return (before / after - 1.0) * 100.0 if after else 0.0
    return 0.0


def crossing(x, previous):
    """Return True when current price crosses the previous snapshot trigger."""
    if not previous:
        return False
    direction = x.get("direction", "")
    if previous.get("direction") and previous["direction"] != direction:
        return False
    price = f(x.get("price"))
    old_price = f(previous.get("price"))
    old_trigger = f(previous.get("trigger_price"))
    if not price or not old_price or not old_trigger:
        return False
    if direction == "UP":
        return old_price < old_trigger <= price
    if direction == "DOWN":
        return old_price > old_trigger >= price
    return False


def momentum_state(x, previous):
    if not previous:
        return "NO_BASELINE"
    cur5 = abs(f(x.get("move_5m")))
    old5 = abs(f(previous.get("move_5m")))
    cur_acc = f(x.get("volume_acceleration"))
    old_acc = f(previous.get("volume_acceleration"))
    favorable_now = sign(f(x.get("move_5m"))) == (1 if x.get("direction")=="UP" else -1 if x.get("direction")=="DOWN" else sign(f(x.get("day_move")))) and sign(f(x.get("move_5m"))) != 0
    favorable_old = sign(f(previous.get("move_5m"))) == (1 if previous.get("direction")=="UP" else -1 if previous.get("direction")=="DOWN" else sign(f(previous.get("day_move")))) and sign(f(previous.get("move_5m"))) != 0
    if favorable_now and (cur5 - old5 >= 0.20 or cur_acc - old_acc >= 0.20):
        return "ACCELERATING"
    if (old5 - cur5 >= 0.20 and old_acc - cur_acc >= 0.15) or (favorable_old and not favorable_now and cur5 < old5):
        return "DECAYING"
    return "STABLE"


def chase_risk(x):
    move5 = abs(f(x.get("move_5m")))
    vwap_dist = abs(f(x.get("vwap_distance_pct")))
    trigger = f(x.get("trigger_price"))
    price = f(x.get("price"))
    trigger_dist = abs(price / trigger - 1.0) * 100 if trigger else 0.0
    score = 0
    if move5 >= 1.0:
        score += 2
    elif move5 >= 0.60:
        score += 1
    if vwap_dist >= 1.50:
        score += 2
    elif vwap_dist >= 0.90:
        score += 1
    if trigger_dist >= 1.0:
        score += 2
    elif trigger_dist >= 0.60:
        score += 1
    if score >= 4:
        return "HIGH"
    if score >= 2:
        return "MODERATE"
    return "LOW"


def key_levels(x):
    price = f(x.get("price"))
    high = f(x.get("recent_high_15m"), price)
    low = f(x.get("recent_low_15m"), price)
    vwap = f(x.get("vwap"), price)
    trigger = f(x.get("trigger_price"), price)
    invalid = f(x.get("invalidation_price"), price)
    rng = max(0.01, high - low)
    direction = x.get("direction", "")
    if direction == "DOWN":
        support = min(low, trigger) if trigger else low
        resistance = max(vwap, invalid, high)
        target1 = max(0.01, trigger - rng * 0.50)
        target2 = max(0.01, trigger - rng * 1.00)
    else:
        resistance = max(high, trigger)
        support = min(vwap, invalid, low)
        target1 = trigger + rng * 0.50
        target2 = trigger + rng * 1.00
    return {
        "support_1": round(support, 2),
        "resistance_1": round(resistance, 2),
        "trigger": round(trigger, 2),
        "invalidation": round(invalid, 2),
        "target_1": round(target1, 2),
        "target_2": round(target2, 2),
        "range_15m": round(rng, 2),
    }


def classify_contract(o, stock_price):
    strike = f(o.get("strike"))
    price = f(stock_price)
    dist = abs(strike - price) / price * 100 if price else 999.0
    delta = abs(f(o.get("delta")))
    spread_pct = f(o.get("spread_pct"), 999.0)
    ask = f(o.get("ask"))
    if not verified_delta(o):
        role = "UNVERIFIED"
        risk = "UNKNOWN"
    elif dist <= 1.25 and delta >= 0.40 and spread_pct <= 18:
        role = "BALANCED"
        risk = "STANDARD FIT"
    elif dist <= 3.0 and delta >= 0.25 and spread_pct <= 30:
        role = "AGGRESSIVE"
        risk = "MODERATE"
    else:
        role = "DEEP OTM"
        risk = "HIGH"
    if ask < 0.10 or ask > 0.75:
        risk = "HIGH"
    bucket = "NEAR ATM" if dist <= 1.25 else "MODERATE OTM" if dist <= 3.0 else "FAR OTM"
    if (o.get("side") == "call" and strike < price) or (o.get("side") == "put" and strike > price):
        moneyness = "ITM"
    elif (o.get("side") == "call" and strike > price) or (o.get("side") == "put" and strike < price):
        moneyness = "OTM"
    else:
        moneyness = "ATM"
    out = dict(o)
    out.update({
        "distance_pct": round(dist, 2),
        "distance_bucket": bucket,
        "contract_role": role,
        "contract_risk": risk,
        "moneyness": moneyness,
    })
    return out


def contract_selection(x):
    contracts = list(x.get("preferred_contracts") or []) + list(x.get("usable_contracts") or [])
    seen = set()
    selected = []
    for o in contracts:
        key = o.get("contract_id") or (o.get("expiry"),o.get("side"), f(o.get("strike")))
        if key in seen:
            continue
        seen.add(key)
        if valid_quote(o) and verified_delta(o):
            selected.append(classify_contract(o, f(x.get("price"))))
    def rank(o):
        role_weight = {"BALANCED": 3, "AGGRESSIVE": 2, "DEEP OTM": 1}.get(o.get("contract_role"), 0)
        return (role_weight, f(o.get("contract_score")), f(o.get("volume")))
    selected.sort(key=rank, reverse=True)
    for i, o in enumerate(selected[:8], 1):
        o["selection_rank"] = i
    return selected


def market_regime(rows):
    by = {x.get("ticker"): x for x in rows}
    used = []
    for ticker in CORE_TICKERS:
        x = by.get(ticker)
        if not x:
            continue
        day = f(x.get("day_move"))
        m5 = f(x.get("move_5m"))
        m15 = f(x.get("recent_move"))
        score = (sign(day, 0.10) + sign(m5, 0.05) + sign(m15, 0.10)) / 3.0
        used.append({"ticker": ticker, "score": round(score, 3), "day_move": round(day, 2), "move_5m": round(m5, 2), "move_15m": round(m15, 2)})
    if not used:
        return {"label": "UNKNOWN", "score": 0.0, "volatility": "UNKNOWN", "components": []}
    score = sum(x["score"] for x in used) / len(used)
    avg_intraday = sum(abs(x["day_move"]) for x in used) / len(used)
    avg_5m = sum(abs(x["move_5m"]) for x in used) / len(used)
    if avg_5m >= 0.70 or avg_intraday >= 1.50:
        volatility = "HIGH"
    elif avg_5m >= 0.35 or avg_intraday >= 0.80:
        volatility = "ELEVATED"
    else:
        volatility = "NORMAL"
    if score >= 0.45:
        label = "BULLISH"
    elif score <= -0.45:
        label = "BEARISH"
    else:
        label = "NEUTRAL"
    return {"label": label, "score": round(score, 3), "volatility": volatility, "components": used}


def execution_state(x, previous):
    if x.get('price_freshness') not in (None,'RECENT'):
        return 'DATA UNAVAILABLE',False
    crossed=crossing(x,previous) and bool(x.get('direction_confirmed'))
    confirmation=bool(x.get('momentum_confirmed') or x.get('acceleration_confirmed'))
    strong=x.get('execution_readiness')=='VERIFIED_DELAYED'
    # Fail closed for old/inconsistent snapshots; preserve a trigger-only event.
    qualified=x.get('setup_qualified') is True
    state='CONFIRMED' if crossed and strong and confirmation and qualified else 'TRIGGERED' if crossed else 'SECOND-WAVE' if x.get('second_wave_event') else 'WATCH' if x.get('setup_bucket')!='PASS' else 'PASS'
    if state in ('CONFIRMED','TRIGGERED') and x.get('momentum_state')=='DECAYING': state='DECAYING'
    return state,crossed

def comparable(data, previous):
    a,b=parse_time(data.get('generated_at')),parse_time(previous.get('generated_at'))
    return bool(a and b and a.astimezone(ET).date()==b.astimezone(ET).date() and 0<(a-b).total_seconds()<=900)


def enrich(data, previous=None):
    rows = data.get("candidates", [])
    previous = previous if comparable(data, previous or {}) else {}
    prev_by = {x.get("ticker"): x for x in previous.get("candidates", [])}
    regime = market_regime(rows)
    transitions = []
    trigger_events = []
    decay = []
    chase = []
    feedback_events = []

    for x in rows:
        ticker = x.get("ticker")
        old = prev_by.get(ticker)
        x["market_alignment"] = (
            "ALIGNED" if ((regime["label"] == "BULLISH" and x.get("direction") == "UP") or
                           (regime["label"] == "BEARISH" and x.get("direction") == "DOWN"))
            else "COUNTERTREND" if regime["label"] in ("BULLISH", "BEARISH") else "NEUTRAL"
        )
        x["momentum_state"] = momentum_state(x, old)
        fresh_bar=bool(old and x.get('bar_timestamp') and x.get('bar_timestamp')!=old.get('bar_timestamp'))
        qualified=bool(x.get('setup_qualified'))
        affordable=bool(x.get('preferred_contracts'))
        reason=None
        if old and fresh_bar and qualified:
            if x.get('direction')!=old.get('direction'): reason='DIRECTION_CHANGE'
            elif not old.get('setup_qualified'): reason='NEW_QUALIFICATION'
            elif x['momentum_state']=='ACCELERATING' and old.get('momentum_state')!='ACCELERATING': reason='NEW_ACCELERATION'
            elif crossing(x,old): reason='TRIGGER_BREAK'
        if old and qualified and affordable and not old.get('had_preferred_contract'):
            reason=reason or 'CONTRACT_NOW_IN_BUDGET'
        x['second_wave_event']=reason
        if reason: x['setup_bucket']='SECOND-WAVE'
        same_direction=old and old.get('direction')==x.get('direction')
        old_volumes=(old or {}).get('contract_volumes',{})
        current_volumes={o['contract_id']:{'side':o['side'],'volume':o.get('volume',0)} for o in x.get('options',[]) if o.get('contract_id')}
        same_source=old and old.get('option_source')==x.get('option_source')
        pairs=[(v,old_volumes[k]) for k,v in current_volumes.items() if k in old_volumes] if same_source else []
        valid_pairs=bool(pairs) and all(v['volume']>=p['volume'] for v,p in pairs)
        for side in ('call','put'):
            x['option_interval_'+side+'_volume']=sum(v['volume']-p['volume'] for v,p in pairs if v['side']==side) if valid_pairs else None
        x['interval_volume_coverage']=len(pairs) if valid_pairs else 0
        x["chase_risk"] = chase_risk(x)
        levels = key_levels(x)
        x["key_levels"] = levels
        x.update({f"level_{k}": v for k, v in levels.items()})
        selected = contract_selection(x)
        x["contract_selection"] = selected
        x["distance_to_strike_warning"] = (
            "NEAR ATM" if any(o.get("distance_pct", 99) <= 1.25 for o in selected[:3]) else
            "MODERATE OTM" if any(o.get("distance_pct", 99) <= 3.0 for o in selected[:3]) else
            "FAR OTM / HIGH LEVERAGE"
        )
        state, crossed = execution_state(x, old)
        x["execution_state"] = state
        x["trigger_crossed"] = crossed
        if old and old.get("execution_state") != state:
            transitions.append({"ticker": ticker, "from": old.get("execution_state"), "to": state, "price": x.get("price")})
        if crossed:
            trigger_events.append(ticker)
        if x["momentum_state"] == "DECAYING":
            decay.append(ticker)
        if x["chase_risk"] == "HIGH":
            chase.append(ticker)
        if old and same_direction and old.get("execution_state") in ("TRIGGERED", "CONFIRMED"):
            move = favorable_move(x.get("direction"), old.get("price"), x.get("price"))
            feedback_events.append({
                "ticker": ticker,
                "prior_state": old.get("execution_state"),
                "next_scan_favorable_move_pct": round(move, 3),
            })

    data["market_regime"] = regime
    data["execution_layer"] = {
        "state_order": ["PASS", "SECOND-WAVE", "WATCH", "TRIGGERED", "CONFIRMED", "DECAYING"],
        "new_triggers": trigger_events,
        "state_transitions": transitions[:50],
        "momentum_decay": decay,
        "high_chase": chase,
        "contract_selection_policy": "Balanced near-ATM first; aggressive moderate-OTM second; far-OTM is explicitly high leverage.",
    }
    data["session_feedback"] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "prior_snapshot": previous.get("generated_at"),
        "transition_count": len(transitions),
        "trigger_count": len(trigger_events),
        "decay_count": len(decay),
        "high_chase_count": len(chase),
        "feedback_events": feedback_events[:50],
        "rules_to_review": [
            "Review triggered setups that immediately entered DECAYING.",
            "Review HIGH chase-risk candidates before treating them as fresh entries.",
            "Compare next-scan favorable movement by execution state to refine thresholds over time.",
        ],
    }
    data["schema_version"] = 7
    return data


def contract_evidence(candidate):
    """Bounded filter-selected sample, including candidates without entry signals."""
    rows = []; seen = set()
    for option in candidate.get('preferred_contracts', [])[:3] + candidate.get('options', [])[:3]:
        cid = option.get('contract_id')
        if not cid or cid in seen:
            continue
        seen.add(cid)
        fields = ('contract_id', 'expiry', 'side', 'strike', 'bid', 'ask', 'spread', 'spread_pct',
                  'delta', 'theta', 'theta_available', 'volume', 'source', 'option_timestamp',
                  'payload_timestamp', 'received_at', 'last_trade_time', 'timestamp_basis',
                  'minimum_delay_minutes', 'rejection_reasons')
        rows.append({key: option.get(key) for key in fields})
    return {'selection': 'Up to three preferred plus first three returned contracts; filter-selected, not full-chain coverage',
            'contracts': rows}


def update_history(data, path="data/scan-history.json", limit=200):
    p = Path(path)
    try:
        history = json.loads(p.read_text()) if p.exists() else []
        if not isinstance(history, list):
            history = []
    except Exception:
        history = []
    history.append({
        "generated_at": data.get("generated_at"),
        "dashboard_generated_at": data.get("dashboard_generated_at"),
        "scan_mode": data.get("scan_mode"),
        "market_session": data.get("market_session"),
        "scan_id": data.get("scan_id"),
        "market_regime": data.get("market_regime"),
        "counts": {
            "candidates": len(data.get("candidates", [])),
            "confirmed": sum(x.get("execution_state") == "CONFIRMED" for x in data.get("candidates", [])),
            "triggered": sum(x.get("execution_state") == "TRIGGERED" for x in data.get("candidates", [])),
            "second_wave": sum(x.get("execution_state") == "SECOND-WAVE" for x in data.get("candidates", [])),
            "decaying": sum(x.get("execution_state") == "DECAYING" for x in data.get("candidates", [])),
        },
        "feedback": data.get("session_feedback", {}),
        "candidate_state": [
            {
                "ticker": x.get("ticker"),
                "price": x.get("price"),
                "rank": rank,
                "score": x.get("score"),
                "previous_close": x.get("previous_close"),
                "previous_close_source": x.get("previous_close_source"),
                "previous_close_date": x.get("previous_close_date"),
                "volume_ratio": x.get("volume_ratio"),
                "vwap": x.get("vwap"),
                "price_freshness": x.get("price_freshness"),
                "trend_context": x.get("trend_context"),
                "trigger_price": x.get("trigger_price"),
                "direction": x.get("direction"),
                "move_5m": x.get("move_5m"),
                "recent_move": x.get("recent_move"),
                "move_30m": x.get("move_30m"),
                "move_60m": x.get("move_60m"),
                "invalidation_price": x.get("invalidation_price"),
                "chase_risk": x.get("chase_risk"),
                "second_wave_event": x.get("second_wave_event"),
                "day_move": x.get("day_move"),
                "volume_acceleration": x.get("volume_acceleration"),
                "execution_state": x.get("execution_state"),
                "bar_timestamp": x.get("bar_timestamp"),
                "bar_end": x.get("bar_end"),
                "last_status": x.get("last_status"),
                "contract_evidence": contract_evidence(x),
                "setup_qualified": x.get("setup_qualified"),
                "qualification_checks": x.get("qualification_checks"),
                "pattern_research": x.get("pattern_research"),
                "relative_volume_research": x.get("relative_volume_research"),
                "early_watch": x.get("early_watch"),
                "qualification_reasons": x.get("qualification_reasons"),
                "momentum_state": x.get("momentum_state"),
                "had_preferred_contract": bool(x.get("preferred_contracts")),
                "chain_status": x.get("chain_status"),
                "chain_attempted": x.get("chain_attempted"),
                "contract_count": len(x.get("options", [])),
                "eligible_contract_count": len(x.get("eligible_contracts", [])),
                "preferred_contract_count": len(x.get("preferred_contracts", [])),
                "default_price_rejection_count": sum(o.get("preferred_price") is False for o in x.get("options", [])),
                "contract_rejections": {reason: sum(reason in o.get("rejection_reasons", []) for o in x.get("options", []))
                                        for reason in sorted({reason for o in x.get("options", []) for reason in o.get("rejection_reasons", [])})},
                "option_source": x.get("option_source"),
                "contract_volumes": {o['contract_id']:{'side':o['side'],'volume':o.get('volume',0)} for o in x.get('options',[]) if o.get('contract_id')},
                "option_call_volume": x.get("option_call_volume"),
                "option_put_volume": x.get("option_put_volume"),
            }
            for rank, x in enumerate(data.get("candidates", []), 1)
        ],
    })
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(history[-limit:], separators=(",", ":")))
