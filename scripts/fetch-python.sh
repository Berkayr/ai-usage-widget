#!/usr/bin/env bash
# Build-time preparation only. No downloads occur when the application starts.
set -euo pipefail
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_tmp="$(mktemp -d)"
trap 'rm -rf -- "$runtime_tmp"' EXIT
runtime_url="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["url"])' "$repo_root/scripts/python-runtime.json")"
curl --fail --location --proto '=https' --tlsv1.2 --retry 3 --connect-timeout 20 --max-time 300 "$runtime_url" -o "$runtime_tmp/python.zip"
python3 - "$repo_root" "$runtime_tmp" <<'PY'
import hashlib, json, pathlib, shutil, sys, zipfile
root, staging = map(pathlib.Path, sys.argv[1:])
pin = json.loads((root / 'scripts/python-runtime.json').read_text())
archive = staging / 'python.zip'
if hashlib.sha256(archive.read_bytes()).hexdigest() != pin['sha256']:
    raise SystemExit('Python SHA-256 mismatch; refusing to extract')
with zipfile.ZipFile(archive) as z:
    for info in z.infolist():
        name = pathlib.PurePosixPath(info.filename.replace('\\', '/'))
        if name.is_absolute() or '..' in name.parts or ':' in str(name) or info.external_attr >> 16 & 0o170000 == 0o120000:
            raise SystemExit('Unsafe Python archive member')
    z.extractall(staging / 'python')
# _pth entries are relative to python.exe. The parent is Tauri's resource dir.
(staging / 'python/python313._pth').write_text('python313.zip\n.\n..\n# import site\n', encoding='ascii')
for name in ('python.exe', 'python313.dll', 'python313.zip', 'LICENSE.txt'):
    if not (staging / 'python' / name).is_file():
        raise SystemExit('Incomplete Python archive')
destination = root / 'app/src-tauri/python'
if destination.exists():
    shutil.rmtree(destination)
shutil.copytree(staging / 'python', destination)
print(f"Verified Python {pin['version']} SHA-256: {pin['sha256']}")
print(f'Extracted runtime: {sum(p.stat().st_size for p in destination.rglob("*") if p.is_file())} bytes')
PY
