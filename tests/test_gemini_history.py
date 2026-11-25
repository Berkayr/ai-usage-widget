import json
import os
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from quotacore.local_history import _gemini_messages, _newest_mtime, _window, claude_history, gemini_history
from quotacore.providers import gemini

NOW = datetime(2026, 11, 9, 12, tzinfo=timezone.utc)


def at(hours_ago):
    return int((NOW - timedelta(hours=hours_ago)).timestamp())


# Minimal protobuf encoder for fictional fixtures.
def varint(number):
    out = bytearray()
    while True:
        byte, number = number & 0x7F, number >> 7
        out.append(byte | 0x80 if number else byte)
        if not number:
            return bytes(out)


def field_varint(number, value):
    return varint(number << 3) + varint(value)


def field_bytes(number, data):
    return varint(number << 3 | 2) + varint(len(data)) + data


def gen_blob(step_ids, *, inp=0, out=0, write=0, read=0, thinking=0, packed=True, names=((21, b"fictional-model"),)):
    stats = field_varint(2, inp) + field_varint(3, out) + field_varint(4, write) + field_varint(5, read)
    if thinking:
        stats += field_varint(9, thinking) + field_varint(10, thinking)
    meta = field_bytes(4, stats) + b"".join(field_bytes(number, name) for number, name in names)
    ids = (field_bytes(2, b"".join(varint(i) for i in step_ids)) if packed
           else b"".join(field_varint(2, i) for i in step_ids))
    return field_bytes(1, meta) + ids


def step_blob(seconds=None):
    return b"" if seconds is None else field_bytes(1, field_varint(1, seconds))


def make_db(path, gens, steps):
    con = sqlite3.connect(path)
    try:
        con.execute("CREATE TABLE gen_metadata (idx INTEGER PRIMARY KEY, data BLOB)")
        con.execute("CREATE TABLE steps (idx INTEGER PRIMARY KEY, metadata BLOB)")
        con.executemany("INSERT INTO gen_metadata VALUES (?, ?)", list(enumerate(gens, 1)))
        con.executemany("INSERT INTO steps VALUES (?, ?)", list(steps.items()))
        con.commit()
    finally:
        con.close()


GOOD = dict(inp=100, out=20, read=10, write=30)  # 160 tokens


class GeminiHistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "conversations"
        self.root.mkdir()

    def touch(self, path, when=NOW):
        os.utime(path, (when.timestamp(), when.timestamp()))
        return path

    def add(self, name, gens, steps, mtime=NOW):
        path = self.root / name
        make_db(path, gens, steps)
        return self.touch(path, mtime)

    def history(self):
        return gemini_history(NOW, self.root)

    def messages(self):
        now, cutoff = _window(NOW)
        return _gemini_messages(now, cutoff, self.root)

    def test_thinking_tokens_are_not_added_again(self):
        self.add("a.db", [gen_blob([1], thinking=7, **GOOD)], {1: step_blob(at(1))})
        result = self.history()
        self.assertEqual(result["totals"]["tokens"], 160)
        self.assertEqual(result["daily"][0]["output"], 20)
        self.assertEqual(result["daily"][0]["date"], datetime.fromtimestamp(at(1)).date().isoformat())

    def test_packed_and_unpacked_step_ids(self):
        self.add("a.db", [gen_blob([1, 2], packed=True, **GOOD), gen_blob([3, 4], packed=False, **GOOD)],
                 {1: step_blob(), 2: step_blob(at(2)), 3: step_blob(), 4: step_blob(at(1))})
        messages, stats = self.messages()
        self.assertEqual(len(messages), 2)
        self.assertEqual(stats["undated"], 0)
        self.assertEqual(self.history()["totals"]["tokens"], 320)

    def test_missing_timestamp_uses_previous_generation_or_is_counted_undated(self):
        self.add("a.db", [gen_blob([1], **GOOD), gen_blob([2], **GOOD)], {1: step_blob(at(5)), 2: step_blob()})
        self.add("b.db", [gen_blob([9], **GOOD), gen_blob([10], **GOOD)], {9: step_blob(), 10: step_blob(at(4))})
        messages, stats = self.messages()
        self.assertEqual(len(messages), 3)
        self.assertEqual(stats["undated"], 1)
        borrowed = [m for m in messages if m[0] == datetime.fromtimestamp(at(5), timezone.utc)]
        self.assertEqual(len(borrowed), 2)

    def test_malformed_rows_are_skipped_and_counted(self):
        bad = [b"\xff\xff\xff\xff", varint(1 << 3 | 2) + varint(50) + b"ab", varint(1 << 3 | 3)]
        self.add("a.db", [gen_blob([1], **GOOD), *bad, gen_blob([2, 3], **GOOD)],
                 {1: step_blob(at(2)), 2: b"\x80", 3: step_blob(at(1))})
        messages, stats = self.messages()
        self.assertEqual((stats["gen_rows"], stats["parsed"], stats["malformed"]), (5, 2, 4))
        self.assertEqual(sum(m[3] + m[4] + m[5] + m[6] for m in messages), 320)

    def test_corrupt_and_tableless_databases_do_not_hide_good_ones(self):
        self.add("good.db", [gen_blob([1], **GOOD)], {1: step_blob(at(1))})
        self.touch(self.root / "bad.db") if (self.root / "bad.db").write_bytes(b"x" * 4096) else None
        con = sqlite3.connect(self.root / "other.db")
        con.execute("CREATE TABLE other (x)")
        con.commit()
        con.close()
        self.touch(self.root / "other.db")
        _, stats = self.messages()
        self.assertEqual(stats["files_skipped"], 2)
        self.assertEqual(self.history()["totals"]["tokens"], 160)

    def test_model_name_rules(self):
        names = [[(21, b"model-a")], [(21, b"x" * 81), (19, b"model-b")],
                 [(21, b"\xff\xfe"), (19, b"bad\x01name")], []]
        gens = [gen_blob([i + 1], inp=10, names=value) for i, value in enumerate(names)]
        self.add("a.db", gens, {i + 1: step_blob(at(1)) for i in range(4)})
        models = {m["model"]: m["tokens"] for m in self.history()["models"]}
        self.assertEqual(models, {"model-a": 10, "model-b": 10, "unknown": 20})

    def test_source_database_is_not_modified(self):
        path = self.add("a.db", [gen_blob([1], **GOOD)], {1: step_blob(at(1))})
        before, listing = path.read_bytes(), sorted(os.listdir(self.root))
        self.assertIsNotNone(self.history())
        self.assertEqual(path.read_bytes(), before)
        self.assertEqual(sorted(os.listdir(self.root)), listing)

    def test_wal_database_leaves_no_side_files_and_live_wal_is_read(self):
        path = self.add("a.db", [gen_blob([1], **GOOD)], {1: step_blob(at(1))})
        con = sqlite3.connect(path)
        con.execute("PRAGMA journal_mode=WAL")
        con.close()
        self.touch(path)
        listing = sorted(os.listdir(self.root))
        base = self.history()["totals"]["tokens"]
        self.assertEqual(sorted(os.listdir(self.root)), listing)
        con = sqlite3.connect(path)
        try:
            con.execute("INSERT INTO gen_metadata (idx, data) VALUES (99, ?)", (gen_blob([1], **GOOD),))
            con.commit()
            self.assertEqual(self.history()["totals"]["tokens"], base * 2)
        finally:
            con.close()

    def test_none_instead_of_zeros(self):
        self.assertIsNone(gemini_history(NOW, Path(self.temp.name) / "missing"))
        self.assertIsNone(self.history())
        self.add("zero.db", [gen_blob([1])], {1: step_blob(at(1))})
        self.assertIsNone(self.history())
        self.add("bad.db", [b"\xff\xff", b"\x80"], {})
        self.assertIsNone(self.history())
        self.add("old.db", [gen_blob([1], **GOOD)], {1: step_blob(at(24 * 40))})
        self.assertIsNone(self.history())

    def test_thirty_day_window_and_file_cutoff(self):
        gens = [gen_blob([1], **GOOD), gen_blob([2], **GOOD), gen_blob([3], **GOOD)]
        steps = {1: step_blob(at(1)), 2: step_blob(at(24 * 40)), 3: step_blob(at(-2))}
        self.add("fresh.db", gens, steps)
        self.add("stale.db", gens, steps, mtime=NOW - timedelta(days=40))
        # Only the in-window, non-future generation of fresh.db counts; stale.db is never opened.
        self.assertEqual(self.history()["totals"]["tokens"], 160)
        self.assertEqual(self.messages()[1]["files"], 1)

    def test_file_age_uses_newest_of_database_and_wal(self):
        old = NOW - timedelta(days=40)
        path = self.add("a.db", [gen_blob([1], **GOOD)], {1: step_blob(at(1))}, mtime=old)
        self.assertEqual(_newest_mtime(path), old.timestamp())
        wal = path.with_name("a.db-wal")
        wal.write_bytes(b"")
        self.touch(wal)
        self.assertEqual(_newest_mtime(path), NOW.timestamp())

    def test_shape_matches_claude_and_carries_no_price(self):
        projects = Path(self.temp.name) / "projects"
        projects.mkdir()
        row = {"type": "assistant", "timestamp": "2026-11-09T10:00:00Z", "requestId": "r",
               "message": {"id": "m", "model": "claude-opus-5-5", "usage": {"input_tokens": 1}}}
        (projects / "a.jsonl").write_text(json.dumps(row), encoding="utf-8")
        self.add("a.db", [gen_blob([1], **GOOD)], {1: step_blob(at(1))})
        claude, result = claude_history(NOW, projects), self.history()
        self.assertEqual(result.keys(), claude.keys())
        self.assertEqual(result["totals"].keys(), claude["totals"].keys())
        self.assertEqual(result["daily"][0].keys(), claude["daily"][0].keys())
        self.assertEqual(result["models"][0].keys(), claude["models"][0].keys())
        self.assertEqual(result["machines"][0].keys(), claude["machines"][0].keys())
        self.assertEqual(result["source"], "antigravity-cli-logs")
        self.assertIsNone(result["totals"]["cost"])
        self.assertEqual(result["totals"]["unpriced_tokens"], 160)
        self.assertTrue(all(d["cost"] is None for d in result["daily"]))
        self.assertTrue(all(m["cost"] is None for m in result["models"] + result["machines"]))
        self.assertEqual([m["id"] for m in result["machines"]], [result["this_machine"]])
        self.assertNotIn(str(self.root), json.dumps(result))

    def test_off_by_default_never_calls_parser_and_explicit_true_enables(self):
        config_root = Path(self.temp.name) / "config"
        config_root.mkdir()
        stale = {"history": {"computed_at": datetime.now(timezone.utc).isoformat(), "daily": []}}
        with mock.patch.dict(os.environ, {"QUOTACORE_HOME": str(config_root)}), \
                mock.patch.object(gemini, "detect", return_value=False):
            with mock.patch("quotacore.local_history.gemini_history", side_effect=AssertionError("read logs")):
                self.assertNotIn("history", gemini.read())
                self.assertNotIn("history", gemini.read(stale))
                for value in ("yes", 1, None):
                    config = {"initialized": True, "providers": {"gemini": {"enabled": True, "local_history": value}}}
                    (config_root / "config.json").write_text(json.dumps(config), encoding="utf-8")
                    self.assertNotIn("history", gemini.read())
            config["providers"]["gemini"]["local_history"] = True
            (config_root / "config.json").write_text(json.dumps(config), encoding="utf-8")
            fresh = {"computed_at": "now", "daily": []}
            with mock.patch("quotacore.local_history.gemini_history", return_value=fresh) as parser:
                self.assertIs(gemini.read()["history"], fresh)
                parser.assert_called_once()
                parser.reset_mock()
                self.assertIs(gemini.read(stale)["history"], stale["history"])
                parser.assert_not_called()
            with mock.patch("quotacore.local_history.gemini_history", side_effect=OSError("disk")):
                self.assertNotIn("history", gemini.read(None))


if __name__ == "__main__":
    unittest.main()
