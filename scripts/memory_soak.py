"""Linux native regression: synthetic providers, isolated state, bounded app scope.

On Linux pass an unused display, e.g. --monitor eDP-1. For settings cycles also
set AI_USAGE_SETTINGS_TEST_POSITION=x,y to logical coordinates on that display.
"""
import argparse
import ctypes
import datetime as dt
import json
import os
from pathlib import Path
import select
import struct
import subprocess
import tempfile
import time

from soak_metrics import memory_metrics, check_memory

parser = argparse.ArgumentParser()
parser.add_argument('--binary', type=Path, default=Path('app/src-tauri/target/debug/ai-usage'))
parser.add_argument('--monitor', help='Use an unused Linux display, e.g. eDP-1; connector/model+geometry name or legacy index')
parser.add_argument('--output', type=Path, help='Optional synthetic measurements and logs directory')
parser.add_argument('--settings-cycles', type=int, choices=range(1, 5), default=0, help='Debug binary only: open/close settings and coalesce 20 monitor events per cycle')
parser.add_argument('--long', action='store_true', help='Observe 960 seconds, more than two 300-second collector cycles')
parser.add_argument('--watcher-unavailable', action='store_true', help='Debug build: disable native watcher; requires --long')
args = parser.parse_args()
if args.watcher_unavailable and not args.long:
    parser.error('--watcher-unavailable requires --long')
duration = 960 if args.long else 120

binary = args.binary.resolve(strict=True)
libc = ctypes.CDLL(None, use_errno=True)
libc.inotify_init1.argtypes = [ctypes.c_int]
libc.inotify_add_watch.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_uint32]
unit = f'ai-usage-soak-{os.getpid()}.scope'
with tempfile.TemporaryDirectory(prefix='ai-usage-soak-') as temporary:
    root = Path(temporary)
    home = root / 'home'
    state = root / 'state'
    config = root / 'config'
    for path in (home, state, config / 'ai-usage'):
        path.mkdir(parents=True)
    (state / 'config.json').write_text(json.dumps({'initialized': True, 'providers': {
        key: {'enabled': True} for key in ('claude', 'codex', 'gemini')}}))
    settings = {'appearance': 'dark', 'palette': 'signal-orange', 'accent': None, 'background': None,
                'widgetOpacity': 100, 'backgroundOpacity': 100, 'position': 'Top right',
                'linux': {'layer': 'top', 'margin': 16, 'monitor': None}}
    if args.monitor:
        settings['linux']['monitor'] = int(args.monitor) if args.monitor.isdigit() else args.monitor
    (config / 'ai-usage/settings.json').write_text(json.dumps(settings))
    fixture = json.loads(Path('app/src/sample-snapshot.json').read_text())
    def replace_snapshot(sequence):
        fixture['generated_at'] = dt.datetime.now(dt.timezone.utc).isoformat()
        for p in fixture['providers']:
            p['state'] = 'OK'
            p['stale'] = False
            for window in p.get('windows', []):
                window['used_percent'] = sequence * 11 % 100
        pending = state / 'pending.json'
        pending.write_text(json.dumps(fixture))
        os.replace(pending, state / 'snapshot.json')
        return fixture['generated_at']
    replace_snapshot(0)
    fd = libc.inotify_init1(os.O_NONBLOCK | os.O_CLOEXEC)
    if fd < 0 or libc.inotify_add_watch(fd, os.fsencode(state), 0x20) < 0:
        raise OSError(ctypes.get_errno(), 'inotify setup')
    env = dict({key: value for key, value in os.environ.items() if not key.startswith("QUOTACORE_")}, HOME=str(home), XDG_CONFIG_HOME=str(config), XDG_DATA_HOME=str(root / 'data'),
               XDG_CACHE_HOME=str(root / 'cache'), XDG_STATE_HOME=str(root / 'xdg-state'),
               QUOTACORE_HOME=str(state), AI_USAGE_SNAPSHOT_TRACE='1', PATH='/usr/bin:/bin')
    env.pop('AI_USAGE_SOAK_NO_WATCHER', None)
    if args.watcher_unavailable:
        env['AI_USAGE_SOAK_NO_WATCHER'] = '1'
    if args.settings_cycles:
        env['AI_USAGE_SETTINGS_SOAK_CYCLES'] = str(args.settings_cycles)
    # Scope properties are mandatory. Do not fall back to a direct launch on failure.
    command = ['systemd-run', '--user', '--scope', f'--unit={unit}', '-p', 'MemoryMax=1500M',
               '-p', 'MemorySwapMax=0', 'timeout', '--signal=TERM', '--kill-after=3s', f'{duration + 5}s', str(binary)]
    log_path = root / 'app.log'
    samples, changes, latencies = [], {}, {}
    opens = 0
    try:
        with log_path.open('w') as log:
            process = subprocess.Popen(command, env=env, stdout=log, stderr=log)
            started = time.monotonic()
            cgroup = None
            next_sample = 0
            while time.monotonic() - started < duration:
                elapsed = time.monotonic() - started
                if process.poll() is not None:
                    raise RuntimeError(f'Application/scope exited early: {process.returncode}\n{log_path.read_text()}')
                if cgroup is None:
                    result = subprocess.run(['systemctl', '--user', 'show', unit, '-p', 'ControlGroup', '--value'], capture_output=True, text=True)
                    if result.returncode == 0 and result.stdout.strip():
                        cgroup = Path('/sys/fs/cgroup') / result.stdout.strip().lstrip('/')
                if elapsed >= next_sample and cgroup:
                    memory = int((cgroup / 'memory.current').read_text())
                    # Scope membership excludes unrelated user WebKit processes. Capture
                    # only PID/PPID/comm/RSS, never command lines or environment.
                    pids = set()
                    for path in [cgroup / 'cgroup.procs', *cgroup.glob('**/cgroup.procs')]:
                        try:
                            pids.update(path.read_text().split())
                        except FileNotFoundError:
                            pass
                    rows = []
                    if pids:
                        listing = subprocess.run(['ps', '-p', ','.join(sorted(pids)), '-o',
                                                  'pid=,ppid=,comm=,rss='], capture_output=True, text=True)
                        for line in listing.stdout.splitlines():
                            pid, ppid, name, rss = line.split()
                            rows.append({'pid': int(pid), 'ppid': int(ppid), 'name': name, 'rss_kib': int(rss)})
                    samples.append({'seconds': round(elapsed, 2), 'bytes': memory, 'processes': rows,
                                    'webkit_webprocess_count': sum('WebKitWeb' in row['name'] for row in rows)})
                    print(f'{elapsed:6.1f}s {memory / 1048576:8.2f} MiB', flush=True)
                    next_sample += 10
                for second in ((40, 340, 640) if args.long else (40, 60, 80)):
                    if elapsed >= second and second not in changes:
                        changes[second] = (replace_snapshot(second // 20), time.monotonic())
                trace = log_path.read_text()
                for second, (stamp, changed_at) in changes.items():
                    if second not in latencies and f'snapshot-rendered {stamp}' in trace:
                        latencies[second] = time.monotonic() - changed_at
                if select.select([fd], [], [], 0.1)[0]:
                    data = os.read(fd, 65536)
                    offset = 0
                    while offset < len(data):
                        _, mask, _, length = struct.unpack_from('iIII', data, offset)
                        name = data[offset + 16:offset + 16 + length].split(b'\0')[0]
                        if mask & 0x4000:
                            raise RuntimeError('inotify queue overflow')
                        if mask & 0x20 and name == b'snapshot.json':
                            opens += 1
                        offset += 16 + length
            metrics = memory_metrics(samples, args.settings_cycles)
            result = {'samples': samples, **metrics, 'snapshot_opens': opens,
                      'render_latency_seconds': latencies, 'providers': ['claude', 'codex', 'gemini'],
                      'settings_created': trace.count('settings-soak-created'),
                      'settings_reused': trace.count('settings-soak-reused'),
                      'settings_opened': trace.count('settings-soak-open '),
                      'settings_closed': trace.count('settings-soak-close '),
                      'duration_seconds': duration, 'watcher_unavailable': args.watcher_unavailable,
                      'monitor_bursts': args.settings_cycles,
                      'monitor_applied': trace.count('monitor-soak-applied')}
            print(json.dumps(result, indent=2), flush=True)
            if args.output:
                args.output.mkdir(parents=True, exist_ok=True)
                (args.output / 'measurements.json').write_text(json.dumps(result, indent=2))
                (args.output / 'app.log').write_text(trace)
            if args.settings_cycles:
                assert result['settings_created'] == 1, 'Settings webview recreated or warm-up missing'
                assert result['settings_reused'] == args.settings_cycles, 'Settings webview reuse missing'
                assert result['settings_opened'] == args.settings_cycles, 'Settings open cycle missing (requires debug binary)'
                assert result['settings_closed'] == args.settings_cycles, 'Settings close cycle missing'
                assert result['monitor_applied'] == args.settings_cycles, 'Monitor event debounce did not coalesce each burst'
            if args.watcher_unavailable:
                assert 'snapshot-watcher-disabled' in trace, 'Watcher failure hook missing (requires debug build)'
            check_memory(samples, metrics)
            assert 3 <= opens <= (100 if args.long else 35), f'Unexpected snapshot read volume: {opens}'
            assert len(latencies) == 3 and max(latencies.values()) <= (310 if args.watcher_unavailable else 2), 'UI render missing or exceeds recovery deadline'
            print('PASS: memory, snapshot reads, all three native UI acknowledgements', flush=True)
    finally:
        subprocess.run(['systemctl', '--user', 'stop', unit], capture_output=True)
        if 'process' in locals():
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        os.close(fd)
