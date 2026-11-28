#!/usr/bin/env python3
"""Bounded Linux footprint measurement; never uses the user's quota/settings.

RSS includes shared pages multiple times; PSS apportions them. Context switches
are a wakeup proxy, not a hardware interrupt counter. CPU uses the entire cgroup.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import statistics
import shutil
import hashlib
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]


def read_sample(group):
    pids = sorted({int(pid) for file in group.rglob('cgroup.procs') for pid in file.read_text().split()})
    processes = []
    skipped = 0
    for pid in pids:
        try:
            proc = Path('/proc') / str(pid)
            mem = dict(line.split(':', 1) for line in (proc / 'smaps_rollup').read_text().splitlines() if ':' in line)
            status = dict(line.split(':', 1) for line in (proc / 'status').read_text().splitlines() if ':' in line)
            # Include every thread: WebKit schedules work outside its main thread.
            switches = 0
            for task in (proc / 'task').iterdir():
                try:
                    fields = dict(line.split(':', 1) for line in (task / 'status').read_text().splitlines() if ':' in line)
                    switches += int(fields['voluntary_ctxt_switches'])
                except (OSError, KeyError):
                    pass
            processes.append({'pid': pid, 'ppid': int(status['PPid']), 'name': status['Name'].strip(),
                              'rss_bytes': int(mem['Rss'].split()[0]) * 1024,
                              'pss_bytes': int(mem['Pss'].split()[0]) * 1024, 'voluntary_switches': switches})
        except (OSError, KeyError, ValueError):
            skipped += 1
            continue
    cpu = dict(line.split() for line in (group / 'cpu.stat').read_text().splitlines())
    return {'memory_bytes': int((group / 'memory.current').read_text()), 'cpu_usec': int(cpu['usage_usec']),
            'rss_bytes': sum(p['rss_bytes'] for p in processes), 'pss_bytes': sum(p['pss_bytes'] for p in processes),
            'pids_total': len(pids), 'pids_skipped': skipped, 'processes': processes}


def measure(binary, enabled, duration, monitor=None):
    unit = f'ai-usage-footprint-{os.getpid()}-{os.urandom(4).hex()}.scope'
    with tempfile.TemporaryDirectory(prefix='ai-usage-footprint-') as tmp:
        root = Path(tmp)
        for name in ('home', 'config/ai-usage', 'state', 'data', 'cache'):
            (root / name).mkdir(parents=True)
        ids = ('claude', 'codex', 'gemini', 'copilot', 'openrouter', 'deepseek', 'jetbrains')
        (root / 'state/config.json').write_text(json.dumps({'initialized': True, 'providers': {
            key: {'enabled': enabled and key == 'gemini'} for key in ids}}))
        fixture = json.loads((ROOT / 'app/src/sample-snapshot.json').read_text())
        (root / 'state/snapshot.json').write_text(json.dumps(fixture))
        # Enabled scenario exercises the passive Gemini adapter with synthetic data.
        # No provider CLI, credentials or network are needed.
        gemini = next(p for p in fixture['providers'] if p['id'] == 'gemini')
        gemini['captured_at'] = datetime.now(timezone.utc).isoformat()
        (root / 'state/gemini-kota.json').write_text(json.dumps(gemini))
        cli = root / 'home/.local/bin/agy'
        cli.parent.mkdir(parents=True)
        cli.write_text('#!/bin/sh\nexit 1\n')
        cli.chmod(0o700)
        (root / 'config/ai-usage/settings.json').write_text(json.dumps({
            'linux': {'layer': 'bottom', 'monitor': int(monitor) if monitor and monitor.isdigit() else monitor}, 'position': 'Top right'}))
        allowed = ('DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS',
                   'XDG_SESSION_TYPE', 'GDK_BACKEND', 'LANG', 'XAUTHORITY')
        env = {key: os.environ[key] for key in allowed if key in os.environ}
        env.update(HOME=str(root / 'home'), XDG_CONFIG_HOME=str(root / 'config'), XDG_DATA_HOME=str(root / 'data'),
                   XDG_CACHE_HOME=str(root / 'cache'), XDG_STATE_HOME=str(root / 'xdg-state'),
                   QUOTACORE_HOME=str(root / 'state'), PATH='/usr/bin:/bin', AI_USAGE_SNAPSHOT_TRACE='1')
        original_size = binary.stat().st_size
        original_hash = hashlib.sha256(binary.read_bytes()).hexdigest()
        executable = binary
        if binary.suffix.lower() == '.appimage':
            executable = root / binary.name
            shutil.copy2(binary, executable)
            env.update(APPIMAGE_EXTRACT_AND_RUN='1', TMPDIR=str(root / 'cache'))
        if binary.suffix.lower() != '.appimage':
            # Pin the executable and resources for the whole run. This also makes
            # no-bundle release binaries work without any machine installation.
            executable = root / 'bin' / binary.name
            executable.parent.mkdir()
            shutil.copy2(binary, executable)
            resources = binary.parent / 'quotacore'
            if not resources.is_dir():
                resources = ROOT / 'quotacore'
            product = json.loads((ROOT / 'app/src-tauri/tauri.conf.json').read_text())['mainBinaryName']
            destination = root / 'lib' / product / 'quotacore'
            shutil.copytree(resources, destination, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
        command = ['systemd-run', '--user', '--scope', f'--unit={unit}', '-p', 'MemoryMax=1500M',
                   '-p', 'MemorySwapMax=0', 'timeout', '--signal=TERM', '--kill-after=3s', f'{duration+10}s', str(executable)]
        samples = []
        with (root / 'app.log').open('w') as log:
            child = subprocess.Popen(command, env=env, stdout=log, stderr=log)
            start = time.monotonic()
            first_render = None
            try:
                while time.monotonic() - start < duration:
                    if child.poll() is not None:
                        raise RuntimeError(f'Scope exited {child.returncode}: {(root / "app.log").read_text()}')
                    elapsed = time.monotonic() - start
                    trace = (root / 'app.log').read_text()
                    if first_render is None and 'snapshot-rendered ' in trace:
                        first_render = round(elapsed, 3)
                    info = subprocess.run(['systemctl', '--user', 'show', unit, '-p', 'ControlGroup', '--value'],
                                          capture_output=True, text=True, check=True).stdout.strip()
                    if info:
                        sample = read_sample(Path('/sys/fs/cgroup') / info.lstrip('/'))
                        sample['seconds'] = round(elapsed, 3)
                        samples.append(sample)
                    time.sleep(1 if elapsed < 10 else 5)
                stable = [s for s in samples if s['seconds'] >= 30]
                if len(stable) < 2 or first_render is None:
                    raise RuntimeError(f'No stable rendered UI: {(root / "app.log").read_text()}')
                active = json.loads((root / 'state/snapshot.json').read_text())
                if not enabled and any(p['state'] != 'DISABLED' for p in active['providers']):
                    raise RuntimeError('Disabled-provider scenario did not run the collector')
                if enabled and not any(p['id'] == 'gemini' and p['state'] == 'OK' for p in active['providers']):
                    raise RuntimeError('Synthetic Gemini was not collected successfully')
                first, last = stable[0], stable[-1]
                before = {p['pid']: p for p in first['processes']}
                switches = sum(max(0, p['voluntary_switches'] - before.get(p['pid'], p)['voluntary_switches'])
                               for p in last['processes'])
                result = {'binary': binary.name, 'binary_bytes': original_size, 'binary_sha256': original_hash, 'providers_enabled': enabled,
                          'scenario': 'synthetic passive Gemini' if enabled else 'all disabled',
                          'duration_seconds': duration, 'first_render_seconds': first_render,
                          'idle_cpu_seconds': (last['cpu_usec']-first['cpu_usec'])/1e6,
                          'idle_cpu_percent': (last['cpu_usec']-first['cpu_usec'])/1e4/(last['seconds']-first['seconds']),
                          'idle_voluntary_switches_delta_surviving_processes': switches,
                          'idle_median': idle_median(stable),
                          'sample_coverage': {'stable': len(stable), 'complete': sum(1 for s in stable if not s['pids_skipped']),
                                              'skipped_pids': sum(s['pids_skipped'] for s in stable)},
                          'samples': samples}
                result['budget_failures'] = budget_failures(result, binary.suffix.lower() == '.appimage')
                return result
            finally:
                subprocess.run(['systemctl', '--user', 'stop', unit], capture_output=True)
                try:
                    child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()


def idle_median(stable):
    # A sample with an unreadable PID undercounts RSS/PSS, so only complete samples feed those medians.
    complete = [s for s in stable if not s['pids_skipped']]
    median = {'memory_bytes': statistics.median(s['memory_bytes'] for s in stable)}
    for key in ('rss_bytes', 'pss_bytes'):
        median[key] = statistics.median(s[key] for s in complete) if complete else None
    return median


def budget_failures(result, appimage=False):
    failures = []
    for key, value, limit in (
        ('idle CPU percent', result['idle_cpu_percent'], 0.1),
        ('first render seconds', result['first_render_seconds'], 5),
        ('idle cgroup bytes', result['idle_median']['memory_bytes'], 250 * 1024**2),
    ):
        if key == 'idle cgroup bytes' and appimage:
            continue
        if value > limit:
            failures.append(f'{key}: {value} > {limit}')
    return failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', action='append', type=Path, help='Repeat for debug/release/AppImage')
    parser.add_argument('--duration', type=int, default=180)
    parser.add_argument('--scenario', choices=('both', 'off', 'on'), default='both')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--monitor', help='Linux connector name or legacy index')
    args = parser.parse_args()
    if args.duration < 40:
        parser.error('At least 40 seconds required (30 second warmup)')
    binaries = args.binary or [p for p in (ROOT / 'app/src-tauri/target/debug/ai-usage',
                                         ROOT / 'app/src-tauri/target/release/ai-usage',
                                         *sorted((ROOT / 'app/src-tauri/target/release/bundle/appimage').glob('*.AppImage')))
                              if p.is_file() and p.stat().st_size > 0]
    if not binaries:
        parser.error('No binaries found')
    results = []
    for binary in binaries:
        for enabled in ([False, True] if args.scenario == 'both' else [args.scenario == 'on']):
            result = measure(binary.resolve(strict=True), enabled, args.duration, args.monitor)
            results.append(result)
            print(json.dumps({k: v for k, v in result.items() if k != 'samples'}), flush=True)
            if args.output:
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(json.dumps(results, indent=2) + '\n')

    if any(result['budget_failures'] for result in results):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
