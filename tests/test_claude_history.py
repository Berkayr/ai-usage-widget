import json
import os
import sys
import tempfile
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

from quotacore.local_history import claude_history
from quotacore.paths import load_config
from quotacore.providers import claude


class ClaudeHistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "projects"
        self.root.mkdir()

    def add(self, filename, rows):
        path = self.root / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(json.dumps(row) for row in rows), encoding="utf-8")
        return path

    def row(self, mid="m1", rid="r1", *, stamp="2026-11-09T10:00:00Z", model="claude-opus-5-5", usage=None, typ="assistant"):
        return {"type": typ, "timestamp": stamp, "requestId": rid,
                "message": {"id": mid, "model": model, "usage": usage or {"input_tokens": 100, "output_tokens": 20,
                "cache_read_input_tokens": 10, "cache_creation_input_tokens": 30}}}

    def test_deduplicates_across_files_and_stream_repeats_filters_synthetic(self):
        row = self.row()
        self.add("a.jsonl", [row, row, self.row("s", "s", model="<synthetic>"), self.row("u", "u", typ="user")])
        self.add("nested/b.jsonl", [row])
        result = claude_history(datetime(2026, 11, 9, 12, tzinfo=timezone.utc), self.root)
        self.assertEqual(result["totals"]["tokens"], 160)

    def test_cost_cache_tiers_fast_and_unknown(self):
        usage = {"input_tokens": 1_000_000, "output_tokens": 0, "cache_read_input_tokens": 0,
                 "cache_creation_input_tokens": 3_000_000,
                 "cache_creation": {"ephemeral_5m_input_tokens": 1_000_000, "ephemeral_1h_input_tokens": 2_000_000}, "speed": "fast"}
        self.add("a.jsonl", [self.row(usage=usage), self.row("u", "u", model="unknown-model", usage={"input_tokens": 7})])
        result = claude_history(datetime(2026, 11, 9, 12, tzinfo=timezone.utc), self.root)
        self.assertAlmostEqual(result["totals"]["cost"], 50.0)
        self.assertEqual(result["totals"]["unpriced_tokens"], 7)
        self.assertIsNone(next(m["cost"] for m in result["models"] if m["model"] == "unknown-model"))

    def test_window_is_30_local_calendar_days_including_today(self):
        old_tz = os.environ.get("TZ")
        os.environ["TZ"] = "Europe/Warsaw"
        time.tzset()
        self.addCleanup(self._restore_tz, old_tz)
        rows = [
            self.row("inside", "inside", stamp="2026-10-11T00:01:00+02:00"),
            self.row("outside", "outside", stamp="2026-10-10T23:59:00+02:00"),
        ]
        path = self.add("a.jsonl", rows)
        mtime = datetime(2026, 11, 9, 12, tzinfo=timezone.utc).timestamp()
        os.utime(path, (mtime, mtime))
        result = claude_history(datetime(2026, 11, 9, 12, tzinfo=timezone.utc), self.root)
        self.assertEqual([item["date"] for item in result["daily"]], ["2026-10-11"])
        self.assertLessEqual(len(result["daily"]), 30)

    def test_bad_lines_old_messages_local_heatmap_and_privacy(self):
        old_tz = os.environ.get("TZ")
        os.environ["TZ"] = "Europe/Warsaw"
        time.tzset()
        self.addCleanup(self._restore_tz, old_tz)
        self.add("a.jsonl", [self.row(stamp="2026-11-08T23:00:00-05:00"), {"oops": True}])
        path = self.root / "a.jsonl"
        with path.open("a", encoding="utf-8") as handle:
            handle.write("{bad json\n")
            handle.write(json.dumps(self.row("old", "old", stamp="2026-10-09T00:00:00Z")) + "\n")
        result = claude_history(datetime(2026, 11, 9, 12, tzinfo=timezone.utc), self.root)
        self.assertEqual(sum(map(sum, result["heatmap"])), 160)
        self.assertEqual(result["heatmap"][0][5], 160)
        self.assertNotIn(str(self.root), json.dumps(result))
        self.assertNotIn("cwd", json.dumps(result))

    def test_streaming_repeat_keeps_final_output_in_any_order(self):
        partial = self.row(usage={"input_tokens": 100, "output_tokens": 3, "cache_read_input_tokens": 10, "cache_creation_input_tokens": 30})
        final = self.row(usage={"input_tokens": 100, "output_tokens": 400, "cache_read_input_tokens": 10, "cache_creation_input_tokens": 30})
        for rows in ([partial, final, partial], [final, partial]):
            self.add("a.jsonl", rows)
            result = claude_history(datetime(2026, 11, 9, 12, tzinfo=timezone.utc), self.root)
            self.assertEqual(result["totals"]["tokens"], 540)

    def test_undecodable_file_does_not_hide_other_files(self):
        self.add("a.jsonl", [self.row()])
        (self.root / "b.jsonl").write_bytes(b'\xff\xfe"usage" \xff\n')
        result = claude_history(datetime(2026, 11, 9, 12, tzinfo=timezone.utc), self.root)
        self.assertIsNotNone(result)
        self.assertEqual(result["totals"]["tokens"], 160)

    def test_today_hourly_uses_local_date_deduplicates_and_excludes_future(self):
        old_tz = os.environ.get("TZ")
        os.environ["TZ"] = "Europe/Warsaw"
        time.tzset()
        self.addCleanup(self._restore_tz, old_tz)
        today = self.row("today", "today", stamp="2026-11-08T23:30:00Z")
        self.add("hours.jsonl", [today, today,
                 self.row("prior", "prior", stamp="2026-11-08T22:30:00Z"),
                 self.row("later", "later", stamp="2026-11-09T12:01:00Z")])
        result = claude_history(datetime(2026, 11, 9, 12, tzinfo=timezone.utc), self.root)
        self.assertEqual(len(result["today_hourly"]), 24)
        self.assertEqual(result["today_hourly"][0], 160)
        self.assertEqual(sum(result["today_hourly"]), 160)
        self.assertEqual(result["totals"]["tokens"], 320)
        previous = claude_history(datetime(2026, 11, 10, 12, tzinfo=timezone.utc), self.root)
        self.assertEqual(previous["today_hourly"], [0] * 24)

    def test_machine_breakdown_and_private_cwd(self):
        rows = [
            {**self.row("w", "w"), "cwd": r"C:\\Users\\example\\project"},
            {**self.row("l", "l"), "cwd": "/home/example/project"},
            {**self.row("m", "m"), "cwd": "/Users/example/project"},
            self.row("u", "u"),
            {**self.row("x", "x"), "cwd": "relative/path"},
        ]
        self.add("machines.jsonl", rows)
        result = claude_history(datetime(2026, 11, 9, 12, tzinfo=timezone.utc), self.root)
        self.assertEqual({item["id"]: item["tokens"] for item in result["machines"]},
                         {"windows": 160, "linux": 160, "macos": 160, "unknown": 320})
        self.assertEqual(sum(item["tokens"] for item in result["machines"]), result["totals"]["tokens"])
        self.assertEqual(sum(item["by_machine"].get("windows", 0) for item in result["daily"]), 160)
        self.assertEqual(result["this_machine"], "linux")
        rendered = json.dumps(result)
        for path in (r"C:\\Users\\example", "/home/example", "/Users/example", "cwd"):
            self.assertNotIn(path, rendered)

    def test_skips_hidden_project_directories(self):
        self.add(".stversions/old.jsonl", [self.row()])
        self.add("visible.jsonl", [self.row("visible", "visible")])
        result = claude_history(datetime(2026, 11, 9, 12, tzinfo=timezone.utc), self.root)
        self.assertEqual(result["totals"]["tokens"], 160)

    def _restore_tz(self, old_tz):
        if old_tz is None:
            os.environ.pop("TZ", None)
        else:
            os.environ["TZ"] = old_tz
        time.tzset()

    def test_disabled_does_not_read_logs_and_enabled_reuses_recent_history(self):
        config_root = Path(self.temp.name) / "config"
        config_root.mkdir()
        with mock.patch.dict(os.environ, QUOTACORE_HOME=str(config_root)):
            cfg = load_config()
            self.assertFalse(cfg["providers"]["claude"].get("local_history", False))
            with (mock.patch("quotacore.local_history.claude_history", side_effect=AssertionError("read logs")),
                  mock.patch.object(claude, "detect", return_value=False)):
                claude.read()
            cfg["providers"]["claude"]["local_history"] = True
            (config_root / "config.json").write_text(json.dumps(cfg), encoding="utf-8")
            prior = {"history": {"computed_at": datetime.now(timezone.utc).isoformat(), "daily": []}}
            with mock.patch.object(claude, "detect", return_value=False):
                result = claude.read(prior)
            self.assertIs(result["history"], prior["history"])


class HistoryConsentCommandTests(unittest.TestCase):
    def test_permission_command_preserves_other_config_and_can_disable(self):
        from quotacore.__main__ import main
        from quotacore.paths import atomic_json, config_dir
        with tempfile.TemporaryDirectory() as root, mock.patch.dict(os.environ, {"QUOTACORE_HOME": root}):
            config = load_config()
            config["providers"]["codex"]["enabled"] = True
            atomic_json(config_dir() / "config.json", config)
            with mock.patch.object(sys, "argv", ["quotacore", "local-history", "on"]):
                main()
            self.assertTrue(load_config()["providers"]["claude"]["local_history"])
            self.assertTrue(load_config()["providers"]["codex"]["enabled"])
            with mock.patch.object(sys, "argv", ["quotacore", "local-history", "off"]):
                main()
            self.assertFalse(load_config()["providers"]["claude"].get("local_history", False))


if __name__ == "__main__":
    unittest.main()
