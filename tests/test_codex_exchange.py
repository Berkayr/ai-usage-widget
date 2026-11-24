import json
import sys
import unittest
from unittest import mock

from quotacore.providers import codex

SERVER = """
import json, sys
for line in sys.stdin:
    if json.loads(line).get("id") == 3:
        break
for message in json.loads(sys.argv[1]):
    print(json.dumps(message), flush=True)
"""
LIMITS = {"id": 2, "result": {"rateLimits": {"primary": {"usedPercent": 5}}}}
USAGE = {"id": 3, "result": {"summary": {}}}


class ExchangeOrder(unittest.TestCase):
    def exchange(self, *messages):
        with mock.patch.object(codex, "_executable", return_value="codex"), \
             mock.patch.object(codex, "_command", return_value=[sys.executable, "-c", SERVER, json.dumps(messages)]):
            return codex._exchange(timeout=10)

    def test_usage_before_limits(self):
        self.assertEqual(self.exchange(USAGE, LIMITS), (LIMITS["result"], USAGE["result"]))

    def test_limits_before_usage(self):
        self.assertEqual(self.exchange(LIMITS, USAGE), (LIMITS["result"], USAGE["result"]))

    def test_server_exits_without_limits(self):
        with self.assertRaises(RuntimeError):
            self.exchange(USAGE)

    def test_server_exits_without_usage(self):
        self.assertEqual(self.exchange(LIMITS), (LIMITS["result"], None))


if __name__ == "__main__":
    unittest.main()
