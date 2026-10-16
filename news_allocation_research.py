"""Offline allocation comparison; not imported by the scanner or dashboard."""
import json
from datetime import datetime
from pathlib import Path
from news_research import REFERENCE, evaluate

POLICIES = {'linear_2': (2.0, 2.0), 'linear_2_5': (2.5, 2.5),
            'capped_original': (15.0, 2.5)}


def compare(assessment):
    """Preserve abstention; all alternatives reserve at least 35.5% for patterns."""
    if assessment.get('status') != 'ASSESSED':
        return {name: None for name in POLICIES}
    importance = assessment.get('importance')
    if type(importance) not in (int, float) or not 0 <= importance <= 1:
        raise ValueError('Assessed importance must be finite and within [0, 1]')
    result = {}
    for name, (slope, cap) in POLICIES.items():
        news = round(40 + min(slope * importance, cap), 2)
        result[name] = {**REFERENCE, 'news': news, 'patterns': round(78-news, 2)}
    return result


def report():
    root = Path(__file__).parent
    case = json.loads((root/'tests/fixtures/news-emat-guidance.json').read_text())
    assessment = evaluate(case['row'], datetime.fromisoformat(case['evaluation_at']))
    return {'mode': 'OFFLINE_RESEARCH', 'production_effect': 'NONE',
            'real_case': {'ticker': 'EMAT', 'as_of': case['evaluation_at'],
                          'importance': assessment['importance'],
                          'original': {**REFERENCE, 'news': round(40+15*assessment['importance'],2), 'patterns': round(38-15*assessment['importance'],2)},
                          'current_shadow': assessment['proposed_weights'],
                          'alternatives': compare(assessment)},
            'synthetic_sensitivity': [
                {'importance': value, 'alternatives': compare({'status': 'ASSESSED', 'importance': value})}
                for value in (0, .1, .25, .5, .75, 1)],
            'limitations': ['No return or ranking backtest.',
                           'Ratings and decay remain experimental.',
                           'No alternative has been selected for live use.']}


if __name__ == '__main__':
    print(json.dumps(report(), indent=2))
