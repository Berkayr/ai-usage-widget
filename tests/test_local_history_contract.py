from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from quotacore.paths import normalize_config

REPO_ROOT = Path(__file__).resolve().parent.parent
HISTORY_PROVIDERS = ("claude", "gemini")


class LocalHistoryContractTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)

    def _run_cli(self, *args: str) -> subprocess.CompletedProcess[str]:
        env = os.environ.copy()
        env["QUOTACORE_HOME"] = self.temp.name
        # Keep the child away from any real user data.
        env["HOME"] = env["USERPROFILE"] = self.temp.name
        existing_pythonpath = env.get("PYTHONPATH")
        env["PYTHONPATH"] = (
            f"{REPO_ROOT}{os.pathsep}{existing_pythonpath}"
            if existing_pythonpath
            else str(REPO_ROOT)
        )
        return subprocess.run(
            [sys.executable, "-m", "quotacore", *args],
            cwd=str(REPO_ROOT),
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

    def _provider_config(self) -> dict:
        proc = self._run_cli("provider-config")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        return json.loads(proc.stdout)

    def _assert_only_history_providers_have_local_history(self, providers: dict) -> None:
        for key, item in providers.items():
            if key not in HISTORY_PROVIDERS:
                self.assertNotIn("local_history", item)

    def test_default_and_on_off_roundtrip_return_explicit_boolean(self):
        initial = self._provider_config()
        for provider in HISTORY_PROVIDERS:
            self.assertIs(initial["providers"][provider].get("local_history"), False)
        self._assert_only_history_providers_have_local_history(initial["providers"])

        on_proc = self._run_cli("local-history", "on")
        self.assertEqual(on_proc.returncode, 0, on_proc.stderr)
        after_on = self._provider_config()
        self.assertIs(after_on["providers"]["claude"].get("local_history"), True)
        self.assertIs(after_on["providers"]["gemini"].get("local_history"), False)
        self._assert_only_history_providers_have_local_history(after_on["providers"])

        off_proc = self._run_cli("local-history", "off")
        self.assertEqual(off_proc.returncode, 0, off_proc.stderr)
        disk = json.loads((Path(self.temp.name) / "config.json").read_text(encoding="utf-8"))
        self.assertIs(disk["providers"]["claude"]["local_history"], False)

        after_off = self._provider_config()
        self.assertIs(after_off["providers"]["claude"].get("local_history"), False)
        self._assert_only_history_providers_have_local_history(after_off["providers"])

    def test_gemini_permission_is_separate_and_survives_provider_configuration(self):
        on_proc = self._run_cli("local-history", "on", "--provider", "gemini")
        self.assertEqual(on_proc.returncode, 0, on_proc.stderr)
        after_on = self._provider_config()
        self.assertIs(after_on["providers"]["gemini"].get("local_history"), True)
        self.assertIs(after_on["providers"]["claude"].get("local_history"), False)
        self._assert_only_history_providers_have_local_history(after_on["providers"])

        self.assertEqual(self._run_cli("local-history", "on", "--provider", "claude").returncode, 0)
        # Selecting or deselecting providers must not drop either permission.
        for selection in (["claude", "gemini"], ["codex"], []):
            proc = self._run_cli("configure", *selection)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            config = self._provider_config()
            for provider in HISTORY_PROVIDERS:
                self.assertIs(config["providers"][provider].get("local_history"), True, selection)
            self.assertEqual([k for k, v in config["providers"].items() if v["enabled"]], selection)

        self.assertEqual(self._run_cli("local-history", "off", "--provider", "gemini").returncode, 0)
        final = self._provider_config()
        self.assertIs(final["providers"]["gemini"].get("local_history"), False)
        self.assertIs(final["providers"]["claude"].get("local_history"), True)

    def test_only_claude_and_gemini_accept_a_history_permission(self):
        for command in (("local-history", "on", "--provider", "codex"), ("history", "--provider", "codex")):
            proc = self._run_cli(*command)
            self.assertEqual(proc.returncode, 2, proc.stderr)
        normalized = normalize_config({"providers": {"codex": {"enabled": True, "local_history": True}}})
        self.assertNotIn("local_history", normalized["providers"]["codex"])

    def test_history_command_without_logs_prints_no_money(self):
        proc = self._run_cli("history", "--provider", "gemini")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("No Antigravity CLI usage found", proc.stdout)
        self.assertNotIn("$", proc.stdout)
        self.assertEqual(json.loads(self._run_cli("history", "--provider", "gemini", "--json").stdout), None)

    def test_disk_false_reads_back_as_false_without_changing_normalize_config(self):
        disk_data = {
            "providers": {
                "claude": {"enabled": True, "order": 0, "local_history": False},
                "codex": {"enabled": True, "order": 1},
                "gemini": {"enabled": False, "order": 2, "local_history": False},
            },
            "interval": 300,
            "initialized": True,
        }
        (Path(self.temp.name) / "config.json").write_text(
            json.dumps(disk_data),
            encoding="utf-8",
        )

        # Disk normalization format must remain unchanged (omits False).
        normalized = normalize_config(disk_data)["providers"]
        self.assertNotIn("local_history", normalized["claude"])
        self.assertNotIn("local_history", normalized["gemini"])
        self.assertIs(normalize_config({"providers": {"gemini": {"local_history": True}}})["providers"]["gemini"]["local_history"], True)

        payload = self._provider_config()
        for provider in HISTORY_PROVIDERS:
            self.assertIs(payload["providers"][provider].get("local_history"), False)
        self.assertIs(payload["providers"]["claude"]["enabled"], True)
        self.assertIs(payload["providers"]["codex"]["enabled"], True)
        self._assert_only_history_providers_have_local_history(payload["providers"])


if __name__ == "__main__":
    unittest.main()
