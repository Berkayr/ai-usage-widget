import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from quotacore.bar import report, render
from quotacore.__main__ import main
from quotacore.providers import gemini


class BarTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = patch.dict(os.environ, QUOTACORE_HOME=self.temp.name)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.now = datetime(2030, 1, 1, tzinfo=timezone.utc)
        self.value = {'providers': [{'id': 'claude', 'state': 'OK', 'windows': [
            {'kind': 'session', 'label': 'Session', 'used_percent': 34, 'resets_at': '2030-01-01T02:41:00Z'},
            {'kind': 'weekly', 'label': 'Weekly', 'used_percent': 85, 'resets_at': None},
            {'kind': 'session', 'label': 'Extra', 'used_percent': 99, 'hidden_by_default': True}]}]}

    def test_session_and_all_window_details(self):
        result = report(self.value, ['claude'], now=self.now)
        self.assertEqual(result['text'], 'CL 34% · 2h41')
        self.assertEqual(result['class'], 'ok')
        self.assertIn('Weekly: 85%', result['tooltip'])
        self.assertEqual(len(result['providers'][0]['windows']), 3)

    def test_weekly_and_both(self):
        self.assertEqual(report(self.value, ['claude'], 'weekly')['percentage'], 85)
        result = report(self.value, ['claude'], 'both')
        self.assertEqual(result['class'], 'crit')
        self.assertIn('S 34%', result['text'])
        self.assertIn('W 85%', result['text'])

    def test_thresholds(self):
        for pct, severity in [(0, 'ok'), (49, 'ok'), (50, 'warn'), (79, 'warn'), (80, 'crit')]:
            self.value['providers'][0]['windows'][0]['used_percent'] = pct
            self.assertEqual(report(self.value, ['claude'])['class'], severity)

    def test_missing_or_corrupt_snapshot_is_unknown_and_read_only(self):
        path = Path(self.temp.name) / 'snapshot.json'
        self.assertIsNone(json.loads(render('json'))['percentage'])
        self.assertEqual(list(Path(self.temp.name).iterdir()), [])
        for content in ['broken', '[]', '{"providers":null}']:
            path.write_text(content)
            self.assertIn('CL ?', render())
            self.assertEqual(path.read_text(), content)

    def test_malformed_windows_are_unknown(self):
        for windows in [None, 42, "invalid", {"kind": "session"}]:
            self.value['providers'][0]['windows'] = windows
            self.assertIsNone(report(self.value, ['claude'])['percentage'])

    def test_unknown_is_not_zero(self):
        for pct in [None, 'invalid', float('nan'), float('inf'), True]:
            self.value['providers'][0]['windows'][0]['used_percent'] = pct
            result = report(self.value, ['claude'])
            self.assertIsNone(result['percentage'])
            self.assertIn('CL ?', result['text'])

    def test_stale_and_auth_state(self):
        self.value['providers'][0].update(state='STALE', stale=True)
        self.assertIn('[stale]', report(self.value, ['claude'])['text'])
        self.value['providers'][0]['state'] = 'AUTH_REQUIRED'
        self.assertIsNone(report(self.value, ['claude'])['percentage'])

    def test_formats_and_escaping(self):
        self.value['providers'][0]['windows'][0]['label'] = '<b>Session</b>'
        (Path(self.temp.name) / 'snapshot.json').write_text(json.dumps(self.value))
        waybar = json.loads(render('waybar'))
        self.assertEqual(set(waybar), {'text', 'tooltip', 'class', 'percentage'})
        self.assertIn('&lt;b&gt;', waybar['tooltip'])
        self.assertEqual(len(render('i3blocks').splitlines()), 2)
        self.assertIsInstance(json.loads(render('json'))['providers'], list)
        self.assertEqual(render('plain'), render('polybar'))

    def test_cli_uses_snapshot_without_collecting(self):
        with patch('quotacore.__main__.collect', side_effect=AssertionError('must not collect')), redirect_stdout(io.StringIO()) as output:
            self.assertEqual(main(['bar', '--providers', 'codex,claude', '--format', 'json', '--window', 'both']), 0)
        result = json.loads(output.getvalue())
        self.assertEqual([p['id'] for p in result['providers']], ['codex', 'claude'])

    def test_cli_rejects_unknown_provider(self):
        with redirect_stdout(io.StringIO()), patch('sys.stderr', io.StringIO()), self.assertRaises(SystemExit):
            main(['bar', '--providers', 'invalid'])


class GeminiLinuxTests(unittest.TestCase):
    def test_graphical_path_discovery(self):
        with tempfile.TemporaryDirectory() as home:
            path = Path(home) / '.local/bin/agy'
            path.parent.mkdir(parents=True)
            path.write_text('#!/bin/sh\n')
            path.chmod(0o755)
            with patch.object(gemini.shutil, 'which', return_value=None), patch.object(gemini.Path, 'home', return_value=Path(home)):
                self.assertEqual(gemini._agy(), str(path))

    def test_multiline_refresh_roundtrip(self):
        with tempfile.TemporaryDirectory() as home, patch.dict(os.environ, QUOTACORE_HOME=home):
            payload = {'command': {'data': {'groups': [{'buckets': [
                {'id': 'session', 'window': '5h', 'remaining_fraction': .66}]}]}}}
            completed = type('Result', (), {'returncode': 0, 'stdout': json.dumps(payload, indent=2)})()
            with patch.object(gemini, '_agy', return_value='/fixture/agy'), patch.object(gemini.subprocess, 'run', return_value=completed) as run:
                self.assertEqual(gemini.refresh_gemini(), 0)
            self.assertEqual(run.call_args.args[0][1:], ['-p', '/usage', '--output-format', 'json'])
            result = gemini.read_snapshot()
            self.assertAlmostEqual(result['windows'][0]['used_percent'], 34)
            self.assertEqual(result['windows'][0]['window_minutes'], 300)
            self.assertEqual(result['source'], 'agy-usage')

    def test_refresh_failure_preserves_existing_snapshot(self):
        with tempfile.TemporaryDirectory() as home, patch.dict(os.environ, QUOTACORE_HOME=home):
            path = Path(home) / 'gemini-kota.json'
            path.write_text('{"fixture": true}')
            completed = type('Result', (), {'returncode': 1, 'stdout': ''})()
            with patch.object(gemini, '_agy', return_value='agy'), patch.object(gemini.subprocess, 'run', return_value=completed):
                self.assertNotEqual(gemini.refresh_gemini(), 0)
            self.assertEqual(path.read_text(), '{"fixture": true}')
