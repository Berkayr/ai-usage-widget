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


class LocalHistoryContractTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)

    def _run_cli(self, *args: str) -> subprocess.CompletedProcess[str]:
        env = os.environ.copy()
        env["QUOTACORE_HOME"] = self.temp.name
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

    def _assert_only_claude_has_local_history(self, providers: dict) -> None:
        for key, item in providers.items():
            if key != "claude":
                self.assertNotIn("local_history", item)

    def test_default_and_on_off_roundtrip_return_explicit_boolean(self):
        initial = self._provider_config()
        self.assertIs(initial["providers"]["claude"].get("local_history"), False)
        self._assert_only_claude_has_local_history(initial["providers"])

        on_proc = self._run_cli("local-history", "on")
        self.assertEqual(on_proc.returncode, 0, on_proc.stderr)
        after_on = self._provider_config()
        self.assertIs(after_on["providers"]["claude"].get("local_history"), True)
        self._assert_only_claude_has_local_history(after_on["providers"])

        off_proc = self._run_cli("local-history", "off")
        self.assertEqual(off_proc.returncode, 0, off_proc.stderr)
        disk = json.loads((Path(self.temp.name) / "config.json").read_text(encoding="utf-8"))
        self.assertIs(disk["providers"]["claude"]["local_history"], False)

        after_off = self._provider_config()
        self.assertIs(after_off["providers"]["claude"].get("local_history"), False)
        self._assert_only_claude_has_local_history(after_off["providers"])

    def test_disk_false_reads_back_as_false_without_changing_normalize_config(self):
        disk_data = {
            "providers": {
                "claude": {"enabled": True, "order": 0, "local_history": False},
                "codex": {"enabled": True, "order": 1},
            },
            "interval": 300,
            "initialized": True,
        }
        (Path(self.temp.name) / "config.json").write_text(
            json.dumps(disk_data),
            encoding="utf-8",
        )

        # Disk normalization format must remain unchanged (omits False).
        self.assertNotIn("local_history", normalize_config(disk_data)["providers"]["claude"])

        payload = self._provider_config()
        self.assertIs(payload["providers"]["claude"].get("local_history"), False)
        self.assertIs(payload["providers"]["claude"]["enabled"], True)
        self.assertIs(payload["providers"]["codex"]["enabled"], True)
        self._assert_only_claude_has_local_history(payload["providers"])


if __name__ == "__main__":
    unittest.main()
