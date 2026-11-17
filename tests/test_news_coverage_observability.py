"""News coverage statuses are evidence, not eligibility or ranking inputs."""
import unittest
from unittest.mock import patch

import scanner


class NewsCoverageObservabilityTests(unittest.TestCase):
    def setUp(self):
        scanner.ERRORS.clear()

    def tearDown(self):
        scanner.ERRORS.clear()

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

    def test_other_stage_error_does_not_mark_news_failed(self):
        scanner.record_error('TEST', 'price_scan', RuntimeError('unavailable'))
        candidate = {'ticker': 'TEST'}
        with patch.object(scanner, 'news', return_value=[]):
            scanner.add_news([candidate])
        self.assertEqual(candidate['news_status'], 'SUCCESS')


if __name__ == '__main__':
    unittest.main()
