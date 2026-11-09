import json
import os
import tempfile
import unittest
from unittest import mock
from quotacore import hooks
from quotacore.paths import data_path
from quotacore.providers import claude


class ClaudeZeroObservationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = mock.patch.dict(os.environ, QUOTACORE_HOME=self.temp.name)
        self.env.start()
        self.addCleanup(self.env.stop)

    def ingest(self, limits):
        payload = json.dumps({"rate_limits": limits})
        with mock.patch("sys.stdin", mock.Mock(read=lambda _: payload)):
            self.assertEqual(hooks.run_hook("claude"), 0)
        return claude._read_observation()[0]

    def test_zero_and_positive_windows_round_trip(self):
        value = self.ingest({"five_hour": {"used_percentage": 0}, "seven_day": {"used_percentage": 34}})
        self.assertEqual([w["used_percent"] for w in value["windows"]], [0.0, 34.0])

    def test_two_zeros_replace_prior_positive_observation(self):
        path = data_path("claude-observation.json")
        self.ingest({"five_hour": {"used_percentage": 12}, "seven_day": {"used_percentage": 45}})
        self.ingest({"five_hour": {"used_percentage": 0}, "seven_day": {"used_percentage": 0}})
        self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["five"], 0)
        self.assertEqual([w["used_percent"] for w in claude._read_observation()[0]["windows"]], [0.0, 0.0])

    def test_invalid_values_are_not_zero_measurements(self):
        for value in (None, False, "5", -1, 101):
            result = hooks._claude({"rate_limits": {"five_hour": {"used_percentage": value}}})
            self.assertIsNone(result, repr(value))

    def test_old_zero_observation_is_ignored(self):
        path = data_path("old.json")
        path.write_text(json.dumps({"epoch": 1, "five": 0, "seven": 0}), encoding="utf-8")
        with mock.patch.dict(os.environ, QUOTACORE_CLAUDE_OBSERVATION=str(path)):
            self.assertIsNone(claude._read_observation()[0])


if __name__ == "__main__":
    unittest.main()
