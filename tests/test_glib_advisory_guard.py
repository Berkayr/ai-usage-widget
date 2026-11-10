"""Guard for GHSA-wrw7-89jp-8q8g (glib < 0.20, VariantStrIter unsound).

Tauri's GTK3 stack pins glib 0.18. The unsound code is only reached through
Variant::array_iter_str / VariantStrIter, so our own code must never call it.
shortcut: remove this guard once Tauri ships on glib >= 0.20 (GTK4).
"""
import pathlib
import unittest

SRC = pathlib.Path(__file__).resolve().parents[1] / "app" / "src-tauri" / "src"


class GlibAdvisoryGuard(unittest.TestCase):
    def test_no_variant_str_iter_calls(self):
        hits = [
            f"{path.relative_to(SRC)}:{number}"
            for path in SRC.rglob("*.rs")
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1)
            if "array_iter_str" in line or "VariantStrIter" in line
        ]
        self.assertEqual(hits, [], "glib 0.18 VariantStrIter is unsound; read strings with Variant::get instead")


if __name__ == "__main__":
    unittest.main()
