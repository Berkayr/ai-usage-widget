from __future__ import annotations

import io
import json
import os
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

from quotacore import __main__
from quotacore.hooks import run_hook
from quotacore.paths import home_dir, config_dir, load_config, atomic_json, data_path
from quotacore.providers import claude, codex, gemini, copilot, openrouter, deepseek, jetbrains, PROVIDERS
from quotacore.schema import provider_record, snapshot


class CoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = mock.patch.dict(os.environ, {"QUOTACORE_HOME": self.temp.name}, clear=False)
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_schema_fields_and_unknown_usage(self):
        record = provider_record("claude", "Claude Code", windows=[{"used_percent": None}])
        value = snapshot([record])
        self.assertEqual(value["schema"], 1)
        self.assertIsNotNone(value["generated_at"])
        self.assertEqual(set(record), {"id", "label", "plan", "state", "source", "captured_at", "last_success_at", "stale", "error", "windows", "category", "meters", "experimental", "auth"})
        self.assertIsNone(record["windows"][0]["used_percent"])

    def test_claude_429_preserves_previous_without_zero(self):
        prev = provider_record("claude", "Claude Code", state="OK", source="statusline",
                               windows=[{"id": "five", "label": "5 hour", "used_percent": 42.0}])
        with mock.patch.object(claude, "detect", return_value=True), \
             mock.patch.object(claude, "_oauth", return_value={"accessToken": "fixture-token"}), \
             mock.patch.object(claude, "_live", return_value=(None, "RATE_LIMITED", "rate limited")), \
             mock.patch.object(claude, "_read_observation", return_value=(None, None)), \
             mock.patch.object(claude, "_read_cache", return_value=(None, None)):
            result = claude.read(prev)
        self.assertEqual(result["state"], "RATE_LIMITED")
        self.assertEqual(result["windows"][0]["used_percent"], 42.0)

    def test_claude_401_requires_auth(self):
        with mock.patch.object(claude, "detect", return_value=True), \
             mock.patch.object(claude, "_oauth", return_value={"accessToken": "fixture-token"}), \
             mock.patch.object(claude, "_live", return_value=(None, "AUTH_REQUIRED", "rejected")), \
             mock.patch.object(claude, "_read_observation", return_value=(None, None)), \
             mock.patch.object(claude, "_read_cache", return_value=(None, None)):
            result = claude.read()
        self.assertEqual(result["state"], "AUTH_REQUIRED")

    def test_claude_cache_preserves_normalized_windows_and_capture_time(self):
        captured = "2026-11-06T10:00:00+00:00"
        cached = {"windows": [{"id": "five", "label": "5 hour", "used_percent": 42.0}],
                  "captured_at": captured, "plan": None}
        with mock.patch.object(claude, "detect", return_value=True), \
             mock.patch.object(claude, "_oauth", return_value={}), \
             mock.patch.object(claude, "_live", return_value=(None, "AUTH_REQUIRED", "offline")), \
             mock.patch.object(claude, "_read_observation", return_value=(None, None)), \
             mock.patch.object(claude, "_read_cache", return_value=(cached, "cache")):
            result = claude.read()
        self.assertEqual(result["windows"], cached["windows"])
        self.assertEqual(result["captured_at"], captured)

    def test_claude_http_429_records_retry_after_without_token_output(self):
        failure = urllib.error.HTTPError("https://service.invalid/usage", 429, "limited",
                                         {"Retry-After": "37"}, io.BytesIO())
        opener = mock.Mock()
        opener.open.side_effect = failure
        with mock.patch.object(claude, "_oauth", return_value={"accessToken": "fixture-secret"}), \
             mock.patch("urllib.request.build_opener", return_value=opener):
            result = claude._live()
        self.assertEqual(result[1], "RATE_LIMITED")
        self.assertEqual(claude.RETRY_AFTER, 37.0)
        self.assertNotIn("fixture-secret", result[2])

    def test_old_claude_observation_is_ignored(self):
        path = Path(self.temp.name) / "old.json"
        path.write_text(json.dumps({"epoch": 1, "five": 55, "seven": 60}), encoding="utf-8")
        with mock.patch.dict(os.environ, {"QUOTACORE_CLAUDE_OBSERVATION": str(path)}):
            self.assertIsNone(claude._read_observation()[0])

    def test_codex_dynamic_windows(self):
        windows, plan = codex.windows_from_response({"rateLimits": {
            "primary": {"usedPercent": 23, "windowDurationMins": 300, "resetsAt": 1900000000},
            "secondary": {"usedPercent": 67, "windowDurationMins": 10080},
            "model-extra": {"usedPercent": 9, "windowDurationMins": 60},
            "planType": "sample"}})
        self.assertEqual(len(windows), 3)
        self.assertEqual({w["id"] for w in windows}, {"primary", "secondary", "model-extra"})
        self.assertEqual(plan, "sample")

    def test_window_visibility_metadata(self):
        claude_windows = claude._usage_windows({
            "five_hour": {"utilization": 20}, "seven_day": {"utilization": 30},
            "opaque_key": {"utilization": 21, "resets_at": "2030-01-01T00:00:00Z"},
        })
        extra = claude_windows[-1]
        self.assertTrue(extra["hidden_by_default"])
        self.assertEqual(extra["label"], "Extra window")
        self.assertEqual(extra["raw_label"], "Opaque Key")
        codex_windows, _ = codex.windows_from_response({"rateLimits": {
            "primary": {"usedPercent": 5}, "credits": {"usedPercent": None, "resetsAt": None}}})
        self.assertEqual(len(codex_windows), 2)
        self.assertTrue(codex_windows[1]["hidden_by_default"])

    def test_gemini_hides_non_primary_groups(self):
        windows, _ = gemini.windows_from_usage({"command": {"data": {"groups": [
            {"name": "Main", "buckets": [{"id": "main", "window": "weekly", "remaining_fraction": .5}]},
            {"name": "Other", "buckets": [{"id": "other", "window": "weekly", "remaining_fraction": .5}]},
        ]}}})
        self.assertNotIn("hidden_by_default", windows[0])
        self.assertTrue(windows[1]["hidden_by_default"])

    def test_write_is_silent_unless_print_requested(self):
        with mock.patch.object(__main__, "write_snapshot", return_value={"schema": 1}), \
             mock.patch("sys.stdout", new_callable=io.StringIO) as output:
            self.assertEqual(__main__.main(["write"]), 0)
            self.assertEqual(output.getvalue(), "")
        with mock.patch.object(__main__, "write_snapshot", return_value={"schema": 1}), \
             mock.patch("sys.stdout", new_callable=io.StringIO) as output:
            self.assertEqual(__main__.main(["write", "--print"]), 0)
            self.assertIn('"schema": 1', output.getvalue())

    def test_codex_app_server_exchange_uses_json_rpc_and_closes(self):
        response = {"id": 2, "result": {"rateLimits": {"primary": {"usedPercent": 4}}}}

        class FakeInput(io.StringIO):
            close_called = False

            def close(self):
                self.close_called = True

        class FakeProcess:
            def __init__(self):
                self.stdin = FakeInput()
                self.stdout = io.StringIO(json.dumps(response) + "\n")
                self.killed = False

            def kill(self):
                self.killed = True

            def wait(self, timeout=None):
                return 0

        process = FakeProcess()
        with mock.patch.object(codex, "_executable", return_value="codex"), \
             mock.patch.object(codex.subprocess, "Popen", return_value=process):
            result = codex._exchange()
        self.assertIn("rateLimits", result)
        self.assertTrue(process.killed)
        self.assertTrue(process.stdin.close_called)
        self.assertIn("account/rateLimits/read", process.stdin.getvalue())

    def test_gemini_weekly_only_bucket(self):
        windows, _ = gemini.windows_from_usage({"command": {"data": {"groups": [{"buckets": [
            {"id": "fixture-weekly", "window": "weekly", "remaining_fraction": 0.25,
             "reset_time": "2030-01-01T00:00:00Z"}]}]}}})
        self.assertEqual(len(windows), 1)
        self.assertEqual(windows[0]["used_percent"], 75.0)
        self.assertEqual(windows[0]["kind"], "weekly")

    def test_gemini_grouped_labels_and_session_kind(self):
        windows, _ = gemini.windows_from_usage({"command": {"data": {"groups": [{"name": "Gemini 4 Argon", "buckets": [{"id": "g-weekly", "window": "weekly", "remaining_fraction": .4}, {"id": "g-session", "window": "5h", "remaining_fraction": .8}]}]}}})
        self.assertEqual(windows[0]["label"], "Gemini 4 Argon · weekly")
        self.assertEqual(windows[1]["label"], "Gemini 4 Argon · 5h")
        self.assertEqual(windows[1]["kind"], "session")

    def test_codex_cmd_string_invocation(self):
        with mock.patch.object(codex.os, "name", "nt"), mock.patch.dict(os.environ, {"COMSPEC": "cmd.exe"}):
            command = codex._command("C:\\tools\\codex.cmd")
        self.assertIsInstance(command, str)
        self.assertEqual(command, '"cmd.exe" /d /s /c ""C:\\tools\\codex.cmd" app-server"')

    def test_gemini_refresh_source_marker_and_5h(self):
        payload = {"command": {"data": {"groups": [{"name": "Gemini", "buckets": [{"id": "session", "window": "5h", "remaining_fraction": .3}]}]}}}
        completed = mock.Mock(returncode=0, stdout=json.dumps(payload), stderr="")
        with mock.patch.object(gemini, "_agy", return_value="agy"), mock.patch.object(gemini.subprocess, "run", return_value=completed):
            self.assertEqual(gemini.refresh_gemini(), 0)
        result = gemini.read_snapshot()
        self.assertEqual(result["source"], "agy-usage")
        self.assertEqual(result["windows"][0]["kind"], "session")

    def test_api_key_secret_is_not_in_snapshot_or_errors(self):
        secret = "fictional-secret-value"
        with mock.patch.dict(os.environ, {"OPENROUTER_API_KEY": secret}), mock.patch.object(openrouter, "get_json", return_value=(None, "AUTH_REQUIRED", "Provider rejected credentials", None)):
            record = openrouter.read()
        records = [record] + [provider_record(key, module.META["label"]) for key, module in PROVIDERS.items() if key != "openrouter"]
        atomic_json(data_path("snapshot.json"), {"schema": 1, "generated_at": "2030-01-01T00:00:00+00:00", "providers": records})
        content = json.dumps(record) + json.dumps(__main__.doctor())
        self.assertNotIn(secret, content)
        self.assertNotIn(secret, record["error"] or "")

    def test_api_provider_success_schema_and_http_states(self):
        with mock.patch.dict(os.environ, {"OPENROUTER_API_KEY": "fixture"}), mock.patch.object(openrouter, "get_json", return_value=({"data": {"usage": 2.5, "limit": 9, "limit_remaining": 6.5}}, None, None, None)):
            value = openrouter.read()
        self.assertEqual(value["category"], "api-balance")
        self.assertEqual(value["meters"][0]["remaining"], 6.5)
        with mock.patch.dict(os.environ, {"OPENROUTER_API_KEY": "fixture"}), mock.patch.object(openrouter, "get_json", return_value=(None, "AUTH_REQUIRED", "Provider rejected credentials", None)):
            self.assertEqual(openrouter.read()["state"], "AUTH_REQUIRED")
        with mock.patch.dict(os.environ, {"OPENROUTER_API_KEY": "fixture"}), mock.patch.object(openrouter, "get_json", return_value=({"unexpected": True}, None, None, None)):
            changed = openrouter.read()
        self.assertEqual(changed["state"], "SCHEMA_CHANGED")
        self.assertEqual(changed["meters"], [])
        previous = dict(value)
        with mock.patch.dict(os.environ, {"OPENROUTER_API_KEY": "fixture"}), mock.patch.object(openrouter, "get_json", return_value=(None, "RATE_LIMITED", "Provider rate limited the request", "23")):
            limited = openrouter.read(previous)
        self.assertEqual(limited["state"], "RATE_LIMITED")
        self.assertTrue(limited["stale"])
        self.assertEqual(limited["meters"], previous["meters"])
        self.assertIn("23", limited["error"])

    def test_deepseek_balance_and_missing_key(self):
        with mock.patch.dict(os.environ, {"DEEPSEEK_API_KEY": ""}, clear=False):
            self.assertFalse(deepseek.detect())
            self.assertEqual(deepseek.read()["state"], "AUTH_REQUIRED")
        payload = {"is_available": True, "balance_infos": [{"currency": "USD", "total_balance": "7.25", "granted_balance": "2", "topped_up_balance": "5.25"}]}
        with mock.patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fixture"}), mock.patch.object(deepseek, "get_json", return_value=(payload, None, None, None)):
            self.assertEqual(deepseek.read()["meters"][0]["remaining"], 7.25)
        with mock.patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fixture"}), mock.patch.object(deepseek, "get_json", return_value=(None, "AUTH_REQUIRED", "Provider rejected credentials", None)):
            self.assertEqual(deepseek.read()["state"], "AUTH_REQUIRED")
        with mock.patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fixture"}), mock.patch.object(deepseek, "get_json", return_value=({"balance_infos": "changed"}, None, None, None)):
            self.assertEqual(deepseek.read()["state"], "SCHEMA_CHANGED")

    def test_copilot_success_and_401(self):
        command = mock.Mock(returncode=0, stdout="fixture-token\n")
        payload = {"copilotPlan": "fictional", "quotaSnapshots": {"premiumInteractions": {"percent_remaining": 80, "quota_reset_date": None}}}
        with mock.patch.object(copilot, "_gh", return_value="gh"), mock.patch.object(copilot.subprocess, "run", return_value=command), mock.patch.object(copilot, "get_json", return_value=(payload, None, None, None)):
            record = copilot.read()
        self.assertEqual(record["state"], "OK")
        self.assertEqual(record["windows"][0]["used_percent"], 20)
        with mock.patch.object(copilot, "_gh", return_value="gh"), mock.patch.object(copilot.subprocess, "run", return_value=command), mock.patch.object(copilot, "get_json", return_value=(None, "AUTH_REQUIRED", "Provider rejected credentials", None)):
            self.assertEqual(copilot.read()["state"], "AUTH_REQUIRED")

    def test_jetbrains_parse_xml_fixture_and_schema_change(self):
        path = Path(self.temp.name) / "quota.xml"
        path.write_text('<application><component><option name="quotaInfo" value="{&quot;type&quot;:&quot;Available&quot;,&quot;tariffQuota&quot;:{&quot;current&quot;:12000,&quot;maximum&quot;:50000}}" /></component></application>', encoding="utf-8")
        self.assertEqual(jetbrains.parse_file(path)[0]["used"], .12)
        path.write_text('<application><component><option name="quotaInfo" value="{&quot;changed&quot;:true}" /></component></application>', encoding="utf-8")
        self.assertIsNone(jetbrains.parse_file(path))

    def test_registry_provider_metadata_and_missing_installation(self):
        self.assertEqual(set(PROVIDERS), {"claude", "codex", "gemini", "copilot", "openrouter", "deepseek", "jetbrains"})
        with mock.patch.object(copilot, "_gh", return_value=None): self.assertEqual(copilot.read()["state"], "NOT_INSTALLED")
        for module in PROVIDERS.values():
            self.assertTrue({"id", "label", "category", "auth", "experimental", "docs_url"} <= set(module.META))

    def test_broken_hook_input_is_silent(self):
        with mock.patch("sys.stdin", io.StringIO("not-json")), mock.patch("sys.stdout", new_callable=io.StringIO) as output:
            self.assertEqual(run_hook("claude"), 0)
        self.assertEqual(output.getvalue(), "")

    def test_hook_chain_passes_stdout(self):
        payload = {"rate_limits": {"five_hour": {"used_percentage": 33, "resets_at": 1900000000}}}
        chain = [sys.executable, "-c", "import os;os.write(1,b'chain output\\x0a')"]
        with mock.patch("sys.stdin", io.StringIO(json.dumps(payload))), mock.patch("sys.stdout", new_callable=io.StringIO) as output:
            self.assertEqual(run_hook("claude", chain), 0)
        self.assertEqual(output.getvalue(), "chain output\n")

    def test_not_installed_states(self):
        with mock.patch.object(claude, "detect", return_value=False), \
             mock.patch.object(codex, "detect", return_value=False), \
             mock.patch.object(gemini, "detect", return_value=False):
            self.assertEqual(claude.read()["state"], "NOT_INSTALLED")
            self.assertEqual(codex.read()["state"], "NOT_INSTALLED")
            self.assertEqual(gemini.read()["state"], "NOT_INSTALLED")

    def test_config_defaults_require_consent(self):
        self.assertEqual(home_dir(), Path(self.temp.name))
        self.assertEqual(config_dir(), Path(self.temp.name))
        config = load_config({"claude": True, "codex": False, "gemini": True})
        self.assertFalse(config["providers"]["claude"]["enabled"])
        self.assertFalse(config["providers"]["codex"]["enabled"])

    def test_gemini_hook_snapshot_roundtrip(self):
        payload = {"command": {"data": {"groups": [{"buckets": [
            {"id": "test-bucket", "window": "5h", "remaining_fraction": 0.5}]}]}}}
        with mock.patch("sys.stdin", io.StringIO(json.dumps(payload))):
            self.assertEqual(run_hook("agy"), 0)
        result = gemini.read_snapshot()
        self.assertIsNotNone(result)
        self.assertEqual(result["windows"][0]["used_percent"], 50.0)


if __name__ == "__main__":
    unittest.main()
