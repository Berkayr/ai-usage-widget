#!/usr/bin/env python3
"""Fail closed if an AUR draft still lacks verified SHA-256 checksums."""
import re
import sys
from pathlib import Path

paths = [Path(p) for p in sys.argv[1:]] or sorted((Path(__file__).parent / "aur").glob("PKGBUILD*"))
failed = False
for path in paths:
    content = path.read_text(encoding="utf-8")
    match = re.search(r"^sha256sums=\(([^)]*)\)", content, re.M)
    values = re.findall(r"['\"]([^'\"]+)['\"]", match[1]) if match else []
    if not values or any(not re.fullmatch(r"[a-fA-F0-9]{64}", value) for value in values):
        print(f"Release blocked: {path.name} needs verified 64-digit SHA-256 checksums", file=sys.stderr)
        failed = True
raise SystemExit(1 if failed else 0)
