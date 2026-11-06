import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "install.sh"


class InstallScriptTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.home = self.root / "home"
        self.home.mkdir()
        self.source = self.root / "source"
        self.source.mkdir()
        self.path = self.root / "bin"
        self.path.mkdir()
        self.calls = self.root / "calls"
        for name in ("sudo", "apt", "dnf", "ldconfig", "cp"):
            executable = self.path / name
            if name == "sudo":
                body = f"#!/bin/sh\nprintf '%s\\n' 'sudo $*' >> '{self.calls}'\nexec \"$@\"\n"
            elif name == "cp":
                body = f"#!/bin/sh\nprintf '%s\\n' 'cp $*' >> '{self.calls}'\nexec /bin/cp \"$@\"\n"
            else:
                body = f"#!/bin/sh\nprintf '%s\\n' '{name} $*' >> '{self.calls}'\n"
            executable.write_text(body)
            executable.chmod(0o755)
        self.env = {**os.environ, "HOME": str(self.home), "PATH": f"{self.path}:/usr/bin:/bin"}

    def tearDown(self):
        self.tmp.cleanup()

    def package(self, filename):
        payload = self.source / filename
        payload.write_text("synthetic package")
        digest = hashlib.sha256(payload.read_bytes()).hexdigest()
        (self.source / "SHA256SUMS.txt").write_text(f"{digest}  {filename}\n")

    def package_with_extra(self, filename):
        self.package(filename)
        extra = self.source / "windows-x86_64-installer.exe"
        extra.write_text("must not be copied")
        digest = hashlib.sha256(extra.read_bytes()).hexdigest()
        with (self.source / "SHA256SUMS.txt").open("a") as sums:
            sums.write(f"{digest}  {extra.name}\n")

    def run_script(self, *args):
        return subprocess.run(["sh", str(SCRIPT), *map(str, args)], env=self.env, text=True, capture_output=True)

    def test_appimage_installs_files(self):
        self.package("linux-x86_64-ai-usage_0.1.0_amd64.AppImage")
        result = self.run_script("--from-dir", self.source)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.home / ".local/bin/ai-usage.AppImage").exists())
        self.assertTrue((self.home / ".local/share/applications/ai-usage.desktop").exists())
        self.assertFalse((self.home / ".local/share/icons/hicolor/128x128/apps/ai-usage.svg").exists())
        self.assertFalse((self.home / ".local/share/icons/hicolor/128x128/apps/ai-usage.png").exists())

    def launch_from_menu(self, home, fuse):
        """Install a fixture under home and open its entry with a real desktop reader."""
        marker = self.root / "launch.json"
        marker.unlink(missing_ok=True)
        name = "linux-x86_64-ai-usage_0.1.0_amd64.AppImage"
        (self.source / name).write_text(
            f"#!{sys.executable}\nimport json, os, sys\n"
            "if sys.argv[1:] == ['--appimage-extract']: sys.exit(1)\n"
            f"json.dump([sys.argv, os.environ.get('APPIMAGE_EXTRACT_AND_RUN')], open({str(marker)!r}, 'w'))\n"
        )
        digest = hashlib.sha256((self.source / name).read_bytes()).hexdigest()
        (self.source / "SHA256SUMS.txt").write_text(f"{digest}  {name}\n")
        ldconfig = self.path / "ldconfig"
        ldconfig.write_text("#!/bin/sh\necho 'libfuse.so.2 (libc6,x86-64) => /fake'\n" if fuse else "#!/bin/sh\n")
        home.mkdir(parents=True, exist_ok=True)
        env = {**self.env, "HOME": str(home)}
        result = subprocess.run(["sh", str(SCRIPT), "--from-dir", str(self.source)], env=env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        subprocess.run(["gio", "launch", str(home / ".local/share/applications/ai-usage.desktop")], env=env, check=True, capture_output=True)
        for _ in range(100):
            if marker.exists() and marker.read_text():
                return json.loads(marker.read_text()), home / ".local/bin/ai-usage.AppImage"
            time.sleep(0.05)
        self.fail(f"menu entry did not start the app under {home!r}")

    @unittest.skipUnless(shutil.which("gio"), "gio is the desktop entry reader")
    def test_menu_entry_opens_app_under_unusual_home_paths(self):
        for label in ("normal", "with space", "per%cent", "dollar$HOME", "back`tick", "quo'te", 'dou"ble', "back\\slash"):
            for fuse in (True, False):
                with self.subTest(label=label, fuse=fuse):
                    (argv, extract), app = self.launch_from_menu(self.root / "homes" / label, fuse)
                    self.assertEqual(argv, [str(app)])
                    self.assertEqual(extract, None if fuse else "1")

    def test_unsupported_home_is_refused_before_writing(self):
        self.package("linux-x86_64-ai-usage_0.1.0_amd64.AppImage")
        for name in ("line\nbreak", "equals=sign"):
            with self.subTest(name=name):
                home = self.root / name
                home.mkdir()
                self.env["HOME"] = str(home)
                result = self.run_script("--from-dir", self.source)
                self.assertEqual(result.returncode, 1)
                self.assertEqual(list(home.iterdir()), [])

    def test_deb_and_rpm_use_package_managers(self):
        for filename, manager in (("linux-x86_64-ai-usage.deb", "apt"), ("linux-x86_64-ai-usage.rpm", "dnf")):
            for path in self.source.iterdir():
                path.unlink()
            self.package(filename)
            result = self.run_script("--from-dir", self.source)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(manager, self.calls.read_text())

    def test_bad_checksum_leaves_no_installation(self):
        self.package("linux-x86_64-ai-usage.AppImage")
        (self.source / "SHA256SUMS.txt").write_text("0" * 64 + "  linux-x86_64-ai-usage.AppImage\n")
        result = self.run_script("--from-dir", self.source)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.home / ".local").exists())

    def test_uninstall_removes_appimage_files(self):
        self.package("linux-x86_64-ai-usage.AppImage")
        self.assertEqual(self.run_script("--from-dir", self.source).returncode, 0)
        self.assertEqual(self.run_script("--uninstall").returncode, 0)
        self.assertFalse((self.home / ".local/bin/ai-usage.AppImage").exists())
        self.assertFalse((self.home / ".local/share/applications/ai-usage.desktop").exists())
        self.assertEqual([path for path in self.home.rglob("*") if path.is_file()], [])

    def test_only_selected_file_is_copied(self):
        self.package_with_extra("linux-x86_64-ai-usage_0.1.0_amd64.AppImage")
        result = self.run_script("--from-dir", self.source)
        self.assertEqual(result.returncode, 0, result.stderr)
        copied = [line for line in self.calls.read_text().splitlines() if line.startswith("cp ")]
        self.assertEqual(len(copied), 2)
        self.assertTrue(all("windows-x86_64-installer.exe" not in line for line in copied))

    def test_missing_checksum_entry_aborts(self):
        self.package("linux-x86_64-ai-usage_0.1.0_amd64.AppImage")
        (self.source / "SHA256SUMS.txt").write_text("0" * 64 + "  some-other-file\n")
        result = self.run_script("--from-dir", self.source)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.home / ".local" / "bin").exists())

    def test_uninstall_leaves_no_installed_files_in_temp_home(self):
        package = self.source / "linux-x86_64-ai-usage.AppImage"
        package.write_text("#!/bin/sh\nmkdir -p squashfs-root/usr/share/icons/hicolor/32x32/apps squashfs-root/usr/share/icons/hicolor/128x128/apps\nprintf 'small' > squashfs-root/usr/share/icons/hicolor/32x32/apps/ai-usage.png\nprintf 'large' > squashfs-root/usr/share/icons/hicolor/128x128/apps/ai-usage.png\n")
        package.chmod(0o755)
        digest = hashlib.sha256(package.read_bytes()).hexdigest()
        (self.source / "SHA256SUMS.txt").write_text(f"{digest}  {package.name}\n")
        self.assertEqual(self.run_script("--from-dir", self.source).returncode, 0)
        installed_icon = self.home / ".local/share/icons/hicolor/128x128/apps/ai-usage.png"
        self.assertEqual(installed_icon.read_text(), "large")
        self.assertEqual(self.run_script("--uninstall").returncode, 0)
        self.assertFalse((self.home / ".local/bin/ai-usage.AppImage").exists())
        self.assertFalse((self.home / ".local/share/applications/ai-usage.desktop").exists())

    def test_icon_falls_back_when_128_icon_is_missing(self):
        package = self.source / "linux-x86_64-ai-usage.AppImage"
        package.write_text("#!/bin/sh\nmkdir -p squashfs-root/usr/share/icons/hicolor/32x32/apps\nprintf 'small' > squashfs-root/usr/share/icons/hicolor/32x32/apps/ai-usage.png\n")
        package.chmod(0o755)
        digest = hashlib.sha256(package.read_bytes()).hexdigest()
        (self.source / "SHA256SUMS.txt").write_text(f"{digest}  {package.name}\n")
        result = self.run_script("--from-dir", self.source)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.home / ".local/share/icons/hicolor/128x128/apps/ai-usage.png").read_text(), "small")

    def test_install_message_has_correct_uninstall_command(self):
        self.package("linux-x86_64-ai-usage.AppImage")
        result = self.run_script("--from-dir", self.source)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("curl -fsSL https://raw.githubusercontent.com/Berkayr/ai-usage-widget/main/scripts/install.sh | sh -s -- --uninstall", result.stdout)
        self.assertNotIn("not on PATH", result.stdout)

    def test_icon_extraction_failure_still_installs(self):
        package = self.source / "linux-x86_64-ai-usage.AppImage"
        package.write_text("#!/bin/sh\nexit 1\n")
        package.chmod(0o755)
        digest = hashlib.sha256(package.read_bytes()).hexdigest()
        (self.source / "SHA256SUMS.txt").write_text(f"{digest}  {package.name}\n")
        result = self.run_script("--from-dir", self.source)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.home / ".local/bin/ai-usage.AppImage").exists())
        self.assertTrue((self.home / ".local/share/applications/ai-usage.desktop").exists())


if __name__ == "__main__":
    unittest.main()
