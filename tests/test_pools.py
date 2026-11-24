from __future__ import annotations

import io
import json
import os
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from quotacore import bar, pace
from quotacore.hooks import run_hook
from quotacore.paths import atomic_json, data_path
from quotacore.providers import claude, codex, copilot, gemini, zai
from quotacore.schema import provider_record, snapshot, window_record


class PoolAndLimitsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = mock.patch.dict(os.environ, {"QUOTACORE_HOME": self.temp.name}, clear=False)
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_schema_window_record_optional_pool(self):
        without_pool = window_record("w1", "5 hour", 25.0)
        self.assertNotIn("pool", without_pool)
        with_pool = window_record("w1", "5 hour", 25.0, pool={"id": "main", "label": "Claude"})
        self.assertEqual(with_pool["pool"], {"id": "main", "label": "Claude"})

    def test_gemini_multi_group_pools_and_nova(self):
        payload = {
            "command": {
                "data": {
                    "plan_tier": "sample",
                    "groups": [
                        {
                            "name": "Gemini Primary",
                            "buckets": [
                                {"id": "g-5h", "window": "5h", "remaining_fraction": 0.8},
                                {"id": "g-weekly", "window": "weekly", "remaining_fraction": 0.6},
                            ],
                        },
                        {
                            "name": "Claude and GPT models",
                            "buckets": [
                                {"id": "3p-5h", "window": "5h", "remaining_fraction": 0.5},
                                {"id": "3p-weekly", "window": "weekly", "remaining_fraction": 0.4},
                            ],
                        },
                        {
                            "name": "Nova",
                            "buckets": [
                                {"id": "nova-weekly", "window": "weekly", "remaining_fraction": 0.9},
                            ],
                        },
                    ],
                }
            }
        }
        windows, plan = gemini.windows_from_usage(payload)
        self.assertEqual(plan, "sample")
        self.assertEqual(len(windows), 5)
        self.assertEqual(windows[0]["pool"], {"id": "main", "label": "Gemini Primary"})
        self.assertEqual(windows[1]["pool"], {"id": "main", "label": "Gemini Primary"})
        self.assertNotIn("hidden_by_default", windows[0])
        self.assertNotIn("hidden_by_default", windows[1])
        self.assertEqual(windows[2]["pool"], {"id": "claude-and-gpt-models", "label": "Claude and GPT models"})
        self.assertEqual(windows[3]["pool"], {"id": "claude-and-gpt-models", "label": "Claude and GPT models"})
        self.assertTrue(windows[2]["hidden_by_default"])
        self.assertTrue(windows[3]["hidden_by_default"])
        self.assertEqual(windows[4]["pool"], {"id": "nova", "label": "Nova"})
        self.assertEqual(windows[4]["label"], "Nova · weekly")
        self.assertTrue(windows[4]["hidden_by_default"])

    def test_gemini_pool_roundtrip_through_snapshot_file(self):
        payload = {
            "command": {
                "data": {
                    "groups": [
                        {"name": "Gemini Core", "buckets": [{"id": "g-5h", "window": "5h", "remaining_fraction": 0.7}]},
                        {"name": "Claude and GPT models", "buckets": [{"id": "3p-weekly", "window": "weekly", "remaining_fraction": 0.25}]},
                    ]
                }
            }
        }
        completed = mock.Mock(returncode=0, stdout=json.dumps(payload), stderr="")
        with mock.patch.object(gemini, "_agy", return_value="agy"), \
             mock.patch.object(gemini.subprocess, "run", return_value=completed):
            self.assertEqual(gemini.refresh_gemini(), 0)
        result = gemini.read_snapshot()
        self.assertIsNotNone(result)
        by_id = {w["id"]: w for w in result["windows"]}
        self.assertEqual(by_id["g-5h"]["pool"], {"id": "main", "label": "Gemini Core"})
        self.assertEqual(by_id["3p-weekly"]["pool"], {"id": "claude-and-gpt-models", "label": "Claude and GPT models"})
        self.assertTrue(by_id["3p-weekly"]["hidden_by_default"])

    def test_gemini_hook_writes_pools_and_old_file_without_pool_derives_pools(self):
        hook_payload = {
            "command": {
                "data": {
                    "groups": [
                        {"name": "Gemini Core", "buckets": [{"id": "g-5h", "window": "5h", "remaining_fraction": 0.5}]},
                        {"name": "Nova", "buckets": [{"id": "nova-w", "window": "weekly", "remaining_fraction": 0.2}]},
                    ]
                }
            }
        }
        with mock.patch("sys.stdin", io.StringIO(json.dumps(hook_payload))):
            self.assertEqual(run_hook("agy"), 0)
        hook_result = gemini.read_snapshot()
        self.assertEqual({w["id"]: w["pool"] for w in hook_result["windows"]}, {
            "g-5h": {"id": "main", "label": "Gemini Core"},
            "nova-w": {"id": "nova", "label": "Nova"},
        })

        old_snapshot = {
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "source": "agy-usage",
            "windows": [
                {"id": "g-5h", "label": "Gemini Core · 5h", "used_percent": 30.0, "kind": "session", "window_minutes": 300},
                {"id": "3p-weekly", "label": "Claude and GPT models · weekly", "used_percent": 55.0, "kind": "weekly", "window_minutes": 10080, "hidden_by_default": True},
            ],
        }
        atomic_json(data_path("gemini-kota.json"), old_snapshot)
        old_result = gemini.read_snapshot()
        self.assertIsNotNone(old_result)
        by_id = {w["id"]: w for w in old_result["windows"]}
        self.assertEqual(by_id["g-5h"]["pool"], {"id": "main", "label": "Gemini Core"})
        self.assertEqual(by_id["3p-weekly"]["pool"], {"id": "claude-and-gpt-models", "label": "Claude and GPT models"})

    def test_claude_limits_dedupe_legacy_and_nova(self):
        payload = {
            "five_hour": {"utilization": 22, "resets_at": "2030-01-01T05:00:00Z"},
            "seven_day": {"utilization": 48, "resets_at": "2030-01-07T00:00:00Z"},
            "seven_day_opus": {"utilization": 15, "resets_at": "2030-01-07T00:00:00Z"},
            "seven_day_sonnet": {"utilization": 35, "resets_at": "2030-01-07T00:00:00Z"},
            "seven_day_breakdown": {"note": "no percentage"},
            "extra_usage": {"is_enabled": True},
            "opaque_key": {"utilization": 11, "resets_at": "2030-01-02T00:00:00Z"},
            "limits": [
                {"kind": "session", "group": "session", "percent": 22, "resets_at": "2030-01-01T05:00:00Z", "scope": None, "is_active": True},
                {"kind": "weekly_all", "group": "weekly", "percent": 48, "resets_at": "2030-01-07T00:00:00Z", "scope": None, "is_active": True},
                {"kind": "weekly_scoped", "group": "weekly", "percent": 17, "resets_at": "2030-01-07T00:00:00Z", "scope": {"model": {"id": None, "display_name": "Opus"}, "surface": None}},
                {"kind": "weekly_scoped", "group": "weekly", "percent": 40, "resets_at": "2030-01-07T00:00:00Z", "scope": {"model": {"id": None, "display_name": "Nova"}, "surface": None}},
            ],
        }
        windows = claude._usage_windows(payload)
        by_id = {w["id"]: w for w in windows}
        # Main windows keep existing ids, labels, order, visibility and get main pool.
        self.assertEqual(windows[0]["id"], "five_hour")
        self.assertEqual(windows[0]["pool"], {"id": "main", "label": "Claude"})
        self.assertNotIn("hidden_by_default", windows[0])
        self.assertEqual(windows[1]["id"], "seven_day")
        self.assertEqual(windows[1]["pool"], {"id": "main", "label": "Claude"})
        self.assertNotIn("hidden_by_default", windows[1])

        # Scoped Opus wins over legacy seven_day_opus (no duplicate).
        self.assertNotIn("seven_day_opus", by_id)
        self.assertIn("limit-weekly_scoped-opus", by_id)
        self.assertEqual(by_id["limit-weekly_scoped-opus"]["used_percent"], 17.0)
        self.assertEqual(by_id["limit-weekly_scoped-opus"]["label"], "Opus · weekly")
        self.assertEqual(by_id["limit-weekly_scoped-opus"]["pool"], {"id": "opus", "label": "Opus"})
        self.assertEqual(by_id["limit-weekly_scoped-opus"]["window_minutes"], 10080)
        self.assertTrue(by_id["limit-weekly_scoped-opus"]["hidden_by_default"])

        # Brand-new model "Nova" appears automatically.
        self.assertIn("limit-weekly_scoped-nova", by_id)
        self.assertEqual(by_id["limit-weekly_scoped-nova"]["label"], "Nova · weekly")
        self.assertEqual(by_id["limit-weekly_scoped-nova"]["pool"], {"id": "nova", "label": "Nova"})
        self.assertTrue(by_id["limit-weekly_scoped-nova"]["hidden_by_default"])

        # Legacy seven_day_sonnet without scoped counterpart gets clean label and pool.
        self.assertEqual(by_id["seven_day_sonnet"]["label"], "Sonnet · weekly")
        self.assertEqual(by_id["seven_day_sonnet"]["pool"], {"id": "sonnet", "label": "Sonnet"})
        self.assertEqual(by_id["seven_day_sonnet"]["window_minutes"], 10080)
        self.assertTrue(by_id["seven_day_sonnet"]["hidden_by_default"])

        # Keys without percentage and unknown keys keep today's behaviour.
        self.assertEqual(by_id["seven_day_breakdown"]["label"], "Extra window")
        self.assertEqual(by_id["seven_day_breakdown"]["raw_label"], "Seven Day Breakdown")
        self.assertEqual(by_id["extra_usage"]["label"], "Extra window")
        self.assertEqual(by_id["opaque_key"]["label"], "Extra window")
        self.assertEqual(by_id["opaque_key"]["raw_label"], "Opaque Key")
        self.assertEqual(by_id["opaque_key"]["pool"], {"id": "main", "label": "Claude"})

    def test_claude_limits_fallback_main_and_unknown_shapes(self):
        payload = {
            "limits": [
                "not-a-dict",
                {"kind": "session", "group": "session", "percent": 31, "resets_at": "2030-01-01T05:00:00Z", "scope": None},
                {"kind": "weekly_all", "group": "weekly", "percent": 62, "resets_at": "2030-01-07T00:00:00Z", "scope": None},
                {"kind": "session_surface", "group": "session", "percent": 12, "scope": {"model": None, "surface": {"display_name": "Web"}}},
                {"kind": "burst_limit", "group": "mystery", "percent": 8, "scope": "Fast Lane"},
                {"kind": "orphan_limit", "group": "mystery", "percent": 5, "scope": None},
                {"kind": "weird_scope", "group": "weekly", "percent": 9, "scope": [1, 2, 3]},
            ]
        }
        windows = claude._usage_windows(payload)
        by_id = {w["id"]: w for w in windows}
        self.assertEqual(windows[0]["id"], "five_hour")
        self.assertEqual(windows[0]["used_percent"], 31.0)
        self.assertEqual(windows[0]["pool"], {"id": "main", "label": "Claude"})
        self.assertEqual(windows[1]["id"], "seven_day")
        self.assertEqual(windows[1]["used_percent"], 62.0)
        self.assertEqual(windows[1]["pool"], {"id": "main", "label": "Claude"})
        self.assertEqual(by_id["limit-session_surface-web"]["label"], "Web · session")
        self.assertEqual(by_id["limit-session_surface-web"]["window_minutes"], 300)
        self.assertEqual(by_id["limit-burst_limit-fast-lane"]["label"], "Fast Lane · burst limit")
        self.assertEqual(by_id["limit-orphan_limit-orphan-limit"]["label"], "Orphan Limit")
        self.assertIn("limit-weird_scope-weird-scope", by_id)

    def test_claude_cache_uses_same_parser(self):
        fake_home = Path(self.temp.name) / "home"
        fake_home.mkdir()
        cache_doc = {
            "cachedUsageUtilization": {
                "fetchedAtMs": int(time.time() * 1000),
                "utilization": {
                    "five_hour": {"utilization": 10},
                    "limits": [
                        {"kind": "weekly_scoped", "group": "weekly", "percent": 44, "scope": {"model": {"display_name": "Nova"}}},
                    ],
                },
            }
        }
        (fake_home / ".claude.json").write_text(json.dumps(cache_doc), encoding="utf-8")
        with mock.patch("quotacore.providers.claude.Path.home", return_value=fake_home):
            cached, source = claude._read_cache()
        self.assertEqual(source, "cache")
        by_id = {w["id"]: w for w in cached["windows"]}
        self.assertIn("limit-weekly_scoped-nova", by_id)
        self.assertEqual(by_id["limit-weekly_scoped-nova"]["pool"], {"id": "nova", "label": "Nova"})

    def test_claude_statusline_preserves_unexpired_scoped_windows_from_prev(self):
        future = (datetime.now(timezone.utc) + timedelta(hours=12)).isoformat()
        past = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        prev_captured = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
        obs_captured = datetime.now(timezone.utc).isoformat()
        prev = provider_record(
            "claude", "Claude Code", state="OK", source="oauth-usage",
            captured_at=prev_captured, last_success_at=prev_captured,
            windows=[
                window_record("five_hour", "5 hour", 20.0, future, 300, "session", pool={"id": "main", "label": "Claude"}),
                window_record("limit-weekly_scoped-nova", "Nova · weekly", 40.0, future, 10080, "weekly", hidden_by_default=True, pool={"id": "nova", "label": "Nova"}),
                window_record("limit-weekly_scoped-expired", "Expired · weekly", 90.0, past, 10080, "weekly", hidden_by_default=True, pool={"id": "expired", "label": "Expired"}),
            ],
        )
        observation = {
            "windows": [
                window_record("five", "5 hour", 35.0, future, 300, "session", pool={"id": "main", "label": "Claude"}),
                window_record("seven", "7 day", 50.0, future, 10080, "weekly", pool={"id": "main", "label": "Claude"}),
            ],
            "captured_at": obs_captured,
            "plan": None,
        }
        with mock.patch.object(claude, "detect", return_value=True), \
             mock.patch.object(claude, "_oauth", return_value={}), \
             mock.patch.object(claude, "_live", return_value=(None, "RATE_LIMITED", "limited")), \
             mock.patch.object(claude, "_read_observation", return_value=(observation, None)):
            result = claude.read(prev)
        by_id = {w["id"]: w for w in result["windows"]}
        self.assertIn("five", by_id)
        self.assertIn("seven", by_id)
        self.assertIn("limit-weekly_scoped-nova", by_id)
        self.assertNotIn("limit-weekly_scoped-expired", by_id)
        # Carried-over window is marked stale and keeps previous capture timestamp rather than claiming observation freshness.
        self.assertTrue(by_id["limit-weekly_scoped-nova"]["stale"])
        self.assertEqual(by_id["limit-weekly_scoped-nova"]["captured_at"], prev_captured)

    def test_codex_rate_limits_by_limit_id_nova_and_unknown_shapes(self):
        payload = {
            "rateLimits": {
                "limitId": "codex",
                "primary": {"usedPercent": 23, "windowDurationMins": 300, "resetsAt": 1900000000},
                "secondary": {"usedPercent": 67, "windowDurationMins": 10080},
                "credits": {"hasCredits": False, "balance": None},
                "planType": "sample",
            },
            "rateLimitsByLimitId": {
                "codex": {
                    "limitId": "codex",
                    "limitName": "Codex",
                    "primary": {"usedPercent": 23, "windowDurationMins": 300},
                },
                "nova": {
                    "limitId": "nova",
                    "limitName": "Nova",
                    "primary": {"usedPercent": 14, "windowDurationMins": 300, "resetsAt": 1900000000},
                    "secondary": {"usedPercent": 52, "windowDurationMins": 10080, "resetsAt": 1900500000},
                    "credits": {"hasCredits": False},
                    "empty_window": None,
                },
                "codex_spark": {
                    "primary": {"usedPercent": 9, "windowDurationMins": 300},
                },
                "broken_str": "not-a-dict",
                "broken_none": None,
            },
        }
        windows, plan = codex.windows_from_response(payload)
        self.assertEqual(plan, "sample")
        by_id = {w["id"]: w for w in windows}
        self.assertEqual(by_id["primary"]["pool"], {"id": "main", "label": "Codex"})
        self.assertNotIn("hidden_by_default", by_id["primary"])
        self.assertEqual(by_id["secondary"]["pool"], {"id": "main", "label": "Codex"})
        self.assertNotIn("codex-primary", by_id)
        self.assertIn("nova-primary", by_id)
        self.assertEqual(by_id["nova-primary"]["label"], "Nova · 5 hour")
        self.assertEqual(by_id["nova-primary"]["pool"], {"id": "nova", "label": "Nova"})
        self.assertTrue(by_id["nova-primary"]["hidden_by_default"])
        self.assertEqual(by_id["nova-secondary"]["label"], "Nova · 7 day")
        self.assertEqual(by_id["nova-secondary"]["pool"], {"id": "nova", "label": "Nova"})
        self.assertNotIn("nova-credits", by_id)
        self.assertNotIn("nova-empty_window", by_id)
        self.assertEqual(by_id["codex_spark-primary"]["label"], "codex_spark · 5 hour")
        self.assertEqual(by_id["codex_spark-primary"]["pool"], {"id": "codex-spark", "label": "codex_spark"})

        # Non-dict payloads must never raise.
        self.assertEqual(codex.windows_from_response({"rateLimits": "bad", "rateLimitsByLimitId": ["bad"]}), ([], None))

    def test_copilot_and_zai_windows_have_main_pool(self):
        command = mock.Mock(returncode=0, stdout="fixture-token\n")
        cp_payload = {"copilotPlan": "fictional", "quotaSnapshots": {"premiumInteractions": {"percent_remaining": 70}}}
        with mock.patch.object(copilot, "_gh", return_value="gh"), \
             mock.patch.object(copilot.subprocess, "run", return_value=command), \
             mock.patch.object(copilot, "get_json", return_value=(cp_payload, None, None, None)):
            cp_record = copilot.read()
        self.assertEqual(cp_record["windows"][0]["pool"], {"id": "main", "label": "Copilot"})

        zai_payload = {"data": {"limits": [{"type": "TOKENS_LIMIT", "percentage": 25}]}}
        with mock.patch.dict(os.environ, {"ZAI_API_KEY": "fixture"}), \
             mock.patch.object(zai, "get_json", return_value=(zai_payload, None, None, None)):
            zai_record = zai.read()
        self.assertEqual(zai_record["windows"][0]["pool"], {"id": "main", "label": "Z.ai"})

    def test_bar_and_pace_defaults_unchanged_with_secondary_pools(self):
        now = datetime(2030, 1, 1, 2, 30, tzinfo=timezone.utc)
        reset_5h = "2030-01-01T05:00:00+00:00"
        reset_7d = "2030-01-05T00:00:00+00:00"
        base_windows = [
            window_record("five_hour", "5 hour", 30.0, reset_5h, 300, "session"),
            window_record("seven_day", "7 day", 40.0, reset_7d, 10080, "weekly"),
        ]
        pooled_windows = claude._usage_windows({
            "five_hour": {"utilization": 30.0, "resets_at": reset_5h},
            "seven_day": {"utilization": 40.0, "resets_at": reset_7d},
            "limits": [
                {"kind": "weekly_scoped", "group": "weekly", "percent": 95.0, "resets_at": reset_7d, "scope": {"model": {"display_name": "Nova"}}},
            ],
        })
        base_snap = snapshot([provider_record("claude", "Claude Code", state="OK", captured_at=now.isoformat(), windows=base_windows)])
        pooled_snap = snapshot([provider_record("claude", "Claude Code", state="OK", captured_at=now.isoformat(), windows=pooled_windows)])
        base_snap["generated_at"] = pooled_snap["generated_at"] = now.isoformat()

        self.assertEqual(bar.report(base_snap, window="both", now=now), bar.report(pooled_snap, window="both", now=now))
        self.assertEqual(pace.calculate_pace(base_snap, now=now), pace.calculate_pace(pooled_snap, now=now))


if __name__ == "__main__":
    unittest.main()
