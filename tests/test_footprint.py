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


class LightnessBudgetTests(unittest.TestCase):
    def test_thresholds_and_appimage_memory_accounting(self):
        from scripts.footprint import budget_failures
        result = {'idle_cpu_percent': 0.1, 'first_render_seconds': 5,
                  'idle_median': {'memory_bytes': 250 * 1024**2}}
        self.assertEqual(budget_failures(result), [])
        result['idle_cpu_percent'] += 0.0001
        result['first_render_seconds'] += 0.001
        result['idle_median']['memory_bytes'] += 1
        self.assertEqual(len(budget_failures(result)), 3)
        self.assertEqual(len(budget_failures(result, appimage=True)), 2)

    def test_bare_binary_resources_and_monitor_are_staged_before_launch(self):
        from scripts import footprint
        class Staged(Exception):
            pass
        def inspect_launch(command, **kwargs):
            root = Path(kwargs['env']['HOME']).parent
            self.assertTrue((root / 'lib/ai-usage/quotacore/__main__.py').is_file())
            settings = json.loads((root / 'config/ai-usage/settings.json').read_text())
            self.assertEqual(settings['linux']['monitor'], 'Fictional-1')
            self.assertNotIn('API_KEY', kwargs['env'])
            raise Staged()
        with tempfile.TemporaryDirectory() as temp:
            binary = Path(temp) / 'ai-usage'
            binary.write_bytes(b'fictional executable, never launched')
            with patch.object(footprint.subprocess, 'Popen', side_effect=inspect_launch):
                with self.assertRaises(Staged):
                    footprint.measure(binary, False, 40, 'Fictional-1')
