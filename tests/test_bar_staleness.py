import json
import os
import tempfile
import unittest
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from unittest import mock
from quotacore.bar import render, report
from quotacore.paths import data_path


class BarSnapshotStalenessTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2030, 1, 1, tzinfo=timezone.utc)
        self.snapshot = {"generated_at": self.now.isoformat(), "providers": [{"id": "claude", "state": "OK", "windows": [{"kind": "session", "label": "Session", "used_percent": 34}]}]}

    def test_age_threshold_and_input_immutability(self):
        original = deepcopy(self.snapshot)
        for minutes, expected in ((5, False), (10, False), (11, True)):
            value = deepcopy(self.snapshot)
            value["generated_at"] = (self.now - timedelta(minutes=minutes)).isoformat()
            result = report(value, ["claude"], now=self.now)
            self.assertEqual(result["providers"][0]["stale"], expected)
            self.assertEqual(result["providers"][0]["state"], "STALE" if expected else "OK")
            self.assertIn("34%", result["text"])
            self.assertEqual(value, {**original, "generated_at": value["generated_at"]})
            self.assertEqual("[stale]" in result["text"], expected)

    def test_invalid_missing_and_future_timestamps_are_safe(self):
        for stamp in (None, "bad", (self.now + timedelta(minutes=1)).isoformat()):
            value = deepcopy(self.snapshot)
            if stamp is None:
                value.pop("generated_at")
            else:
                value["generated_at"] = stamp
            self.assertEqual(report(value, ["claude"], now=self.now)["providers"][0]["state"], "OK")
        value = deepcopy(self.snapshot)
        value["generated_at"] = (self.now - timedelta(minutes=11)).isoformat()
        value["providers"].append({"id": "codex", "state": "AUTH_REQUIRED", "windows": []})
        result = report(value, ["claude", "codex"], now=self.now)
        self.assertEqual(result["providers"][1]["state"], "AUTH_REQUIRED")

    def test_render_reads_stale_snapshot(self):
        with tempfile.TemporaryDirectory() as home, mock.patch.dict(os.environ, QUOTACORE_HOME=home):
            self.snapshot["generated_at"] = (datetime.now(timezone.utc) - timedelta(minutes=11)).isoformat()
            data_path("snapshot.json").write_text(json.dumps(self.snapshot), encoding="utf-8")
            result = json.loads(render("json"))
            self.assertIn("[stale]", result["text"])
            self.assertTrue(result["providers"][0]["stale"])
            self.assertEqual(result["providers"][0]["state"], "STALE")
            waybar = json.loads(render("waybar"))
            self.assertIn("[stale]", waybar["text"])


if __name__ == "__main__":
    unittest.main()
