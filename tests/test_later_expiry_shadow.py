import json

from later_expiry_shadow import build_artifact, rotation_candidates


def test_rotation_only_uses_qualified_unattempted_rows_and_is_bounded():
    rows = [
        {"ticker": "AAA", "setup_qualified": True, "chain_attempted": False},
        {"ticker": "BBB", "setup_qualified": False, "chain_attempted": False},
        {"ticker": "CCC", "setup_qualified": True, "chain_attempted": True},
        {"ticker": "DDD", "setup_qualified": True, "chain_attempted": False},
    ]
    selected = rotation_candidates(rows, "scan-1", 1)
    assert len(selected) == 1
    assert selected[0]["ticker"] in {"AAA", "DDD"}
    assert rotation_candidates(rows, "scan-1", 100).__len__() == 2
    selected[0]["ticker"] = "CHANGED"
    assert rows[0]["ticker"] == "AAA"


def test_artifact_is_isolated_and_drops_private_fields():
    rows = [{"ticker": "AAA", "direction": "UP", "account_number": "private",
             "expiry_groups": {"week": {"chain_status": "SUCCESS", "eligible_contracts": [{
                 "contract_id": "AAA-1", "side": "call", "strike": 10, "expiry": "2026-11-20",
                 "dte": 7, "bid": .2, "ask": .22, "source": "CBOE delayed options",
                 "account_number": "private", "order_id": "private"}]}}}]
    artifact = build_artifact({"scan_id": "scan", "generated_at": "then"}, rows, "now")
    assert artifact["mode"] == "SHADOW_RESEARCH_ONLY"
    assert all(artifact[key] == "NONE" for key in ("ranking_effect", "eligibility_effect", "scoring_effect", "alert_effect"))
    encoded = json.dumps(artifact)
    assert "account_number" not in encoded
    assert "order_id" not in encoded
    assert artifact["candidates"][0]["contracts"][0]["contract_id"] == "AAA-1"
