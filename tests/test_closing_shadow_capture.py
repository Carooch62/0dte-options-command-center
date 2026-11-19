import json,tempfile,unittest
from pathlib import Path
from shadow_evidence import capture,packet
class CaptureTests(unittest.TestCase):
 def test_marker_clocks_and_repeat_are_safe(self):
  snapshot={'scan_id':'sample','market_session':'OPEN','generated_at':'2026-11-17T15:00:00Z','candidates':[{'ticker':'X','news_status':'NOT_SCANNED','secret':'excluded','options':[]}]}
  self.assertRaises(ValueError,packet,snapshot,'2026-11-17T14:00:00Z')
  with tempfile.TemporaryDirectory() as folder:
   p=Path(folder);(p/'market-dashboard.json').write_text(json.dumps(snapshot));(p/'staging-environment.json').write_text('{"environment":"staging"}')
   self.assertEqual(capture(p,'2026-11-17T15:01:00Z')['status'],'CAPTURED')
   before=(p/'shadow-evidence-latest.json').read_text()
   self.assertEqual(capture(p,'2026-11-17T15:02:00Z')['status'],'ALREADY_CAPTURED')
   self.assertEqual(before,(p/'shadow-evidence-latest.json').read_text());self.assertNotIn('secret',before)
   self.assertEqual(json.loads(before)['news_coverage'][0]['news_status'],'NOT_SCANNED')
   (p/'staging-environment.json').write_text('{"environment":"production"}')
   self.assertRaises(ValueError,capture,p)
 def test_news_probe_never_mutates_baseline_or_claims_earlier_availability(self):
  from shadow_evidence import compare_news
  snapshot={'scan_id':'one','generated_at':'2026-11-17T15:00:00Z','candidates':[{'ticker':'A','news_status':'SUCCESS'},{'ticker':'B','news_status':'NOT_SCANNED'}]}
  original=json.dumps(snapshot)
  def lookup(rows):
   for r in rows:r.update(news_status='SUCCESS',news_items=[],catalyst=False)
  report=compare_news(snapshot,lookup,'2026-11-17T15:05:00Z')
  self.assertEqual(report['baseline_searched'],1);self.assertEqual(report['probe_searched'],1);self.assertEqual(report['ranking_effect'],'NONE');self.assertEqual(json.dumps(snapshot),original)
