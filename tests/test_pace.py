from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from quotacore.pace import calculate_pace, reset_events, window_length


NOW = datetime(2030, 1, 8, tzinfo=timezone.utc)


def fixture(used, *, minutes=10080, elapsed=.5, wid="weekly", state="OK"):
    reset = NOW + timedelta(minutes=minutes * (1 - elapsed))
    return {"providers": [{"id": "codex", "label": "Codex", "state": state, "stale": False,
                           "windows": [{"id": wid, "label": wid, "kind": "weekly" if minutes > 300 else "session",
                                        "used_percent": used, "window_minutes": minutes,
                                        "resets_at": reset.isoformat()}]}]}


class PaceTests(unittest.TestCase):
    def pace(self, snap, **kwargs):
        return calculate_pace(snap, now=NOW, **kwargs)["providers"][0]

    def test_behind_and_ahead_gap_math(self):
        self.assertEqual(self.pace(fixture(20))["windows"][0]["gap"], 25)
        self.assertEqual(self.pace(fixture(60))["windows"][0]["gap"], -15)

    def test_inferred_window_length(self):
        self.assertEqual(window_length({"id": "primary", "kind": "session"}), 300)
        self.assertEqual(window_length({"id": "seven_day", "kind": "other"}), 10080)
        self.assertIsNone(window_length({"id": "opaque", "kind": "other"}))

    def test_spare_hysteresis_enter_and_exit(self):
        self.assertEqual(self.pace(fixture(25))["profile"], "SPARE")
        self.assertEqual(self.pace(fixture(41), previous_profiles={"codex": "SPARE"})["profile"], "NORMAL")
        self.assertEqual(self.pace(fixture(40), previous_profiles={"codex": "SPARE"})["profile"], "SPARE")

    def test_last_call_and_weekly_save(self):
        self.assertEqual(self.pace(fixture(60, elapsed=.9))["profile"], "LAST_CALL")
        self.assertEqual(self.pace(fixture(90))["profile"], "SAVE")

    def test_short_window_brake(self):
        self.assertEqual(self.pace(fixture(87, minutes=300, elapsed=.3, wid="session"))["profile"], "SAVE")

    def test_unknown_length_and_stale_provider(self):
        opaque = fixture(20)
        opaque["providers"][0]["windows"][0].update(window_minutes=None, id="opaque", kind="other", label="opaque")
        result = self.pace(opaque)
        self.assertEqual(result["profile"], "UNKNOWN")
        self.assertEqual(result["windows"][0]["status"], "unknown")
        self.assertEqual(self.pace(fixture(20, state="STALE"))["profile"], "UNKNOWN")

    def test_recent_stale_snapshot_remains_usable_and_reports_age(self):
        snap = fixture(20, state="RATE_LIMITED")
        snap["providers"][0].update(stale=True, error="rate limited",
                                    captured_at=(NOW - timedelta(minutes=4)).isoformat())
        result = calculate_pace(snap, now=NOW, max_age_minutes=30)["providers"][0]
        self.assertNotEqual(result["profile"], "UNKNOWN")
        self.assertTrue(result["stale"])
        self.assertEqual(result["age_minutes"], 4)

    def test_old_or_undated_stale_snapshot_and_auth_stay_unknown(self):
        old = fixture(20, state="RATE_LIMITED")
        old["providers"][0].update(stale=True, captured_at=(NOW - timedelta(minutes=31)).isoformat())
        self.assertEqual(self.pace(old)["profile"], "UNKNOWN")
        undated = fixture(20, state="STALE")
        self.assertEqual(self.pace(undated)["profile"], "UNKNOWN")
        auth = fixture(20, state="AUTH_REQUIRED")
        auth["providers"][0].update(captured_at=NOW.isoformat())
        self.assertEqual(self.pace(auth)["profile"], "UNKNOWN")

    def test_expired_window_rolls_usage_and_reset_forward(self):
        snap = fixture(26.8, minutes=300, elapsed=1, wid="session")
        snap["providers"][0]["windows"][0]["resets_at"] = (NOW - timedelta(minutes=30)).isoformat()
        window = self.pace(snap)["windows"][0]
        self.assertTrue(window["rolled"])
        self.assertEqual(window["used"], 0)
        self.assertAlmostEqual(window["elapsed"], .1, places=3)
        self.assertEqual(datetime.fromisoformat(window["resets_at"]), NOW + timedelta(minutes=270))

    def test_reset_event_records_last_used_and_unused(self):
        old = calculate_pace(fixture(20), now=NOW)
        updated = fixture(3)
        updated["providers"][0]["windows"][0]["resets_at"] = (NOW + timedelta(days=7)).isoformat()
        event = reset_events(calculate_pace(updated, now=NOW), old)[0]
        self.assertEqual(event["event"], "reset")
        self.assertEqual(event["last_used_percent"], 20)
        self.assertEqual(event["unused"], 70)


if __name__ == "__main__":
    unittest.main()
