"""Security boundaries tested with fictional inputs and temporary state only."""
import contextlib
import io
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import time
import unittest
from unittest import mock

from quotacore import __main__ as cli
from quotacore import hooks
from quotacore.history import append_history, MAX_BYTES
from quotacore.paths import atomic_json, config_dir, data_path, load_config, normalize_config
from quotacore.providers import PROVIDERS, common, claude


class SecurityTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        patch = mock.patch.dict(os.environ, {"QUOTACORE_HOME": temp.name})
        patch.start(); self.addCleanup(patch.stop)
        # No test calls real provider readers or detection.
        detect = mock.patch.object(cli, "detect_all", return_value={key: True for key in PROVIDERS})
        detect.start(); self.addCleanup(detect.stop)

    def readers(self):
        stack = contextlib.ExitStack()
        readers = {key: stack.enter_context(mock.patch.object(module, "read", return_value={"state":"OK"}))
                   for key, module in PROVIDERS.items()}
        self.addCleanup(stack.close)
        return readers

    def test_fresh_collection_never_reads_detected_providers(self):
        readers = self.readers()
        value = cli.collect()
        self.assertTrue(all(p["state"] == "DISABLED" for p in value["providers"]))
        for read in readers.values(): read.assert_not_called()

    def test_new_provider_does_not_inherit_detection(self):
        value = normalize_config({"providers":{"claude":{"enabled":True}}}, {key:True for key in PROVIDERS})
        self.assertTrue(value["providers"]["claude"]["enabled"])
        self.assertFalse(value["providers"]["codex"]["enabled"])

    def test_doctor_live_only_reads_enabled_providers(self):
        readers = self.readers()
        atomic_json(config_dir()/"config.json", {"initialized":True,"providers":{"claude":{"enabled":True}}})
        cli.doctor()
        for read in readers.values(): read.assert_not_called()
        cli.doctor(live=True)
        readers["claude"].assert_called_once()
        for key, read in readers.items():
            if key != "claude": read.assert_not_called()

    def test_doctor_does_not_report_cached_disabled_record_as_active(self):
        atomic_json(data_path("snapshot.json"), {"providers":[{"id":"claude","state":"OK"}]})
        self.assertEqual(cli.doctor()["providers"][0]["state"], "DISABLED")

    def test_init_and_configure_persist_explicit_choices(self):
        with mock.patch("builtins.input", side_effect=["y"] + ["n"]*(len(PROVIDERS)-1)), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cli.main(["init"]), 0)
        config = load_config()
        self.assertTrue(config["initialized"])
        self.assertEqual([k for k,v in config["providers"].items() if v["enabled"]], ["claude"])
        self.assertEqual(cli.main(["configure"]), 0)
        self.assertFalse(any(v["enabled"] for v in load_config()["providers"].values()))

    def test_initialization_false_overrides_enabled_fields(self):
        atomic_json(config_dir()/"config.json", {"initialized":False,"providers":{"claude":{"enabled":True}}})
        readers = self.readers()
        cli.collect(); cli.doctor(True)
        for read in readers.values(): read.assert_not_called()

    def test_detection_never_opens_api_key_file(self):
        # Call original detection function (the fixture patched its public name).
        with contextlib.ExitStack() as stack:
            for key,module in PROVIDERS.items():
                if key not in ("openrouter", "deepseek"):
                    stack.enter_context(mock.patch.object(module, "detect", return_value=True))
            stack.enter_context(mock.patch.object(common, "api_key", side_effect=AssertionError("secret read")))
            stack.enter_context(mock.patch("pathlib.Path.read_text", side_effect=AssertionError("file contents read")))
            original_detect()

    def test_private_json_and_history_permissions(self):
        atomic_json(self.root/"private.json", {"fixture":True})
        append_history(self.root/"history.jsonl", [{"generated_at":"2026-11-01T00:00:00Z"}])
        if os.name != "nt":
            for name in ("private.json", "history.jsonl"):
                self.assertEqual(stat.S_IMODE((self.root/name).stat().st_mode), 0o600)

    def test_permission_failure_does_not_publish_secret(self):
        with mock.patch("quotacore.privacy.restrict_file", side_effect=OSError("fixture ACL denial")):
            with self.assertRaises(OSError): atomic_json(self.root/"secret.json", {"key":"fictional"})
        self.assertFalse((self.root/"secret.json").exists())
        self.assertEqual(list(self.root.iterdir()), [])

    def test_history_retention_size_and_purge_do_not_collect(self):
        path = data_path("pace-log.jsonl")
        path.write_text(json.dumps({"generated_at":"2000-01-01T00:00:00Z"})+'\n')
        append_history(path, [{"generated_at":"2099-01-01T00:00:00Z", "fixture":"new"}])
        self.assertNotIn("2000",path.read_text())
        append_history(path, [{"fixture":"x"*1024} for _ in range(1100)])
        self.assertLessEqual(path.stat().st_size,MAX_BYTES)
        atomic_json(data_path("pace-state.json"),{})
        with mock.patch.object(cli,"collect",side_effect=AssertionError("collection")):
            cli.main(["pace","--purge"])
        self.assertFalse(path.exists()); self.assertFalse(data_path("pace-state.json").exists())

    def test_http_body_limit_and_exact_boundary(self):
        response = io.BytesIO(b"x"*common.MAX_HTTP_BYTES)
        self.assertEqual(len(common.read_response(response)),common.MAX_HTTP_BYTES)
        with self.assertRaises(ValueError): common.read_response(io.BytesIO(b"x"*(common.MAX_HTTP_BYTES+1)))
        with mock.patch.object(claude,"_oauth",return_value={"accessToken":"fictional"}), \
             mock.patch("urllib.request.build_opener") as opener:
            opener.return_value.open.return_value.__enter__.return_value = io.BytesIO(b"x"*(common.MAX_HTTP_BYTES+1))
            self.assertEqual(claude._live()[1],"SOURCE_UNAVAILABLE")

    def test_chain_arguments_are_literal_and_stdin_is_preserved(self):
        attack = "$(echo unsafe); & <tag>"
        command = [sys.executable,"-c","import sys;print(sys.argv[1]);print(sys.stdin.read())",attack]
        code, output = hooks._chain(command, "fictional raw hook")
        self.assertEqual(code,0)
        self.assertIn(attack.encode(),output); self.assertIn(b"fictional raw hook",output)

    def test_chain_timeout_and_output_cap(self):
        with mock.patch.object(hooks,"CHAIN_TIMEOUT",0.15):
            start=time.monotonic()
            code,_ = hooks._chain([sys.executable,"-c","import time;time.sleep(30)"],"")
            self.assertEqual(code,124); self.assertLess(time.monotonic()-start,3)
        code,output=hooks._chain([sys.executable,"-c","import sys;sys.stdout.write('x'*1000000)"],"")
        self.assertEqual(code,125); self.assertEqual(output,b"")

    def test_explicit_shell_and_invalid_legacy_string(self):
        code,output=hooks._chain("echo fictional", "", shell=True)
        self.assertEqual(code,0); self.assertIn(b"fictional",output)
        with mock.patch("sys.stdin",io.StringIO("{}")):
            self.assertEqual(hooks.run_hook("claude","echo unsafe"),2)

    def test_chain_waits_for_slow_stdin_close(self):
        original_popen = hooks.subprocess.Popen

        class SlowClose:
            def __init__(self, stream): self.stream = stream
            def write(self, value): return self.stream.write(value)
            def close(self):
                time.sleep(0.1)
                self.stream.close()

        def popen(*args, **kwargs):
            process = original_popen(*args, **kwargs)
            process.stdin = SlowClose(process.stdin)
            return process

        with mock.patch.object(hooks.subprocess, "Popen", side_effect=popen):
            code, output = hooks._chain("echo fictional", "", shell=True)
        self.assertEqual(code, 0)
        self.assertIn(b"fictional", output)

    def test_no_log_still_saves_private_state_without_history(self):
        with contextlib.redirect_stdout(io.StringIO()):
            cli._pace({"providers":[]}, no_log=True, mode="json")
        self.assertTrue(data_path("pace-state.json").exists())
        self.assertFalse(data_path("pace-log.jsonl").exists())

    def test_invalid_chain_cli_is_rejected(self):
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit): cli.main(["hook","claude","--chain-cmd",'"echo unsafe"'])

# Preserve the original function before setUp patches it.
original_detect = cli.detect_all

class WindowsAclTests(unittest.TestCase):
    @unittest.skipUnless(os.name == "nt", "Windows DACL runtime test")
    def test_secret_dacl_is_protected_and_has_one_current_user_entry(self):
        import ctypes as c
        from ctypes import wintypes as w
        from quotacore.privacy import restrict_file
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)/"fictional-secret.json"
            path.write_text("{}")
            restrict_file(path)
            adv = c.WinDLL("advapi32",use_last_error=True)
            kernel = c.WinDLL("kernel32",use_last_error=True)
            adv.GetNamedSecurityInfoW.argtypes = [w.LPWSTR,c.c_int,w.DWORD,w.LPVOID,w.LPVOID,c.POINTER(w.LPVOID),w.LPVOID,c.POINTER(w.LPVOID)]
            adv.GetSecurityDescriptorControl.argtypes = [w.LPVOID,c.POINTER(w.WORD),c.POINTER(w.DWORD)]
            kernel.LocalFree.argtypes = [w.LPVOID]
            class ACL(c.Structure):
                _fields_ = [("revision",w.BYTE),("reserved",w.BYTE),("size",w.WORD),("count",w.WORD),("reserved2",w.WORD)]
            acl, descriptor = w.LPVOID(), w.LPVOID()
            self.assertEqual(adv.GetNamedSecurityInfoW(str(path),1,4,None,None,c.byref(acl),None,c.byref(descriptor)),0)
            try:
                control,revision=w.WORD(),w.DWORD()
                self.assertTrue(adv.GetSecurityDescriptorControl(descriptor,c.byref(control),c.byref(revision)))
                self.assertTrue(control.value & 0x1000)  # SE_DACL_PROTECTED
                self.assertEqual(c.cast(acl,c.POINTER(ACL)).contents.count,1)
                adv.GetAce.argtypes=[w.LPVOID,w.DWORD,c.POINTER(w.LPVOID)]
                adv.OpenProcessToken.argtypes=[w.HANDLE,w.DWORD,c.POINTER(w.HANDLE)]
                adv.GetTokenInformation.argtypes=[w.HANDLE,c.c_int,w.LPVOID,w.DWORD,c.POINTER(w.DWORD)]
                adv.EqualSid.argtypes=[w.LPVOID,w.LPVOID]
                kernel.GetCurrentProcess.restype=w.HANDLE
                kernel.CloseHandle.argtypes=[w.HANDLE]
                ace,token=w.LPVOID(),w.HANDLE()
                self.assertTrue(adv.GetAce(acl,0,c.byref(ace)))
                self.assertTrue(adv.OpenProcessToken(kernel.GetCurrentProcess(),8,c.byref(token)))
                try:
                    size=w.DWORD()
                    adv.GetTokenInformation(token,1,None,0,c.byref(size))
                    user=c.create_string_buffer(size.value)
                    self.assertTrue(adv.GetTokenInformation(token,1,user,size,c.byref(size)))
                    sid=c.cast(user,c.POINTER(w.LPVOID))[0]
                    self.assertTrue(adv.EqualSid(sid,ace.value+8))
                finally:
                    kernel.CloseHandle(token)
            finally:
                kernel.LocalFree(descriptor)

class PackagingGateTests(unittest.TestCase):
    def test_rejects_skip_and_placeholder_but_accepts_verified_shape(self):
        import subprocess
        gate = Path(__file__).resolve().parents[1]/"packaging"/"check-release.py"
        with tempfile.TemporaryDirectory() as root:
            recipe = Path(root)/"PKGBUILD"
            for checksum, expected in (("SKIP",1),("REPLACE_WITH_VERIFIED_SHA256",1),("a"*64,0)):
                recipe.write_text(f"sha256sums=('{checksum}')\n",encoding="utf-8")
                result = subprocess.run([sys.executable,str(gate),str(recipe)],capture_output=True,timeout=5)
                self.assertEqual(result.returncode,expected)
