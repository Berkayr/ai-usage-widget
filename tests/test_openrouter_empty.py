"""Fictional OpenRouter balance responses; no credentials or network required."""
import unittest
from unittest.mock import patch
from quotacore.providers import openrouter

class OpenRouterEmptyTests(unittest.TestCase):
    def read(self, key_data, credits_data, credits_state=None):
        with patch.object(openrouter, 'api_key', return_value='fictional'), patch.object(openrouter, 'get_json', side_effect=[({'data': key_data}, None, None, None), ({'data': credits_data}, credits_state, None, None)]):
            return openrouter.read()

    def test_numeric_values_missing_is_explicit_and_not_zero(self):
        for values in ({'usage': None, 'limit': None}, {'limit_remaining': 'unknown'}):
            result = self.read(values, {})
            self.assertEqual(result['state'], 'OK')
            self.assertEqual(result['meters'], [])
            self.assertIn('No numeric balance values', result['error'])

    def test_optional_credits_unavailable_retains_empty_explanation(self):
        result = self.read({'usage': None}, {}, 'AUTH_REQUIRED')
        self.assertEqual(result['meters'], [])
        self.assertIn('No numeric balance values', result['error'])

    def test_zero_credit_is_data(self):
        result = self.read({'usage': None}, {'total_credits': 0, 'total_usage': 0})
        self.assertEqual(result['meters'][0]['remaining'], 0)
        self.assertIsNone(result['error'])

    def test_key_usage_zero_and_credit_fallback(self):
        result = self.read({'usage': 0, 'limit': None}, {})
        self.assertEqual(result['meters'][0]['used'], 0)
        self.assertIsNone(result['error'])
        result = self.read({'usage': None}, {'total_credits': 9, 'total_usage': 2})
        self.assertEqual(result['meters'][0]['remaining'], 7)
