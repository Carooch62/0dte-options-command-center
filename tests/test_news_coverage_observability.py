"""News coverage statuses are evidence, not eligibility or ranking inputs."""
import unittest
from unittest.mock import patch

import scanner


class NewsCoverageObservabilityTests(unittest.TestCase):
    def setUp(self):
        scanner.ERRORS.clear()

    def tearDown(self):
        scanner.ERRORS.clear()

    def test_original_publication_and_retrieval_clocks_are_preserved(self):
        from datetime import datetime
        import time
        published=int(time.time())-60
        candidate={'ticker':'TEST'}
        with patch.object(scanner,'news',return_value=[{'title':'Test catalyst','publisher':'Original publisher','link':'https://example.com/article','providerPublishTime':published,'relatedTickers':['TEST']}]):
            scanner.add_news([candidate])
        item=candidate['news_items'][0]
        self.assertEqual(datetime.fromisoformat(item['published_at']).timestamp(),published)
        self.assertGreaterEqual(datetime.fromisoformat(item['retrieved_at']).timestamp(),published)
        self.assertEqual(item['url'],'https://example.com/article')
        self.assertEqual(item['publisher'],'Original publisher')

    def test_empty_success_is_distinct_from_unsearched(self):
        searched = {'ticker': 'TEST'}
        unsearched = {'ticker': 'OTHER', 'news_status': 'NOT_SCANNED'}
        with patch.object(scanner, 'news', return_value=[]):
            scanner.add_news([searched])
        self.assertEqual(searched['news_status'], 'SUCCESS')
        self.assertEqual(searched['news_items'], [])
        self.assertIsNotNone(searched['news_checked_at'])
        self.assertEqual(unsearched['news_status'], 'NOT_SCANNED')
        self.assertNotIn('news_checked_at', unsearched)

    def test_source_failure_is_not_reported_as_empty_success(self):
        candidate = {'ticker': 'TEST'}
        def failed(ticker):
            scanner.record_error(ticker, 'news', RuntimeError('unavailable'))
            return []
        with patch.object(scanner, 'news', side_effect=failed):
            scanner.add_news([candidate])
        self.assertEqual(candidate['news_status'], 'SOURCE_FAILURE')
        self.assertEqual(candidate['news_items'], [])
        self.assertFalse(candidate['catalyst'])

    def test_malformed_provider_payload_is_source_failure(self):
        with patch.object(scanner, 'request_json', return_value={'news': ['invalid']}):
            self.assertEqual(scanner.news('TEST'), [])
        self.assertTrue(any(e['ticker'] == 'TEST' and e['stage'] == 'news' for e in scanner.ERRORS))

    def test_other_stage_error_does_not_mark_news_failed(self):
        scanner.record_error('TEST', 'price_scan', RuntimeError('unavailable'))
        candidate = {'ticker': 'TEST'}
        with patch.object(scanner, 'news', return_value=[]):
            scanner.add_news([candidate])
        self.assertEqual(candidate['news_status'], 'SUCCESS')


if __name__ == '__main__':
    unittest.main()

