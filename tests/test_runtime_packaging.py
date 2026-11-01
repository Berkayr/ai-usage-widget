"""Runtime metadata and offline supply-chain regression checks (no real accounts)."""
import ast
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

from quotacore import __main__ as cli
from quotacore.providers import PROVIDERS

ROOT = Path(__file__).resolve().parents[1]


class RuntimePackagingTests(unittest.TestCase):
    def test_core_only_imports_standard_library(self):
        imports = set()
        for path in (ROOT / 'quotacore').rglob('*.py'):
            for node in ast.walk(ast.parse(path.read_text(encoding='utf-8'))):
                if isinstance(node, ast.Import):
                    imports.update(alias.name.split('.')[0] for alias in node.names)
                elif isinstance(node, ast.ImportFrom) and not node.level and node.module:
                    imports.add(node.module.split('.')[0])
        self.assertFalse(imports - sys.stdlib_module_names - {'quotacore'})

    def test_doctor_identifies_native_selection_without_reading_providers(self):
        with tempfile.TemporaryDirectory() as home, mock.patch.dict(os.environ, {
            'QUOTACORE_HOME': home, 'QUOTACORE_RUNTIME_SOURCE': 'embedded',
            'QUOTACORE_PYTHON': 'fictional-python',
        }), mock.patch.object(cli, 'detect_all', return_value={key: False for key in PROVIDERS}):
            with mock.patch.object(PROVIDERS['claude'], 'read', side_effect=AssertionError('provider access')):
                paths = cli.doctor()['paths']
        self.assertEqual(paths['runtime_source'], 'embedded')
        self.assertEqual(paths['python_override'], 'fictional-python')
        self.assertEqual(paths['python_version'], sys.version.split()[0])
        self.assertEqual(paths['python'], sys.executable)

    @unittest.skipUnless(os.name == 'posix' and shutil.which('bash'), 'Bash fetcher runs on Linux')
    def test_fetch_rejects_corrupt_download_before_installing(self):
        with tempfile.TemporaryDirectory() as folder:
            curl = Path(folder) / 'curl'
            curl.write_text('#!/bin/sh\nfor arg do destination="$arg"; done\nprintf corrupt > "$destination"\n')
            curl.chmod(0o755)
            result = subprocess.run(['bash', str(ROOT / 'scripts/fetch-python.sh')],
                                    cwd=folder, env={**os.environ, 'PATH': folder + os.pathsep + os.environ['PATH']},
                                    text=True, capture_output=True, timeout=20)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('SHA-256 mismatch; refusing to extract', result.stderr)


if __name__ == '__main__':
    unittest.main()
