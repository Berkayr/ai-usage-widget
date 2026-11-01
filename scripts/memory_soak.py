"""Linux native regression: synthetic providers, isolated state, bounded app scope."""
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

parser = argparse.ArgumentParser()
parser.add_argument('--binary', type=Path, default=Path('app/src-tauri/target/debug/ai-quota-widget'))
parser.add_argument('--monitor', help='Connector/model+geometry name or legacy numeric index')
parser.add_argument('--output', type=Path, help='Optional synthetic measurements and logs directory')
args = parser.parse_args()
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
    for path in (home, state, config / 'ai-quota-widget'):
        path.mkdir(parents=True)
    (state / 'config.json').write_text(json.dumps({'initialized': True, 'providers': {
        key: {'enabled': True} for key in ('claude', 'codex', 'gemini')}}))
    settings = {'appearance': 'dark', 'palette': 'signal-orange', 'accent': None, 'background': None,
                'widgetOpacity': 100, 'backgroundOpacity': 100, 'position': 'Top right',
                'linux': {'layer': 'top', 'margin': 16, 'monitor': None}}
    if args.monitor:
        settings['linux']['monitor'] = int(args.monitor) if args.monitor.isdigit() else args.monitor
    (config / 'ai-quota-widget/settings.json').write_text(json.dumps(settings))
    fixture = json.loads(Path('app/src/sample-snapshot.json').read_text())
    def replace_snapshot(sequence):
        fixture['generated_at'] = dt.datetime.now(dt.timezone.utc).isoformat()
        for p in fixture['providers']:
            p['state'] = 'OK'
            p['stale'] = False
            for window in p.get('windows', []):
                window['used_percent'] = sequence * 11
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
    # Scope properties are mandatory. Do not fall back to a direct launch on failure.
    command = ['systemd-run', '--user', '--scope', f'--unit={unit}', '-p', 'MemoryMax=1500M',
               '-p', 'MemorySwapMax=0', 'timeout', '--signal=TERM', '--kill-after=3s', '125s', str(binary)]
    log_path = root / 'app.log'
    samples, changes, latencies = [], {}, {}
    opens = 0
    try:
        with log_path.open('w') as log:
            process = subprocess.Popen(command, env=env, stdout=log, stderr=log)
            started = time.monotonic()
            cgroup = None
            next_sample = 0
            while time.monotonic() - started < 120:
                elapsed = time.monotonic() - started
                if process.poll() is not None:
                    raise RuntimeError(f'Application/scope exited early: {process.returncode}\n{log_path.read_text()}')
                if cgroup is None:
                    result = subprocess.run(['systemctl', '--user', 'show', unit, '-p', 'ControlGroup', '--value'], capture_output=True, text=True)
                    if result.returncode == 0 and result.stdout.strip():
                        cgroup = Path('/sys/fs/cgroup') / result.stdout.strip().lstrip('/')
                if elapsed >= next_sample and cgroup:
                    memory = int((cgroup / 'memory.current').read_text())
                    samples.append({'seconds': round(elapsed, 2), 'bytes': memory})
                    print(f'{elapsed:6.1f}s {memory / 1048576:8.2f} MiB', flush=True)
                    next_sample += 10
                for second in (40, 60, 80):
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
            stable = [s['bytes'] for s in samples if s['seconds'] >= 30]
            growth = max(stable) - min(stable)
            result = {'samples': samples, 'growth_after_30_bytes': growth, 'snapshot_opens': opens,
                      'render_latency_seconds': latencies, 'providers': ['claude', 'codex', 'gemini']}
            print(json.dumps(result, indent=2), flush=True)
            if args.output:
                args.output.mkdir(parents=True, exist_ok=True)
                (args.output / 'measurements.json').write_text(json.dumps(result, indent=2))
                (args.output / 'app.log').write_text(trace)
            assert len(stable) >= 8 and growth < 20 * 1048576, 'Memory growth >=20 MiB after 30s'
            assert 3 <= opens <= 35, f'Unexpected snapshot read volume: {opens}'
            assert len(latencies) == 3 and max(latencies.values()) <= 2, 'UI render missing or >2s'
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
