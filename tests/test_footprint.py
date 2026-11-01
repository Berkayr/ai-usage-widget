"""Regressions for disk suppression, freshness and disabled provider imports."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from quotacore import __main__ as cli
from quotacore.paths import data_path
from quotacore.providers import METADATA, PROVIDERS


class FootprintTests(unittest.TestCase):
    def test_registry_metadata_matches_adapters(self):
        for key, module in PROVIDERS.items():
            self.assertEqual(METADATA[key], module.META)

    def test_unchanged_collection_preserves_inode_and_time(self):
        with tempfile.TemporaryDirectory() as root, patch.dict(os.environ, QUOTACORE_HOME=root):
            first = {'schema': 1, 'generated_at': 'first', 'providers': [{'id': 'gemini', 'captured_at': 'old', 'state': 'OK'}]}
            cli.store_snapshot(first)
            path = data_path('snapshot.json')
            before = path.stat()
            result = cli.store_snapshot({**first, 'generated_at': 'second'})
            self.assertEqual(result, first)
            self.assertEqual(path.stat().st_ino, before.st_ino)
            self.assertEqual(path.stat().st_mtime_ns, before.st_mtime_ns)
            fresh = {**first, 'generated_at': 'third', 'providers': [{'id': 'gemini', 'captured_at': 'new', 'state': 'OK'}]}
            cli.store_snapshot(fresh)
            self.assertEqual(json.loads(path.read_text()), fresh)
            path.write_text(json.dumps({k: v for k, v in first.items() if k != 'generated_at'}))
            cli.store_snapshot(first)
            self.assertEqual(json.loads(path.read_text()), first)
            path.write_text('{broken')
            cli.store_snapshot(first)
            self.assertEqual(json.loads(path.read_text()), first)

    def test_disabled_collection_imports_no_provider_adapter(self):
        code = '''
import json, sys
from quotacore.__main__ import write_snapshot
write_snapshot()
print(json.dumps([m for m in sys.modules if m.startswith('quotacore.providers.')]))
'''
        with tempfile.TemporaryDirectory() as root:
            env = dict(os.environ, QUOTACORE_HOME=root)
            Path(root, 'config.json').write_text(json.dumps({'initialized': True, 'providers': {}}))
            result = subprocess.run([sys.executable, '-S', '-s', '-c', code], env=env,
                                    capture_output=True, text=True, check=True)
            self.assertEqual(json.loads(result.stdout), [])

    def test_only_enabled_adapter_is_imported(self):
        code = """
import json, sys
from quotacore.__main__ import write_snapshot
write_snapshot()
print(json.dumps([m for m in sys.modules if m.startswith('quotacore.providers.')]))
"""
        with tempfile.TemporaryDirectory() as root:
            env = dict(os.environ, HOME=root, QUOTACORE_HOME=root, PATH='/usr/bin:/bin')
            Path(root, 'config.json').write_text(json.dumps({
                'initialized': True, 'providers': {'gemini': {'enabled': True}}}))
            result = subprocess.run([sys.executable, '-S', '-s', '-c', code], env=env,
                                    capture_output=True, text=True, check=True)
            self.assertEqual(set(json.loads(result.stdout)), {
                'quotacore.providers.gemini', 'quotacore.providers.common'})
